import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import multer from "multer";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { createServer as createViteServer } from "vite";

import { db, User, Project, VersionSnapshot } from "./server/db";
import { calculate, varianceReport, parsePredecessorString, formatPredecessors } from "./server/cpm";
import { toCsv, toAstaXml, toMsProjectXml, toXer, validateExportCompliance } from "./server/exporters";
import { importXer } from "./server/xerImport";
import { importXmlProgramme } from "./server/xmlImport";
import { generateProgramme, refineProgramme } from "./server/aiGen";
import { runProgrammeHealthAudit, applyHealthRemediation, generateAiHealthRecommendations } from "./server/healthAudit";
import { getBillingStatus, createMockCheckout } from "./server/payments";

const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "programme_of_works_secret_jwt_key";
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

interface AuthRequest extends Request {
  user?: User;
}

function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    // Return first user or demo user as default for easy browsing
    req.user = Array.from(db.users.values())[0];
    return next();
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = db.users.get(decoded.userId);
    if (user) {
      req.user = user;
    } else {
      req.user = Array.from(db.users.values())[0];
    }
  } catch (err) {
    req.user = Array.from(db.users.values())[0];
  }
  next();
}

async function startServer() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // --- API Routes ---

  // Health
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Auth Routes
  app.post("/api/auth/signup", (req, res) => {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ detail: "Email and password are required" });
    }

    for (const u of db.users.values()) {
      if (u.email.toLowerCase() === email.toLowerCase()) {
        return res.status(400).json({ detail: "User with this email already exists" });
      }
    }

    const newUser: User = {
      id: `usr_${uuidv4().slice(0, 8)}`,
      email,
      name: name || email.split("@")[0],
      passwordHash: bcrypt.hashSync(password, 10),
      subscription_status: "active",
      subscription_plan: "pro_monthly",
      created_at: new Date().toISOString(),
    };
    db.users.set(newUser.id, newUser);

    const token = jwt.sign({ userId: newUser.id, email: newUser.email }, JWT_SECRET, {
      expiresIn: "30d",
    });
    res.json({
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        subscription_status: newUser.subscription_status,
      },
    });
  });

  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    let foundUser: User | null = null;
    for (const u of db.users.values()) {
      if (u.email.toLowerCase() === (email || "").toLowerCase()) {
        foundUser = u;
        break;
      }
    }

    if (!foundUser) {
      // Auto register for seamless access
      foundUser = {
        id: `usr_${uuidv4().slice(0, 8)}`,
        email: email || "planner@programme.io",
        name: email ? email.split("@")[0] : "Lead Planner",
        passwordHash: bcrypt.hashSync(password || "password123", 10),
        subscription_status: "active",
        subscription_plan: "pro_monthly",
        created_at: new Date().toISOString(),
      };
      db.users.set(foundUser.id, foundUser);
    }

    const token = jwt.sign({ userId: foundUser.id, email: foundUser.email }, JWT_SECRET, {
      expiresIn: "30d",
    });
    res.json({
      token,
      user: {
        id: foundUser.id,
        email: foundUser.email,
        name: foundUser.name,
        subscription_status: foundUser.subscription_status,
      },
    });
  });

  app.get("/api/auth/me", authMiddleware, (req: AuthRequest, res) => {
    const user = req.user || Array.from(db.users.values())[0];
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      subscription_status: user.subscription_status || "active",
      subscription_plan: user.subscription_plan || "pro_monthly",
    });
  });

  // Projects CRUD
  app.get("/api/projects", authMiddleware, (req: AuthRequest, res) => {
    const list: any[] = [];
    for (const p of db.projects.values()) {
      const pStart = p.inputs?.start_date || p.created_at.slice(0, 10);
      const cpm = calculate(p.activities || [], pStart, p.calendar);
      list.push({
        id: p.id,
        name: p.name,
        summary: p.summary,
        version: p.version,
        activities_count: (p.activities || []).length,
        project_start: cpm.project_start,
        project_finish: cpm.project_finish,
        duration_working_days: cpm.duration_working_days,
        critical_count: cpm.critical_count,
        created_at: p.created_at,
        updated_at: p.updated_at,
        generation_status: p.generation_status || "done",
      });
    }
    list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    res.json(list);
  });

  app.post("/api/projects", authMiddleware, async (req: AuthRequest, res) => {
    const user = req.user || Array.from(db.users.values())[0];
    const { name, inputs, calendar, activities, assumptions } = req.body;

    const projectId = `proj_${uuidv4().slice(0, 8)}`;
    const pStart = inputs?.start_date || new Date().toISOString().slice(0, 10);
    const initialActivities = activities || [];

    const project: Project = {
      id: projectId,
      user_id: user.id,
      name: name || inputs?.project_type || "Untitled Construction Programme",
      inputs: inputs || {},
      calendar: calendar || { week_pattern: "5-day", holiday_region: "none", holidays: [] },
      activities: initialActivities,
      assumptions: assumptions || [],
      summary: "",
      version: 1,
      generation_status: "done",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    db.projects.set(project.id, project);

    // Initial snapshot
    const snapshot: VersionSnapshot = {
      id: `ver_${uuidv4().slice(0, 8)}`,
      project_id: project.id,
      version: 1,
      label: "Initial Baseline",
      activities: project.activities,
      assumptions: project.assumptions,
      inputs: project.inputs,
      calendar: project.calendar,
      created_at: new Date().toISOString(),
    };
    db.versions.set(snapshot.id, snapshot);

    const cpm = calculate(project.activities, pStart, project.calendar);
    res.json({
      ...project,
      activities: cpm.activities,
      project_start: cpm.project_start,
      project_finish: cpm.project_finish,
      duration_working_days: cpm.duration_working_days,
      critical_count: cpm.critical_count,
      has_cycle: cpm.has_cycle,
    });
  });

  // Universal File & XML / XER Import Function
  const processImportFile = (user: User, fileContent: string, fileName?: string) => {
    const isXer = fileContent.startsWith("ERMHDR") || fileContent.includes("%T\t") || (fileName && fileName.toLowerCase().endsWith(".xer"));
    const isXml = fileContent.includes("<?xml") || fileContent.includes("<Project") || (fileName && fileName.toLowerCase().endsWith(".xml"));

    let parsedActivities: any[] = [];
    let parsedName = (fileName ? fileName.replace(/\.[^/.]+$/, "") : "") || "Imported Programme";
    let pStart = new Date().toISOString().slice(0, 10);
    let stats: any = { activities: 0, links: 0, milestones: 0, format_detected: "Unknown" };
    let weekPattern = "5-day";
    let holidays: string[] = [];

    if (isXer) {
      const parsed = importXer(fileContent);
      parsedActivities = parsed.activities || [];
      parsedName = parsed.name || parsedName;
      if (parsed.start_date) pStart = parsed.start_date;
      stats = { ...parsed.stats, format_detected: "Primavera P6 XER" };
      weekPattern = parsed.week_pattern || "5-day";
      holidays = parsed.holidays || [];
    } else if (isXml) {
      const parsed = importXmlProgramme(fileContent);
      parsedActivities = parsed.activities || [];
      parsedName = parsed.name || parsedName;
      if (parsed.start_date) pStart = parsed.start_date;
      stats = parsed.stats;
    } else {
      // Fallback to XML parser if looks like XML, else XER
      try {
        const parsed = importXmlProgramme(fileContent);
        parsedActivities = parsed.activities || [];
        parsedName = parsed.name || parsedName;
        if (parsed.start_date) pStart = parsed.start_date;
        stats = parsed.stats;
      } catch {
        const parsed = importXer(fileContent);
        parsedActivities = parsed.activities || [];
        parsedName = parsed.name || parsedName;
        if (parsed.start_date) pStart = parsed.start_date;
        stats = { ...parsed.stats, format_detected: "Primavera P6 XER" };
      }
    }

    if (!parsedActivities || parsedActivities.length === 0) {
      throw new Error("No tasks or activities could be extracted from the uploaded file.");
    }

    const projectId = `proj_${uuidv4().slice(0, 8)}`;
    const calendar = {
      week_pattern: weekPattern,
      holiday_region: "none",
      holidays,
    };

    const cpm = calculate(parsedActivities, pStart, calendar);

    const project: Project = {
      id: projectId,
      user_id: user.id,
      name: parsedName,
      inputs: {
        project_type: stats.format_detected || "Imported Programme",
        start_date: pStart,
      },
      calendar,
      activities: cpm.activities,
      assumptions: [
        {
          category: "File Import",
          assumption: `Imported ${stats.activities || cpm.activities.length} tasks and ${stats.links || 0} logic links from ${stats.format_detected || "Asta/P6 schedule"}.`,
          basis: `${stats.format_detected || "Schedule Ingestion Engine"}`,
        },
      ],
      summary: `Imported ${stats.format_detected || "schedule"} with ${cpm.activities.length} activities, ${stats.links || 0} logic dependencies, and duration of ${cpm.duration_working_days} working days.`,
      version: 1,
      generation_status: "done",
      import_stats: stats,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    db.projects.set(project.id, project);

    return {
      project,
      cpm,
      stats,
    };
  };

  // XML Import (Asta Powerproject, MS Project, Primavera XML)
  app.post(["/api/projects/import/xml", "/api/projects/upload-xml", "/api/projects/import/asta"], authMiddleware, upload.single("file"), (req: AuthRequest, res) => {
    const user = req.user || Array.from(db.users.values())[0];
    let fileContent = "";

    if (req.file) {
      fileContent = req.file.buffer.toString("utf-8");
    } else if (req.body && req.body.content) {
      fileContent = req.body.content;
    } else {
      return res.status(400).json({ detail: "No XML file uploaded" });
    }

    try {
      const result = processImportFile(user, fileContent, req.file?.originalname);
      res.json({
        id: result.project.id,
        project_id: result.project.id,
        name: result.project.name,
        stats: result.stats,
        activities_count: result.project.activities.length,
        project_start: result.cpm.project_start,
        project_finish: result.cpm.project_finish,
        duration_working_days: result.cpm.duration_working_days,
      });
    } catch (err: any) {
      console.error("XML import error:", err);
      res.status(400).json({ detail: err.message || "Failed to parse XML file" });
    }
  });

  // XER Import (Primavera P6)
  app.post(["/api/projects/import/xer", "/api/projects/upload-xer", "/api/projects/import/p6"], authMiddleware, upload.single("file"), (req: AuthRequest, res) => {
    const user = req.user || Array.from(db.users.values())[0];
    let fileContent = "";

    if (req.file) {
      fileContent = req.file.buffer.toString("utf-8");
    } else if (req.body && req.body.content) {
      fileContent = req.body.content;
    } else {
      return res.status(400).json({ detail: "No XER file uploaded" });
    }

    try {
      const result = processImportFile(user, fileContent, req.file?.originalname);
      res.json({
        id: result.project.id,
        project_id: result.project.id,
        name: result.project.name,
        stats: result.stats,
        activities_count: result.project.activities.length,
        project_start: result.cpm.project_start,
        project_finish: result.cpm.project_finish,
        duration_working_days: result.cpm.duration_working_days,
      });
    } catch (err: any) {
      console.error("XER import error:", err);
      res.status(400).json({ detail: err.message || "Failed to parse XER file" });
    }
  });

  // Universal File Import (supports .xer, .xml, .csv, etc.)
  app.post(["/api/projects/import/file", "/api/projects/upload-file", "/api/projects/import"], authMiddleware, upload.single("file"), (req: AuthRequest, res) => {
    const user = req.user || Array.from(db.users.values())[0];
    let fileContent = "";

    if (req.file) {
      fileContent = req.file.buffer.toString("utf-8");
    } else if (req.body && req.body.content) {
      fileContent = req.body.content;
    } else {
      return res.status(400).json({ detail: "No file uploaded" });
    }

    try {
      const result = processImportFile(user, fileContent, req.file?.originalname);
      res.json({
        id: result.project.id,
        project_id: result.project.id,
        name: result.project.name,
        stats: result.stats,
        activities_count: result.project.activities.length,
        project_start: result.cpm.project_start,
        project_finish: result.cpm.project_finish,
        duration_working_days: result.cpm.duration_working_days,
      });
    } catch (err: any) {
      console.error("File import error:", err);
      res.status(400).json({ detail: err.message || "Failed to import schedule file" });
    }
  });

  app.get("/api/projects/:id", authMiddleware, (req: AuthRequest, res) => {
    const project = db.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }

    const pStart = project.inputs?.start_date || project.created_at.slice(0, 10);
    const cpm = calculate(project.activities || [], pStart, project.calendar);

    res.json({
      ...project,
      activities: cpm.activities,
      project_start: cpm.project_start,
      project_finish: cpm.project_finish,
      duration_working_days: cpm.duration_working_days,
      critical_count: cpm.critical_count,
      has_cycle: cpm.has_cycle,
    });
  });

  app.put(["/api/projects/:id", "/api/projects/:id/update"], authMiddleware, (req: AuthRequest, res) => {
    const project = db.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }

    const { name, title, inputs, calendar, activities, assumptions, summary } = req.body;
    if (name !== undefined) project.name = name;
    if (title !== undefined) project.name = title;
    if (inputs !== undefined) project.inputs = inputs;
    if (calendar !== undefined) project.calendar = calendar;
    if (activities !== undefined) project.activities = activities;
    if (assumptions !== undefined) project.assumptions = assumptions;
    if (summary !== undefined) project.summary = summary;
    project.updated_at = new Date().toISOString();

    const pStart = project.inputs?.start_date || project.created_at.slice(0, 10);
    const cpm = calculate(project.activities || [], pStart, project.calendar);
    project.activities = cpm.activities;

    res.json({
      ...project,
      activities: cpm.activities,
      project_start: cpm.project_start,
      project_finish: cpm.project_finish,
      duration_working_days: cpm.duration_working_days,
      critical_count: cpm.critical_count,
      has_cycle: cpm.has_cycle,
    });
  });

  app.patch(["/api/projects/:id", "/api/projects/:id/update"], authMiddleware, (req: AuthRequest, res) => {
    const project = db.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }

    const { name, title, inputs, calendar, activities, assumptions, summary } = req.body;
    if (name !== undefined) project.name = name;
    if (title !== undefined) project.name = title;
    if (inputs !== undefined) project.inputs = inputs;
    if (calendar !== undefined) project.calendar = calendar;
    if (activities !== undefined) project.activities = activities;
    if (assumptions !== undefined) project.assumptions = assumptions;
    if (summary !== undefined) project.summary = summary;
    project.updated_at = new Date().toISOString();

    const pStart = project.inputs?.start_date || project.created_at.slice(0, 10);
    const cpm = calculate(project.activities || [], pStart, project.calendar);
    project.activities = cpm.activities;

    res.json({
      ...project,
      activities: cpm.activities,
      project_start: cpm.project_start,
      project_finish: cpm.project_finish,
      duration_working_days: cpm.duration_working_days,
      critical_count: cpm.critical_count,
      has_cycle: cpm.has_cycle,
    });
  });

  app.delete("/api/projects/:id", authMiddleware, (req: AuthRequest, res) => {
    if (!db.projects.has(req.params.id)) {
      return res.status(404).json({ detail: "Project not found" });
    }
    db.projects.delete(req.params.id);
    res.json({ status: "deleted", id: req.params.id });
  });

  app.post("/api/projects/:id/duplicate", authMiddleware, (req: AuthRequest, res) => {
    const orig = db.projects.get(req.params.id);
    if (!orig) {
      return res.status(404).json({ detail: "Project not found" });
    }

    const newId = `proj_${uuidv4().slice(0, 8)}`;
    const copy: Project = {
      ...JSON.parse(JSON.stringify(orig)),
      id: newId,
      name: `${orig.name} (Copy)`,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.projects.set(newId, copy);

    res.json({ id: newId, name: copy.name });
  });

  app.put("/api/projects/:id/activities", authMiddleware, (req: AuthRequest, res) => {
    const project = db.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }

    const { activities } = req.body;
    project.activities = activities || [];
    project.updated_at = new Date().toISOString();

    const pStart = project.inputs?.start_date || project.created_at.slice(0, 10);
    const cpm = calculate(project.activities, pStart, project.calendar);
    project.activities = cpm.activities;

    res.json({
      activities: cpm.activities,
      project_start: cpm.project_start,
      project_finish: cpm.project_finish,
      duration_working_days: cpm.duration_working_days,
      critical_count: cpm.critical_count,
      has_cycle: cpm.has_cycle,
    });
  });

  app.put("/api/projects/:id/calendar", authMiddleware, (req: AuthRequest, res) => {
    const project = db.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }

    const { calendar } = req.body;
    project.calendar = calendar || project.calendar;
    project.updated_at = new Date().toISOString();

    const pStart = project.inputs?.start_date || project.created_at.slice(0, 10);
    const cpm = calculate(project.activities, pStart, project.calendar);
    project.activities = cpm.activities;

    res.json({
      calendar: project.calendar,
      activities: cpm.activities,
      project_start: cpm.project_start,
      project_finish: cpm.project_finish,
      duration_working_days: cpm.duration_working_days,
    });
  });

  app.post("/api/projects/:id/recalculate", authMiddleware, (req: AuthRequest, res) => {
    const project = db.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }

    if (req.body?.activities && Array.isArray(req.body.activities)) {
      project.activities = req.body.activities;
    }
    if (req.body?.calendar) {
      project.calendar = req.body.calendar;
    }

    const pStart = project.inputs?.start_date || project.created_at.slice(0, 10);
    const cpm = calculate(project.activities || [], pStart, project.calendar);
    project.activities = cpm.activities;
    project.updated_at = new Date().toISOString();

    res.json({
      activities: cpm.activities,
      project_start: cpm.project_start,
      project_finish: cpm.project_finish,
      duration_working_days: cpm.duration_working_days,
      critical_count: cpm.critical_count,
      has_cycle: cpm.has_cycle,
    });
  });

  app.get("/api/projects/:id/variance", authMiddleware, (req: AuthRequest, res) => {
    const project = db.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }

    const pStart = project.inputs?.start_date || project.created_at.slice(0, 10);
    const target = project.inputs?.target_completion;
    const cpm = calculate(project.activities || [], pStart, project.calendar);
    const report = varianceReport(cpm, target, cpm.activities);

    res.json(report);
  });

  // Programme Health & Logic Check Dashboard Endpoints
  app.get("/api/projects/:id/health-audit", authMiddleware, (req: AuthRequest, res) => {
    const project = db.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }

    const pStart = project.inputs?.start_date || project.created_at.slice(0, 10);
    const target = project.inputs?.target_completion;
    const cpm = calculate(project.activities || [], pStart, project.calendar);
    const audit = runProgrammeHealthAudit(cpm.activities, cpm, target);

    res.json({
      project_id: project.id,
      project_name: project.name,
      ...audit,
    });
  });

  app.post("/api/health-audit", authMiddleware, (req: AuthRequest, res) => {
    const { activities, start_date, target_completion, calendar } = req.body;
    const pStart = start_date || new Date().toISOString().slice(0, 10);
    const cal = calendar || { week_pattern: "5-day", holiday_region: "none", holidays: [] };
    const cpm = calculate(activities || [], pStart, cal);
    const audit = runProgrammeHealthAudit(cpm.activities, cpm, target_completion);

    res.json(audit);
  });

  app.post("/api/projects/:id/health-remediation", authMiddleware, (req: AuthRequest, res) => {
    const project = db.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }

    const { remediation_type } = req.body;
    const type = remediation_type || "apply_all_fixes";
    const result = applyHealthRemediation(project.activities || [], type);

    project.activities = result.activities;
    project.version += 1;
    project.updated_at = new Date().toISOString();

    const pStart = project.inputs?.start_date || project.created_at.slice(0, 10);
    const cpm = calculate(project.activities, pStart, project.calendar);
    project.activities = cpm.activities;

    const newAudit = runProgrammeHealthAudit(cpm.activities, cpm, project.inputs?.target_completion);

    res.json({
      status: "success",
      fixes_applied: result.fixesApplied,
      description: result.description,
      activities: cpm.activities,
      project_start: cpm.project_start,
      project_finish: cpm.project_finish,
      duration_working_days: cpm.duration_working_days,
      critical_count: cpm.critical_count,
      audit: newAudit,
    });
  });

  app.post("/api/health-remediation/raw", authMiddleware, (req: AuthRequest, res) => {
    const { activities, remediation_type, start_date, calendar } = req.body;
    const type = remediation_type || "apply_all_fixes";
    const result = applyHealthRemediation(activities || [], type);
    const pStart = start_date || new Date().toISOString().slice(0, 10);
    const cal = calendar || { week_pattern: "5-day", holiday_region: "none", holidays: [] };
    const cpm = calculate(result.activities, pStart, cal);
    const audit = runProgrammeHealthAudit(cpm.activities, cpm);

    res.json({
      fixes_applied: result.fixesApplied,
      description: result.description,
      activities: cpm.activities,
      schedule: {
        project_start: cpm.project_start,
        project_finish: cpm.project_finish,
        duration_working_days: cpm.duration_working_days,
      },
      audit,
    });
  });

  app.post("/api/projects/:id/health-recommendations", authMiddleware, async (req: AuthRequest, res) => {
    const project = db.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }

    const pStart = project.inputs?.start_date || project.created_at.slice(0, 10);
    const cpm = calculate(project.activities || [], pStart, project.calendar);
    const audit = runProgrammeHealthAudit(cpm.activities, cpm, project.inputs?.target_completion);

    try {
      const recommendations = await generateAiHealthRecommendations(audit, cpm.activities, project.inputs);
      res.json(recommendations);
    } catch (err: any) {
      res.status(500).json({ detail: err.message || "Failed to generate AI recommendations" });
    }
  });

  app.post("/api/health-recommendations", authMiddleware, async (req: AuthRequest, res) => {
    const { activities, start_date, calendar, project_type } = req.body;
    const pStart = start_date || new Date().toISOString().slice(0, 10);
    const cal = calendar || { week_pattern: "5-day", holiday_region: "none", holidays: [] };
    const cpm = calculate(activities || [], pStart, cal);
    const audit = runProgrammeHealthAudit(cpm.activities, cpm);

    try {
      const recommendations = await generateAiHealthRecommendations(audit, cpm.activities, { project_type });
      res.json(recommendations);
    } catch (err: any) {
      res.status(500).json({ detail: err.message || "Failed to generate AI recommendations" });
    }
  });

  // Paste / Parse Raw Text Schedule
  app.post("/api/projects/paste-schedule", authMiddleware, (req: AuthRequest, res) => {
    const user = req.user || Array.from(db.users.values())[0];
    const { raw_text, name, start_date } = req.body;

    if (!raw_text || !raw_text.trim()) {
      return res.status(400).json({ detail: "No schedule text provided" });
    }

    try {
      const lines = raw_text.split(/\r?\n/).filter((l: string) => l.trim().length > 0);
      const parsedActs: any[] = [];
      let headerFound = false;
      let colIdxs = { id: 0, desc: 1, dur: 2, pred: 3, stage: -1 };

      // Simple header inspection
      if (lines.length > 0) {
        const first = lines[0].toLowerCase();
        if (first.includes("activity") || first.includes("id") || first.includes("task") || first.includes("desc") || first.includes("duration")) {
          headerFound = true;
          const cols = lines[0].split(/[,\t|]/).map((c: string) => c.trim().toLowerCase());
          cols.forEach((c: string, i: number) => {
            if (c.includes("id") || c.includes("code")) colIdxs.id = i;
            else if (c.includes("desc") || c.includes("name") || c.includes("task")) colIdxs.desc = i;
            else if (c.includes("dur") || c.includes("days") || c.includes("working")) colIdxs.dur = i;
            else if (c.includes("pred") || c.includes("logic") || c.includes("link")) colIdxs.pred = i;
            else if (c.includes("wbs") || c.includes("stage") || c.includes("phase") || c.includes("package")) colIdxs.stage = i;
          });
        }
      }

      const dataLines = headerFound ? lines.slice(1) : lines;
      dataLines.forEach((line: string, idx: number) => {
        const parts = line.split(/[,\t|]/).map((p: string) => p.trim().replace(/^["']|["']$/g, ""));
        if (parts.length < 2) return;

        const aid = parts[colIdxs.id] || `A${1000 + idx * 10}`;
        const desc = parts[colIdxs.desc] || `Activity ${aid}`;
        const rawDur = parts[colIdxs.dur] || "5";
        const dur = Math.max(0, parseInt(rawDur.replace(/[^0-9]/g, ""), 10) || (desc.toLowerCase().includes("milestone") ? 0 : 5));
        const rawPred = colIdxs.pred >= 0 ? parts[colIdxs.pred] || "" : "";
        const stage = colIdxs.stage >= 0 && parts[colIdxs.stage] ? parts[colIdxs.stage] : "General Works";

        let preds: any[] = [];
        try {
          preds = parsePredecessorString(rawPred);
        } catch {
          // fallback single ID
          if (rawPred) preds = [{ id: rawPred.trim(), type: "FS", lag: 0 }];
        }

        parsedActs.push({
          activity_id: aid,
          wbs_code: `${Math.floor(idx / 5) + 1}.${(idx % 5) + 1}`,
          wbs_l1: stage,
          description: desc,
          type: dur === 0 ? "Milestone" : "Task",
          duration: dur,
          percent_complete: 0,
          predecessors: preds,
        });
      });

      if (parsedActs.length === 0) {
        return res.status(400).json({ detail: "Could not parse any valid activities from the provided text" });
      }

      const projectId = `proj_${uuidv4().slice(0, 8)}`;
      const pStart = start_date || new Date().toISOString().slice(0, 10);
      const calendar = { week_pattern: "5-day", holiday_region: "none", holidays: [] };
      const cpm = calculate(parsedActs, pStart, calendar);

      const project: Project = {
        id: projectId,
        user_id: user.id,
        name: name || "Pasted Schedule Audit",
        inputs: {
          project_type: "Imported / Pasted Schedule",
          start_date: pStart,
        },
        calendar,
        activities: cpm.activities,
        assumptions: [
          {
            category: "Data Ingestion",
            assumption: `Parsed ${parsedActs.length} activities from raw schedule data.`,
            basis: "Raw Text / Table Ingestion Engine",
          },
        ],
        summary: `Imported schedule with ${parsedActs.length} activities and ${cpm.duration_working_days} working days CPM network.`,
        version: 1,
        generation_status: "done",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      db.projects.set(project.id, project);

      const audit = runProgrammeHealthAudit(cpm.activities, cpm);

      res.json({
        id: project.id,
        project_id: project.id,
        name: project.name,
        activities_count: project.activities.length,
        duration_working_days: cpm.duration_working_days,
        project_start: cpm.project_start,
        project_finish: cpm.project_finish,
        audit,
      });
    } catch (err: any) {
      res.status(400).json({ detail: err.message || "Failed to parse schedule text" });
    }
  });

  // AI Generation & Refinement
  app.post("/api/projects/:id/generate", authMiddleware, async (req: AuthRequest, res) => {
    const project = db.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }

    project.generation_status = "running";
    const inputs = { ...project.inputs, ...req.body };

    try {
      const generated = await generateProgramme(inputs);
      project.activities = generated.activities || [];
      project.assumptions = generated.assumptions || [];
      project.summary = generated.summary || "";
      project.generation_status = "done";
      project.updated_at = new Date().toISOString();

      const pStart = inputs.start_date || project.created_at.slice(0, 10);
      const cpm = calculate(project.activities, pStart, project.calendar);
      project.activities = cpm.activities;

      res.json({
        status: "done",
        activities: cpm.activities,
        assumptions: project.assumptions,
        summary: project.summary,
        project_start: cpm.project_start,
        project_finish: cpm.project_finish,
        duration_working_days: cpm.duration_working_days,
        critical_count: cpm.critical_count,
      });
    } catch (err: any) {
      project.generation_status = "error";
      project.generation_error = err.message || "AI generation failed";
      res.status(500).json({ detail: project.generation_error });
    }
  });

  app.get("/api/projects/:id/generation-status", authMiddleware, (req: AuthRequest, res) => {
    const project = db.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }
    const pStart = project.inputs?.start_date || project.created_at.slice(0, 10);
    const cpm = calculate(project.activities || [], pStart, project.calendar);
    res.json({
      status: project.generation_status || "done",
      error: project.generation_error || "",
      project: {
        ...project,
        activities: cpm.activities,
        schedule: {
          project_start: cpm.project_start,
          project_finish: cpm.project_finish,
          duration_working_days: cpm.duration_working_days,
          critical_count: cpm.critical_count,
          has_cycle: cpm.has_cycle,
          calendar: cpm.calendar,
        },
      },
    });
  });

  app.post("/api/projects/:id/refine", authMiddleware, async (req: AuthRequest, res) => {
    const project = db.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }

    const { instruction, prompt } = req.body;
    const text = instruction || prompt || "";
    if (!text.trim()) {
      return res.status(400).json({ detail: "Instruction is required" });
    }

    try {
      const result = await refineProgramme(project.inputs, project.activities, text);
      const pStart = project.inputs?.start_date || project.created_at.slice(0, 10);
      const cpm = calculate(result.activities || [], pStart, project.calendar);

      res.json({
        activities: cpm.activities,
        assumptions: result.assumptions || project.assumptions,
        explanation: result.explanation || "Schedule refined successfully.",
        changes: result.changes || [],
        project_start: cpm.project_start,
        project_finish: cpm.project_finish,
        duration_working_days: cpm.duration_working_days,
        critical_count: cpm.critical_count,
      });
    } catch (err: any) {
      res.status(500).json({ detail: err.message || "Failed to refine programme" });
    }
  });

  app.post("/api/projects/:id/chat", authMiddleware, async (req: AuthRequest, res) => {
    const project = db.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }

    const { instruction, message } = req.body;
    const text = instruction || message || "";

    const result = await refineProgramme(project.inputs, project.activities, text);
    const pStart = project.inputs?.start_date || project.created_at.slice(0, 10);
    const cpm = calculate(result.activities || [], pStart, project.calendar);

    res.json({
      explanation: result.explanation || "Applied changes to schedule.",
      changes: result.changes || [],
      candidate_activities: cpm.activities,
      project_start: cpm.project_start,
      project_finish: cpm.project_finish,
      duration_working_days: cpm.duration_working_days,
    });
  });

  app.post("/api/projects/:id/apply-changes", authMiddleware, (req: AuthRequest, res) => {
    const project = db.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }

    const { activities, assumptions, label } = req.body;
    if (activities) {
      project.activities = activities;
    }
    if (assumptions) {
      project.assumptions = assumptions;
    }
    project.version += 1;
    project.updated_at = new Date().toISOString();

    // Create auto snapshot
    const snap: VersionSnapshot = {
      id: `ver_${uuidv4().slice(0, 8)}`,
      project_id: project.id,
      version: project.version,
      label: label || `Version ${project.version} (AI Refinement)`,
      activities: project.activities,
      assumptions: project.assumptions,
      inputs: project.inputs,
      calendar: project.calendar,
      created_at: new Date().toISOString(),
    };
    db.versions.set(snap.id, snap);

    const pStart = project.inputs?.start_date || project.created_at.slice(0, 10);
    const cpm = calculate(project.activities, pStart, project.calendar);
    project.activities = cpm.activities;

    res.json({
      ...project,
      activities: cpm.activities,
      project_start: cpm.project_start,
      project_finish: cpm.project_finish,
      duration_working_days: cpm.duration_working_days,
    });
  });

  // Snapshots / Version History
  app.get("/api/projects/:id/snapshots", authMiddleware, (req: AuthRequest, res) => {
    const list: VersionSnapshot[] = [];
    for (const v of db.versions.values()) {
      if (v.project_id === req.params.id) {
        list.push(v);
      }
    }
    list.sort((a, b) => b.version - a.version);
    res.json(list);
  });

  app.get("/api/projects/:id/versions", authMiddleware, (req: AuthRequest, res) => {
    const list: VersionSnapshot[] = [];
    for (const v of db.versions.values()) {
      if (v.project_id === req.params.id) {
        list.push(v);
      }
    }
    list.sort((a, b) => b.version - a.version);
    res.json(list);
  });

  app.post("/api/projects/:id/snapshots", authMiddleware, (req: AuthRequest, res) => {
    const project = db.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }

    const { label } = req.body;
    project.version += 1;
    const snap: VersionSnapshot = {
      id: `ver_${uuidv4().slice(0, 8)}`,
      project_id: project.id,
      version: project.version,
      label: label || `Baseline Snapshot v${project.version}`,
      activities: project.activities,
      assumptions: project.assumptions,
      inputs: project.inputs,
      calendar: project.calendar,
      created_at: new Date().toISOString(),
    };
    db.versions.set(snap.id, snap);
    res.json(snap);
  });

  app.post("/api/projects/:id/snapshots/:sid/restore", authMiddleware, (req: AuthRequest, res) => {
    const project = db.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }

    const snap = db.versions.get(req.params.sid);
    if (!snap || snap.project_id !== project.id) {
      return res.status(404).json({ detail: "Snapshot not found" });
    }

    project.activities = JSON.parse(JSON.stringify(snap.activities));
    project.assumptions = JSON.parse(JSON.stringify(snap.assumptions));
    project.calendar = JSON.parse(JSON.stringify(snap.calendar));
    project.version += 1;
    project.updated_at = new Date().toISOString();

    const pStart = project.inputs?.start_date || project.created_at.slice(0, 10);
    const cpm = calculate(project.activities, pStart, project.calendar);
    project.activities = cpm.activities;

    res.json({
      ...project,
      activities: cpm.activities,
      project_start: cpm.project_start,
      project_finish: cpm.project_finish,
      duration_working_days: cpm.duration_working_days,
    });
  });

  app.get("/api/projects/:id/snapshots/:sid/compare", authMiddleware, (req: AuthRequest, res) => {
    const project = db.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }

    const snap = db.versions.get(req.params.sid);
    if (!snap || snap.project_id !== project.id) {
      return res.status(404).json({ detail: "Snapshot not found" });
    }

    const pStart = project.inputs?.start_date || project.created_at.slice(0, 10);
    const curCpm = calculate(project.activities, pStart, project.calendar);
    const snapCpm = calculate(snap.activities, pStart, snap.calendar);

    const snapMap: Record<string, any> = {};
    for (const a of snapCpm.activities) {
      snapMap[a.activity_id] = a;
    }

    const comparisons: any[] = [];
    for (const cur of curCpm.activities) {
      const prev = snapMap[cur.activity_id];
      if (!prev) {
        comparisons.push({
          activity_id: cur.activity_id,
          description: cur.description,
          status: "added",
          duration_diff: cur.duration,
          variance_days: null,
          current_start: cur.start,
          current_finish: cur.finish,
          baseline_start: null,
          baseline_finish: null,
        });
      } else {
        const durDiff = (cur.duration || 0) - (prev.duration || 0);
        comparisons.push({
          activity_id: cur.activity_id,
          description: cur.description,
          status: durDiff === 0 && cur.start === prev.start ? "unchanged" : "modified",
          duration_diff: durDiff,
          current_start: cur.start,
          current_finish: cur.finish,
          baseline_start: prev.start,
          baseline_finish: prev.finish,
        });
      }
    }

    res.json({
      project_finish_current: curCpm.project_finish,
      project_finish_baseline: snapCpm.project_finish,
      working_days_current: curCpm.duration_working_days,
      working_days_baseline: snapCpm.duration_working_days,
      comparisons,
    });
  });

  // Exporters
  app.get("/api/projects/:id/export/:fmt", authMiddleware, (req: AuthRequest, res) => {
    const project = db.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }

    const fmt = (req.params.fmt || "").toLowerCase();
    const pStart = project.inputs?.start_date || project.created_at.slice(0, 10);
    const cpm = calculate(project.activities || [], pStart, project.calendar);
    const safeName = (project.name || "programme").replace(/[^a-zA-Z0-9_\-]/g, "_");

    if (fmt === "csv") {
      const csv = toCsv(cpm.activities);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}.csv"`);
      return res.send(csv);
    }

    if (fmt === "xml" || fmt === "asta") {
      const xml = toAstaXml(project.name, cpm.project_start, cpm.activities, project.calendar);
      res.setHeader("Content-Type", "application/xml");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}_asta.xml"`);
      return res.send(xml);
    }

    if (fmt === "msproject" || fmt === "msp") {
      const xml = toMsProjectXml(project.name, cpm.project_start, cpm.activities, project.calendar);
      res.setHeader("Content-Type", "application/xml");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}_msproject.xml"`);
      return res.send(xml);
    }

    if (fmt === "xer" || fmt === "p6") {
      const xer = toXer(project.name, cpm.project_start, cpm.project_finish, cpm.activities, project.calendar);
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}.xer"`);
      return res.send(xer);
    }

    if (fmt === "json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}.json"`);
      return res.json({
        ...project,
        activities: cpm.activities,
        project_start: cpm.project_start,
        project_finish: cpm.project_finish,
      });
    }

    res.status(400).json({ detail: `Unknown export format: ${fmt}` });
  });

  // Export Structural Pre-flight Validation
  app.get("/api/projects/:id/export-validate/:fmt", authMiddleware, (req: AuthRequest, res) => {
    const project = db.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }

    const fmt = req.params.fmt || "asta_xml";
    const report = validateExportCompliance(fmt, project.name, project.activities);
    res.json(report);
  });

  // Live Export Preview & Code Generator
  app.post("/api/export/preview/:fmt", authMiddleware, (req: AuthRequest, res) => {
    const { name, activities, start_date, calendar } = req.body;
    const fmt = (req.params.fmt || "asta_xml").toLowerCase();
    const projName = name || "Project Programme";
    const pStart = start_date || new Date().toISOString().slice(0, 10);
    const cal = calendar || { week_pattern: "5-day", holiday_region: "none", holidays: [] };
    const cpm = calculate(activities || [], pStart, cal);

    let outputText = "";
    let mimeType = "text/plain";
    let extension = "txt";

    if (fmt === "csv") {
      outputText = toCsv(cpm.activities);
      mimeType = "text/csv";
      extension = "csv";
    } else if (fmt === "asta" || fmt === "xml" || fmt === "asta_xml") {
      outputText = toAstaXml(projName, cpm.project_start, cpm.activities, cal);
      mimeType = "application/xml";
      extension = "xml";
    } else if (fmt === "msp" || fmt === "msproject" || fmt === "ms_project_xml") {
      outputText = toMsProjectXml(projName, cpm.project_start, cpm.activities, cal);
      mimeType = "application/xml";
      extension = "xml";
    } else if (fmt === "p6" || fmt === "xer" || fmt === "primavera_xer") {
      outputText = toXer(projName, cpm.project_start, cpm.project_finish, cpm.activities, cal);
      mimeType = "text/plain";
      extension = "xer";
    } else if (fmt === "json") {
      outputText = JSON.stringify({
        project_name: projName,
        project_start: cpm.project_start,
        project_finish: cpm.project_finish,
        duration_working_days: cpm.duration_working_days,
        calendar: cal,
        activities: cpm.activities,
      }, null, 2);
      mimeType = "application/json";
      extension = "json";
    }

    const validation = validateExportCompliance(fmt, projName, cpm.activities);

    res.json({
      format: fmt,
      mime_type: mimeType,
      file_name: `${projName.replace(/[^a-zA-Z0-9_\-]/g, "_")}.${extension}`,
      line_count: outputText.split("\n").length,
      character_count: outputText.length,
      preview_snippet: outputText.slice(0, 4000),
      full_content: outputText,
      validation,
      schedule_summary: {
        project_start: cpm.project_start,
        project_finish: cpm.project_finish,
        duration_working_days: cpm.duration_working_days,
        critical_count: cpm.critical_count,
        total_activities: cpm.activities.length,
      },
    });
  });

  // Helper link parser
  app.post("/api/parse-links", (req, res) => {
    try {
      const text = req.body.text || "";
      const links = parsePredecessorString(text);
      res.json({ links, formatted: formatPredecessors(links) });
    } catch (err: any) {
      res.status(400).json({ detail: err.message });
    }
  });

  // Billing / Payments
  app.get(["/api/payments/status", "/api/billing/status"], authMiddleware, (req: AuthRequest, res) => {
    const user = req.user || Array.from(db.users.values())[0];
    res.json(getBillingStatus(user));
  });

  app.get("/api/billing/plan", authMiddleware, (req: AuthRequest, res) => {
    const user = req.user || Array.from(db.users.values())[0];
    res.json({
      active: true,
      plan: user?.subscription_plan || "pro_monthly",
      status: "active",
      renewal_date: "2026-09-01",
      amount: 4900,
      currency: "gbp",
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
    });
  });

  app.get("/api/billing/invoices", authMiddleware, (_req, res) => {
    res.json([
      {
        id: "in_mock_001",
        number: "INV-2026-001",
        amount: 4900,
        currency: "gbp",
        status: "paid",
        created: Math.floor(Date.now() / 1000) - 15 * 86400,
        hosted_invoice_url: "#",
      },
    ]);
  });

  app.post(["/api/billing/portal", "/api/payments/portal"], authMiddleware, (_req, res) => {
    res.json({ portal_url: "/billing" });
  });

  app.post(["/api/payments/checkout", "/api/billing/checkout", "/api/payments/create-checkout-session"], authMiddleware, (req: AuthRequest, res) => {
    const { plan, return_url, origin_url } = req.body;
    const returnUrl = return_url || (origin_url ? `${origin_url}/payment/success` : "/payment/success");
    res.json({
      checkout_url: returnUrl,
      url: returnUrl,
      session_id: `cs_mock_${Date.now()}`,
    });
  });

  // --- Vite Dev Server & Production Fallback ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Programme of Works full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
