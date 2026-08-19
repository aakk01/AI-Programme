import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { calculate } from "./cpm";

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  subscription_status?: string;
  subscription_plan?: string;
  created_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  inputs: Record<string, any>;
  calendar: Record<string, any>;
  activities: any[];
  assumptions: any[];
  summary: string;
  version: number;
  generation_status?: string;
  generation_error?: string;
  created_at: string;
  updated_at: string;
  import_stats?: any;
}

export interface VersionSnapshot {
  id: string;
  project_id: string;
  version: number;
  label: string;
  activities: any[];
  assumptions: any[];
  inputs: Record<string, any>;
  calendar: Record<string, any>;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  project_id: string;
  instruction: string;
  explanation: string;
  changes: any[];
  created_at: string;
}

class InMemoryDb {
  users: Map<string, User> = new Map();
  projects: Map<string, Project> = new Map();
  versions: Map<string, VersionSnapshot> = new Map();
  chats: Map<string, ChatMessage> = new Map();

  constructor() {
    this.seedDemoData();
  }

  private seedDemoData() {
    const demoUser: User = {
      id: "usr_demo_planner",
      email: "planner@programme.io",
      name: "Lead Planner",
      passwordHash: bcrypt.hashSync("password123", 10),
      subscription_status: "active",
      subscription_plan: "pro_monthly",
      created_at: new Date().toISOString(),
    };
    this.users.set(demoUser.id, demoUser);

    const projectStart = new Date().toISOString().slice(0, 10);
    const demoActivities = [
      {
        activity_id: "A1000",
        stage: "Preliminaries",
        wbs_code: "1.1",
        wbs_l1: "Preliminaries",
        wbs_l2: "Site Handover",
        description: "Notice to Proceed & Site Access",
        type: "Milestone",
        duration: 0,
        percent_complete: 100,
        progress: 100,
        predecessors: [],
      },
      {
        activity_id: "A1010",
        stage: "Preliminaries",
        wbs_code: "1.2",
        wbs_l1: "Preliminaries",
        wbs_l2: "Site Establishment",
        description: "Erect Site Hoarding, Logistics & Security",
        type: "Task",
        duration: 10,
        percent_complete: 100,
        progress: 100,
        predecessors: [{ id: "A1000", type: "FS", lag: 0 }],
      },
      {
        activity_id: "A1020",
        stage: "Preliminaries",
        wbs_code: "1.2",
        wbs_l1: "Preliminaries",
        wbs_l2: "Site Establishment",
        description: "Install Temporary Utilities & Welfare Facilities",
        type: "Task",
        duration: 15,
        percent_complete: 100,
        progress: 100,
        predecessors: [{ id: "A1010", type: "SS", lag: 3 }],
      },
      {
        activity_id: "A1030",
        stage: "Preliminaries",
        wbs_code: "1.3",
        wbs_l1: "Preliminaries",
        wbs_l2: "Consents",
        description: "Planning & Section 61 Discharge Approval",
        type: "Milestone",
        duration: 0,
        percent_complete: 100,
        progress: 100,
        predecessors: [{ id: "A1010", type: "FS", lag: 5 }],
      },
      {
        activity_id: "B1000",
        stage: "Substructure",
        wbs_code: "2.1",
        wbs_l1: "Substructure",
        wbs_l2: "Earthworks",
        description: "Bulk Excavation & Ground Reduction",
        type: "Task",
        duration: 18,
        percent_complete: 100,
        progress: 100,
        predecessors: [
          { id: "A1020", type: "FS", lag: 0 },
          { id: "A1030", type: "FS", lag: 0 },
        ],
      },
      {
        activity_id: "B1010",
        stage: "Substructure",
        wbs_code: "2.2",
        wbs_l1: "Substructure",
        wbs_l2: "Piling",
        description: "CFA Piling & Pile Integrity Testing",
        type: "Task",
        duration: 22,
        percent_complete: 85,
        progress: 85,
        predecessors: [{ id: "B1000", type: "SS", lag: 4 }],
      },
      {
        activity_id: "B1020",
        stage: "Substructure",
        wbs_code: "2.3",
        wbs_l1: "Substructure",
        wbs_l2: "Foundations",
        description: "Pile Caps, Ground Beams & RC Basement Slab",
        type: "Task",
        duration: 26,
        percent_complete: 50,
        progress: 50,
        predecessors: [{ id: "B1010", type: "FS", lag: 0 }],
      },
      {
        activity_id: "C1000",
        stage: "Superstructure",
        wbs_code: "3.1",
        wbs_l1: "Superstructure",
        wbs_l2: "Frame",
        description: "Cast Reinforced Concrete Cores & Columns (L1 - L4)",
        type: "Task",
        duration: 28,
        percent_complete: 20,
        progress: 20,
        predecessors: [{ id: "B1020", type: "FS", lag: 0 }],
      },
      {
        activity_id: "C1010",
        stage: "Superstructure",
        wbs_code: "3.2",
        wbs_l1: "Superstructure",
        wbs_l2: "Frame",
        description: "Post-Tensioned Slabs & Roof Parapet Works",
        type: "Task",
        duration: 20,
        percent_complete: 0,
        progress: 0,
        predecessors: [{ id: "C1000", type: "SS", lag: 8 }],
      },
      {
        activity_id: "C1020",
        stage: "Superstructure",
        wbs_code: "3.3",
        wbs_l1: "Superstructure",
        wbs_l2: "Milestone",
        description: "Building Structure Topped Out Milestone",
        type: "Milestone",
        duration: 0,
        percent_complete: 0,
        progress: 0,
        predecessors: [
          { id: "C1000", type: "FS", lag: 0 },
          { id: "C1010", type: "FS", lag: 0 },
        ],
      },
      {
        activity_id: "D1000",
        stage: "Façade & Envelope",
        wbs_code: "4.1",
        wbs_l1: "Façade & Envelope",
        wbs_l2: "Glazing",
        description: "Unitised Curtain Walling, Windows & Louvres",
        type: "Task",
        duration: 22,
        percent_complete: 0,
        progress: 0,
        predecessors: [{ id: "C1020", type: "FS", lag: 0 }],
      },
      {
        activity_id: "D1010",
        stage: "Façade & Envelope",
        wbs_code: "4.2",
        wbs_l1: "Façade & Envelope",
        wbs_l2: "Roofing",
        description: "Inverted Roof Membrane, Insulation & Green Roof",
        type: "Task",
        duration: 16,
        percent_complete: 0,
        progress: 0,
        predecessors: [{ id: "C1020", type: "FS", lag: 0 }],
      },
      {
        activity_id: "D1020",
        stage: "Façade & Envelope",
        wbs_code: "4.3",
        wbs_l1: "Façade & Envelope",
        wbs_l2: "Milestone",
        description: "Weathertight Building Envelope Milestone",
        type: "Milestone",
        duration: 0,
        percent_complete: 0,
        progress: 0,
        predecessors: [
          { id: "D1000", type: "FS", lag: 0 },
          { id: "D1010", type: "FS", lag: 0 },
        ],
      },
      {
        activity_id: "E1000",
        stage: "Internal Fit-Out & MEP",
        wbs_code: "5.1",
        wbs_l1: "Internal Fit-Out & MEP",
        wbs_l2: "1st Fix MEP",
        description: "1st Fix Mechanical, Electrical & Public Health Distribution",
        type: "Task",
        duration: 12,
        percent_complete: 0,
        progress: 0,
        predecessors: [{ id: "D1020", type: "FS", lag: 0 }],
      },
      {
        activity_id: "E1010",
        stage: "Internal Fit-Out & MEP",
        wbs_code: "5.2",
        wbs_l1: "Internal Fit-Out & MEP",
        wbs_l2: "Partitions",
        description: "Drylining, Metal Stud Partitions & Ceilings",
        type: "Task",
        duration: 10,
        percent_complete: 0,
        progress: 0,
        predecessors: [{ id: "E1000", type: "SS", lag: 4 }],
      },
      {
        activity_id: "E1020",
        stage: "Internal Fit-Out & MEP",
        wbs_code: "5.3",
        wbs_l1: "Internal Fit-Out & MEP",
        wbs_l2: "Finishes",
        description: "Architectural Finishes, Floor Coverings & 2nd Fix MEP",
        type: "Task",
        duration: 8,
        percent_complete: 0,
        progress: 0,
        predecessors: [
          { id: "E1000", type: "FS", lag: 0 },
          { id: "E1010", type: "FS", lag: 0 },
        ],
      },
      {
        activity_id: "F1000",
        stage: "Commissioning & Handover",
        wbs_code: "6.1",
        wbs_l1: "Commissioning & Handover",
        wbs_l2: "Milestone",
        description: "Practical Completion & Client Handover Milestone",
        type: "Milestone",
        duration: 0,
        percent_complete: 0,
        progress: 0,
        predecessors: [{ id: "E1020", type: "FS", lag: 0 }],
      },
    ];

    // Precalculate CPM network
    const cpmResult = calculate(demoActivities, projectStart, {
      week_pattern: "5-day",
      holiday_region: "UK",
      custom_holidays: [],
    });

    const demoProject: Project = {
      id: "proj_commercial_baseline",
      user_id: demoUser.id,
      name: "High-Spec Commercial Office Baseline",
      inputs: {
        project_type: "Commercial Office Fit-Out & New Build",
        gia: 12500,
        gia_unit: "sqm",
        floors: 6,
        budget: 18500000,
        currency: "GBP",
        start_date: projectStart,
        procurement: "Design & Build (JCT)",
        long_lead_items: "Curtain Walling, Chillers, Switchgear",
        site_constraints: "City Centre logistics, restricted delivery hours",
      },
      calendar: {
        week_pattern: "5-day",
        holiday_region: "UK",
        holidays: [],
      },
      activities: cpmResult.activities,
      assumptions: [
        {
          category: "Logistics",
          assumption: "City center access allows deliveries between 07:00 and 19:00.",
          basis: "Planning Consent Condition 4",
        },
        {
          category: "Programme Logic",
          assumption: "Internal fitout starts immediately following weathertight milestone.",
          basis: "Trade contractor envelope warranty requirements",
        },
      ],
      summary:
        "Comprehensive 6-storey commercial building programme featuring closed CPM logic, trade overlaps, key procurement gates, and practical completion milestones.",
      version: 1,
      generation_status: "done",
      generation_error: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.projects.set(demoProject.id, demoProject);
  }
}

export const db = new InMemoryDb();
