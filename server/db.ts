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
        wbs_code: "1.1",
        wbs_l1: "Preliminaries",
        wbs_l2: "Site Handover",
        description: "Notice to Proceed & Site Access",
        type: "Milestone",
        duration: 0,
        predecessors: [],
      },
      {
        activity_id: "A1010",
        wbs_code: "1.2",
        wbs_l1: "Preliminaries",
        wbs_l2: "Site Establishment",
        description: "Erect Site Hoarding & Security",
        type: "Task",
        duration: 10,
        predecessors: [{ id: "A1000", type: "FS", lag: 0 }],
      },
      {
        activity_id: "A1020",
        wbs_code: "1.2",
        wbs_l1: "Preliminaries",
        wbs_l2: "Site Establishment",
        description: "Install Temporary Utilities & Welfare Facilities",
        type: "Task",
        duration: 15,
        predecessors: [{ id: "A1010", type: "SS", lag: 3 }],
      },
      {
        activity_id: "A1030",
        wbs_code: "1.3",
        wbs_l1: "Preliminaries",
        wbs_l2: "Consents",
        description: "Planning & Section 61 Discharge Approval",
        type: "Milestone",
        duration: 0,
        predecessors: [{ id: "A1010", type: "FS", lag: 5 }],
      },
      {
        activity_id: "B1000",
        wbs_code: "2.1",
        wbs_l1: "Substructure",
        wbs_l2: "Earthworks",
        description: "Bulk Excavation & Ground Reduction",
        type: "Task",
        duration: 20,
        predecessors: [
          { id: "A1020", type: "FS", lag: 0 },
          { id: "A1030", type: "FS", lag: 0 },
        ],
      },
      {
        activity_id: "B1010",
        wbs_code: "2.2",
        wbs_l1: "Substructure",
        wbs_l2: "Piling",
        description: "CFA Piling & Pile Integrity Testing",
        type: "Task",
        duration: 25,
        predecessors: [{ id: "B1000", type: "SS", lag: 5 }],
      },
      {
        activity_id: "B1020",
        wbs_code: "2.3",
        wbs_l1: "Substructure",
        wbs_l2: "Foundations",
        description: "Pile Caps, Ground Beams & RC Basement Slab",
        type: "Task",
        duration: 30,
        predecessors: [{ id: "B1010", type: "FS", lag: 0 }],
      },
      {
        activity_id: "C1000",
        wbs_code: "3.1",
        wbs_l1: "Superstructure",
        wbs_l2: "Frame",
        description: "Cast Concrete Cores & Columns (L1 - L4)",
        type: "Task",
        duration: 35,
        predecessors: [{ id: "B1020", type: "FS", lag: 0 }],
      },
      {
        activity_id: "C1010",
        wbs_code: "3.2",
        wbs_l1: "Superstructure",
        wbs_l2: "Frame",
        description: "Post-Tensioned Slabs & Roof Parapet",
        type: "Task",
        duration: 25,
        predecessors: [{ id: "C1000", type: "SS", lag: 10 }],
      },
      {
        activity_id: "C1020",
        wbs_code: "3.3",
        wbs_l1: "Superstructure",
        wbs_l2: "Milestone",
        description: "Building Structure Topped Out",
        type: "Milestone",
        duration: 0,
        predecessors: [{ id: "C1010", type: "FS", lag: 0 }],
      },
      {
        activity_id: "D1000",
        wbs_code: "4.1",
        wbs_l1: "Façade & Envelope",
        wbs_l2: "Glazing",
        description: "Unitised Curtain Walling & Windows",
        type: "Task",
        duration: 40,
        predecessors: [{ id: "C1020", type: "SS", lag: -10 }],
      },
      {
        activity_id: "D1010",
        wbs_code: "4.2",
        wbs_l1: "Façade & Envelope",
        wbs_l2: "Roofing",
        description: "Inverted Roof Membrane, Insulation & Green Roof",
        type: "Task",
        duration: 20,
        predecessors: [{ id: "C1020", type: "FS", lag: 0 }],
      },
      {
        activity_id: "D1020",
        wbs_code: "4.3",
        wbs_l1: "Façade & Envelope",
        wbs_l2: "Milestone",
        description: "Weathertight Milestone Achieved",
        type: "Milestone",
        duration: 0,
        predecessors: [
          { id: "D1000", type: "FS", lag: 0 },
          { id: "D1010", type: "FS", lag: 0 },
        ],
      },
      {
        activity_id: "E1000",
        wbs_code: "5.1",
        wbs_l1: "Internal Fit-Out & MEP",
        wbs_l2: "1st Fix MEP",
        description: "1st Fix Mechanical, Electrical & Public Health",
        type: "Task",
        duration: 30,
        predecessors: [{ id: "D1020", type: "FS", lag: 0 }],
      },
      {
        activity_id: "E1010",
        wbs_code: "5.2",
        wbs_l1: "Internal Fit-Out & MEP",
        wbs_l2: "Partitions",
        description: "Drylining, Metal Stud Partitions & Ceilings",
        type: "Task",
        duration: 25,
        predecessors: [{ id: "E1000", type: "SS", lag: 7 }],
      },
      {
        activity_id: "E1020",
        wbs_code: "5.3",
        wbs_l1: "Internal Fit-Out & MEP",
        wbs_l2: "2nd Fix MEP",
        description: "2nd Fix MEP, Lighting & Sanitaryware",
        type: "Task",
        duration: 20,
        predecessors: [{ id: "E1010", type: "FS", lag: 0 }],
      },
      {
        activity_id: "E1030",
        wbs_code: "5.4",
        wbs_l1: "Internal Fit-Out & MEP",
        wbs_l2: "Finishes",
        description: "Flooring, Joinery & Final Architectural Finishes",
        type: "Task",
        duration: 15,
        predecessors: [{ id: "E1020", type: "SS", lag: 5 }],
      },
      {
        activity_id: "F1000",
        wbs_code: "6.1",
        wbs_l1: "Commissioning & Handover",
        wbs_l2: "Testing",
        description: "MEP Testing, Balancing & Integrated System Testing",
        type: "Task",
        duration: 15,
        predecessors: [
          { id: "E1020", type: "FS", lag: 0 },
          { id: "E1030", type: "FS", lag: 0 },
        ],
      },
      {
        activity_id: "F1010",
        wbs_code: "6.2",
        wbs_l1: "Commissioning & Handover",
        wbs_l2: "Inspections",
        description: "Building Control, Fire Authority & Client Snagging",
        type: "Task",
        duration: 10,
        predecessors: [{ id: "F1000", type: "FS", lag: 0 }],
      },
      {
        activity_id: "F1020",
        wbs_code: "6.3",
        wbs_l1: "Commissioning & Handover",
        wbs_l2: "Milestone",
        description: "Practical Completion & Client Handover",
        type: "Milestone",
        duration: 0,
        predecessors: [{ id: "F1010", type: "FS", lag: 0 }],
      },
    ];

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
      activities: demoActivities,
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
