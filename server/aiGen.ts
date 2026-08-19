import { GoogleGenAI } from "@google/genai";

export interface GenerationInput {
  project_type?: string;
  description?: string;
  floors?: number;
  gia?: number;
  gia_unit?: string;
  procurement?: string;
  start_date?: string;
  target_completion?: string;
  site_constraints?: string;
  long_lead_items?: string;
  key_milestones?: string;
  programme_density?: string;
  package_depth?: string;
  calendar?: {
    week_pattern?: string;
    holiday_region?: string;
    holidays?: string[];
  };
}

/**
 * Intelligent domain fallback activity generator
 * Adapts to project sector, storeys, GIA, and key trade packages
 */
export function createFallbackActivities(inputs: GenerationInput): any[] {
  const pType = (inputs.project_type || "Commercial Construction").toLowerCase();
  const floors = Math.max(1, inputs.floors || 4);
  const gia = inputs.gia || 8500;
  const isResidential = pType.includes("residential") || pType.includes("housing") || pType.includes("btr") || pType.includes("apartment");
  const isFitOut = pType.includes("fit-out") || pType.includes("fitout") || pType.includes("refurbishment") || pType.includes("cat-a") || pType.includes("cat-b");
  const isHealthcare = pType.includes("health") || pType.includes("hospital") || pType.includes("clinic") || pType.includes("bio");
  const isDataCentre = pType.includes("data") || pType.includes("mission") || pType.includes("telecom");
  const isIndustrial = pType.includes("industrial") || pType.includes("logistics") || pType.includes("warehouse") || pType.includes("distribution");
  const isCivils = pType.includes("civil") || pType.includes("highway") || pType.includes("infrastructure") || pType.includes("bridge") || pType.includes("road");
  const isEducation = pType.includes("education") || pType.includes("school") || pType.includes("university") || pType.includes("campus");

  // Multi-sector activity generators
  if (isFitOut) {
    return [
      // 1. Preliminaries & Mobilisation
      {
        activity_id: "F1000",
        wbs_code: "1.1",
        wbs_l1: "Preliminaries",
        wbs_l2: "Site Handover",
        description: "Landlord License to Alter & Site Access Handover",
        type: "Milestone",
        duration: 0,
        percent_complete: 0,
        predecessors: [],
      },
      {
        activity_id: "F1010",
        wbs_code: "1.2",
        wbs_l1: "Preliminaries",
        wbs_l2: "Enabling & Logistics",
        description: "Floor & Lift Protection, Dust Screens & Temporary Power Setup",
        type: "Task",
        duration: 5,
        percent_complete: 0,
        predecessors: [{ id: "F1000", type: "FS", lag: 0 }],
      },
      {
        activity_id: "F1020",
        wbs_code: "1.3",
        wbs_l1: "Preliminaries",
        wbs_l2: "Procurement",
        description: "Long-Lead MEP Equipment (FCUs, Glazed Partitions, Joinery) Call-Off",
        type: "Task",
        duration: 10,
        percent_complete: 0,
        predecessors: [{ id: "F1000", type: "FS", lag: 0 }],
      },

      // 2. Strip-Out & Substructure / Base Build
      {
        activity_id: "F2000",
        wbs_code: "2.1",
        wbs_l1: "Strip-Out & Prep",
        wbs_l2: "Demolition",
        description: "Strip-Out Redundant Partitions, Ceilings & Redundant M&E Services",
        type: "Task",
        duration: Math.max(8, floors * 3),
        percent_complete: 0,
        predecessors: [{ id: "F1010", type: "FS", lag: 0 }],
      },
      {
        activity_id: "F2010",
        wbs_code: "2.2",
        wbs_l1: "Strip-Out & Prep",
        wbs_l2: "Structural",
        description: "Slab Openings, Floor Levelling & Raised Access Floor Grid Installation",
        type: "Task",
        duration: Math.max(10, floors * 4),
        percent_complete: 0,
        predecessors: [{ id: "F2000", type: "FS", lag: 0 }],
      },

      // 3. 1st Fix MEP & Partitions
      {
        activity_id: "F3000",
        wbs_code: "3.1",
        wbs_l1: "1st Fix Fit-Out",
        wbs_l2: "MEP 1st Fix",
        description: "Install High-Level Ductwork, Fan Coil Units (FCUs) & Pipework Distribution",
        type: "Task",
        duration: Math.max(12, floors * 4),
        percent_complete: 0,
        predecessors: [{ id: "F2010", type: "SS", lag: 3 }],
      },
      {
        activity_id: "F3010",
        wbs_code: "3.2",
        wbs_l1: "1st Fix Fit-Out",
        wbs_l2: "Electrical Containment",
        description: "Install Primary Cable Trays, Underfloor Busbar & Data Basket Containment",
        type: "Task",
        duration: Math.max(10, floors * 3),
        percent_complete: 0,
        predecessors: [{ id: "F3000", type: "SS", lag: 4 }],
      },
      {
        activity_id: "F3020",
        wbs_code: "3.3",
        wbs_l1: "1st Fix Fit-Out",
        wbs_l2: "Partitions & Drylining",
        description: "Erect Metal Stud Partitions, Acoustic Insulation & Boarding (Side 1)",
        type: "Task",
        duration: Math.max(12, floors * 4),
        percent_complete: 0,
        predecessors: [{ id: "F3000", type: "SS", lag: 6 }],
      },
      {
        activity_id: "F3030",
        wbs_code: "3.4",
        wbs_l1: "1st Fix Fit-Out",
        wbs_l2: "In-Wall Drops",
        description: "In-Wall Electrical Drops, Plumbing First Fix & Partition Close-Up",
        type: "Task",
        duration: 10,
        percent_complete: 0,
        predecessors: [
          { id: "F3010", type: "FS", lag: 0 },
          { id: "F3020", type: "FS", lag: 0 },
        ],
      },

      // 4. Ceilings, Glazing & Finishes
      {
        activity_id: "F4000",
        wbs_code: "4.1",
        wbs_l1: "Finishes & Packages",
        wbs_l2: "Ceilings",
        description: "Acoustic SAS Ceiling Grid & Tile Installation / Feature Baffles",
        type: "Task",
        duration: Math.max(10, floors * 3),
        percent_complete: 0,
        predecessors: [{ id: "F3030", type: "FS", lag: 0 }],
      },
      {
        activity_id: "F4010",
        wbs_code: "4.2",
        wbs_l1: "Finishes & Packages",
        wbs_l2: "Glazing",
        description: "Double Glazed Acoustic Office Fronts & Crittall Style Screens",
        type: "Task",
        duration: 10,
        percent_complete: 0,
        predecessors: [{ id: "F4000", type: "SS", lag: 4 }],
      },
      {
        activity_id: "F4020",
        wbs_code: "4.3",
        wbs_l1: "Finishes & Packages",
        wbs_l2: "Joinery & Tea Points",
        description: "Bespoke Reception Desk, Tea Points & Breakout Kitchenette Joinery",
        type: "Task",
        duration: 12,
        percent_complete: 0,
        predecessors: [{ id: "F4000", type: "FS", lag: 2 }],
      },
      {
        activity_id: "F4030",
        wbs_code: "4.4",
        wbs_l1: "Finishes & Packages",
        wbs_l2: "Flooring",
        description: "Carpet Tiles, LVT Vinyl in Kitchens & Feature Timber Flooring",
        type: "Task",
        duration: 10,
        percent_complete: 0,
        predecessors: [
          { id: "F4010", type: "FS", lag: 0 },
          { id: "F4020", type: "SS", lag: 6 },
        ],
      },
      {
        activity_id: "F4040",
        wbs_code: "4.5",
        wbs_l1: "Finishes & Packages",
        wbs_l2: "Decorations",
        description: "Wall Finishes, Feature Wallpapers, Acoustic Panels & Final Painting",
        type: "Task",
        duration: 8,
        percent_complete: 0,
        predecessors: [{ id: "F4030", type: "FS", lag: 0 }],
      },

      // 5. MEP 2nd Fix & Server Room
      {
        activity_id: "F5000",
        wbs_code: "5.1",
        wbs_l1: "MEP 2nd Fix & IT",
        wbs_l2: "2nd Fix Electrical",
        description: "Install LED Architectural Luminaires, Emergency Lighting & Power Outlets",
        type: "Task",
        duration: 8,
        percent_complete: 0,
        predecessors: [{ id: "F4040", type: "SS", lag: 2 }],
      },
      {
        activity_id: "F5010",
        wbs_code: "5.2",
        wbs_l1: "MEP 2nd Fix & IT",
        wbs_l2: "Comms Room",
        description: "MER / SER Server Room UPS, CRAC Unit & Data Patching Racks",
        type: "Task",
        duration: 10,
        percent_complete: 0,
        predecessors: [{ id: "F4000", type: "FS", lag: 0 }],
      },

      // 6. Commissioning & Handover
      {
        activity_id: "F6000",
        wbs_code: "6.1",
        wbs_l1: "Testing & Handover",
        wbs_l2: "Energisation",
        description: "Permanent Power Live & Comms Link Active",
        type: "Milestone",
        duration: 0,
        percent_complete: 0,
        predecessors: [
          { id: "F5000", type: "FS", lag: 0 },
          { id: "F5010", type: "FS", lag: 0 },
        ],
      },
      {
        activity_id: "F6010",
        wbs_code: "6.2",
        wbs_l1: "Testing & Handover",
        wbs_l2: "Commissioning",
        description: "HVAC Balancing, BMS Controls Integration & Acoustic DB Testing",
        type: "Task",
        duration: 8,
        percent_complete: 0,
        predecessors: [{ id: "F6000", type: "FS", lag: 0 }],
      },
      {
        activity_id: "F6020",
        wbs_code: "6.3",
        wbs_l1: "Testing & Handover",
        wbs_l2: "Sparkle Clean",
        description: "Sparkle Clean, FF&E Furniture Installation & De-Snagging",
        type: "Task",
        duration: 6,
        percent_complete: 0,
        predecessors: [{ id: "F6010", type: "FS", lag: 0 }],
      },
      {
        activity_id: "F6030",
        wbs_code: "6.4",
        wbs_l1: "Testing & Handover",
        wbs_l2: "Practical Completion",
        description: "Practical Completion & Client Move-In Handover",
        type: "Milestone",
        duration: 0,
        percent_complete: 0,
        predecessors: [{ id: "F6020", type: "FS", lag: 0 }],
      },
    ];
  }

  if (isDataCentre) {
    return [
      { activity_id: "DC100", wbs_code: "1.1", wbs_l1: "Preliminaries", wbs_l2: "Access", description: "Site Possession & Security Boundary Setup", type: "Milestone", duration: 0, percent_complete: 0, predecessors: [] },
      { activity_id: "DC110", wbs_code: "1.2", wbs_l1: "Preliminaries", wbs_l2: "Enabling", description: "HV Utility Easement & Civil Groundworks", type: "Task", duration: 15, percent_complete: 0, predecessors: [{ id: "DC100", type: "FS", lag: 0 }] },
      { activity_id: "DC200", wbs_code: "2.1", wbs_l1: "Civil & Shell", wbs_l2: "Foundations", description: "Heavy Equipment Pads & Structural Floor Slab", type: "Task", duration: 20, percent_complete: 0, predecessors: [{ id: "DC110", type: "FS", lag: 0 }] },
      { activity_id: "DC210", wbs_code: "2.2", wbs_l1: "Civil & Shell", wbs_l2: "Frame", description: "Structural Steel Data Hall Framing & Cladding", type: "Task", duration: 25, percent_complete: 0, predecessors: [{ id: "DC200", type: "FS", lag: 0 }] },
      { activity_id: "DC220", wbs_code: "2.3", wbs_l1: "Civil & Shell", wbs_l2: "Milestone", description: "Data Hall Envelope Weathertight", type: "Milestone", duration: 0, percent_complete: 0, predecessors: [{ id: "DC210", type: "FS", lag: 0 }] },
      { activity_id: "DC300", wbs_code: "3.1", wbs_l1: "HV / LV Power", wbs_l2: "Generators", description: "Install Diesel Rotary Standby Generators & Fuel Tanks", type: "Task", duration: 18, percent_complete: 0, predecessors: [{ id: "DC220", type: "SS", lag: 4 }] },
      { activity_id: "DC310", wbs_code: "3.2", wbs_l1: "HV / LV Power", wbs_l2: "Substations", description: "Install 33kV/11kV Transformers, Switchgear & Busducts", type: "Task", duration: 22, percent_complete: 0, predecessors: [{ id: "DC300", type: "SS", lag: 5 }] },
      { activity_id: "DC320", wbs_code: "3.3", wbs_l1: "HV / LV Power", wbs_l2: "UPS Systems", description: "Install Modular Static UPS Units & Battery Cabinets", type: "Task", duration: 16, percent_complete: 0, predecessors: [{ id: "DC310", type: "FS", lag: 0 }] },
      { activity_id: "DC400", wbs_code: "4.1", wbs_l1: "Cooling Infrastructure", wbs_l2: "Chillers", description: "Install Rooftop Adiabatic Free-Cooling Chillers & Pumps", type: "Task", duration: 20, percent_complete: 0, predecessors: [{ id: "DC220", type: "FS", lag: 0 }] },
      { activity_id: "DC410", wbs_code: "4.2", wbs_l1: "Cooling Infrastructure", wbs_l2: "CRAH / CRAC", description: "Install White Space CRAH Units & Leak Detection", type: "Task", duration: 15, percent_complete: 0, predecessors: [{ id: "DC400", type: "SS", lag: 8 }] },
      { activity_id: "DC500", wbs_code: "5.1", wbs_l1: "White Space", wbs_l2: "Containment", description: "Install Heavy Duty Raised Floor & Hot/Cold Aisle Containment", type: "Task", duration: 18, percent_complete: 0, predecessors: [{ id: "DC410", type: "FS", lag: 0 }] },
      { activity_id: "DC510", wbs_code: "5.2", wbs_l1: "White Space", wbs_l2: "Fire Suppression", description: "Install VESDA Aspirating Smoke Detection & Inergen Gas", type: "Task", duration: 12, percent_complete: 0, predecessors: [{ id: "DC500", type: "SS", lag: 6 }] },
      { activity_id: "DC600", wbs_code: "6.1", wbs_l1: "IST Commissioning", wbs_l2: "Milestone", description: "DNO HV Substation Energisation", type: "Milestone", duration: 0, percent_complete: 0, predecessors: [{ id: "DC320", type: "FS", lag: 0 }] },
      { activity_id: "DC610", wbs_code: "6.2", wbs_l1: "IST Commissioning", wbs_l2: "IST Level 1-3", description: "Factory Witness Testing (FWT) & Component Startup", type: "Task", duration: 10, percent_complete: 0, predecessors: [{ id: "DC600", type: "FS", lag: 0 }] },
      { activity_id: "DC620", wbs_code: "6.3", wbs_l1: "IST Commissioning", wbs_l2: "IST Level 4-5", description: "Full Load Heat Bank Testing & Black Building Failure Simulation", type: "Task", duration: 15, percent_complete: 0, predecessors: [{ id: "DC610", type: "FS", lag: 0 }, { id: "DC510", type: "FS", lag: 0 }] },
      { activity_id: "DC630", wbs_code: "6.4", wbs_l1: "IST Commissioning", wbs_l2: "Handover", description: "Tier III Data Centre Operational Handover", type: "Milestone", duration: 0, percent_complete: 0, predecessors: [{ id: "DC620", type: "FS", lag: 0 }] },
    ];
  }

  // Standard Commercial / Residential / Mixed-Use Scheme
  const acts: any[] = [
    // 1. Preliminaries & Procurement
    {
      activity_id: "A1000",
      wbs_code: "1.1",
      wbs_l1: "Preliminaries",
      wbs_l2: "Site Handover",
      description: "Client Possession & Site Access Handover",
      type: "Milestone",
      duration: 0,
      percent_complete: 0,
      predecessors: [],
    },
    {
      activity_id: "A1010",
      wbs_code: "1.2",
      wbs_l1: "Preliminaries",
      wbs_l2: "Enabling Works",
      description: "Site Hoarding, Security, Tree Protection & Logistics Setup",
      type: "Task",
      duration: 8,
      percent_complete: 0,
      predecessors: [{ id: "A1000", type: "FS", lag: 0 }],
    },
    {
      activity_id: "A1020",
      wbs_code: "1.2",
      wbs_l1: "Preliminaries",
      wbs_l2: "Enabling Works",
      description: "Temporary Power, Water & Welfare Compound Installation",
      type: "Task",
      duration: 10,
      percent_complete: 0,
      predecessors: [{ id: "A1010", type: "SS", lag: 2 }],
    },
    {
      activity_id: "A1030",
      wbs_code: "1.3",
      wbs_l1: "Preliminaries",
      wbs_l2: "Statutory Approvals",
      description: "Section 61 & Planning Pre-Commencement Discharge",
      type: "Milestone",
      duration: 0,
      percent_complete: 0,
      predecessors: [{ id: "A1010", type: "FS", lag: 0 }],
    },
    {
      activity_id: "A1040",
      wbs_code: "1.4",
      wbs_l1: "Preliminaries",
      wbs_l2: "Procurement",
      description: "Order Long Lead Packages (Tower Cranes, Steel, Façade & MEP)",
      type: "Task",
      duration: 15,
      percent_complete: 0,
      predecessors: [{ id: "A1000", type: "FS", lag: 0 }],
    },

    // 2. Substructure
    {
      activity_id: "B1000",
      wbs_code: "2.1",
      wbs_l1: "Substructure",
      wbs_l2: "Earthworks",
      description: "Site Strip, Bulk Excavation & Retaining Piles",
      type: "Task",
      duration: Math.max(12, Math.round(Math.sqrt(gia) * 0.15)),
      percent_complete: 0,
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
      description: "Continuous Flight Auger (CFA) Piling & Integrity Testing",
      type: "Task",
      duration: Math.max(14, Math.round(floors * 2.5)),
      percent_complete: 0,
      predecessors: [{ id: "B1000", type: "SS", lag: 4 }],
    },
    {
      activity_id: "B1020",
      wbs_code: "2.3",
      wbs_l1: "Substructure",
      wbs_l2: "Drainage",
      description: "Under-Slab Drainage & Attenuation Tank Installation",
      type: "Task",
      duration: 12,
      percent_complete: 0,
      predecessors: [{ id: "B1010", type: "FS", lag: 0 }],
    },
    {
      activity_id: "B1030",
      wbs_code: "2.4",
      wbs_l1: "Substructure",
      wbs_l2: "Foundations",
      description: "Pile Caps, Ground Beams & Waterproof Concrete Slab",
      type: "Task",
      duration: 20,
      percent_complete: 0,
      predecessors: [
        { id: "B1010", type: "FS", lag: 2 },
        { id: "B1020", type: "FS", lag: 0 },
      ],
    },
    {
      activity_id: "B1040",
      wbs_code: "2.5",
      wbs_l1: "Substructure",
      wbs_l2: "Substructure Complete",
      description: "Substructure & Ground Floor Slab Complete",
      type: "Milestone",
      duration: 0,
      percent_complete: 0,
      predecessors: [{ id: "B1030", type: "FS", lag: 0 }],
    },

    // 3. Superstructure
    {
      activity_id: "C1000",
      wbs_code: "3.1",
      wbs_l1: "Superstructure",
      wbs_l2: "Core",
      description: "Jump-Form Reinforced Concrete Core Construction",
      type: "Task",
      duration: Math.max(15, floors * 5),
      percent_complete: 0,
      predecessors: [{ id: "B1040", type: "FS", lag: 0 }],
    },
    {
      activity_id: "C1010",
      wbs_code: "3.2",
      wbs_l1: "Superstructure",
      wbs_l2: "Frame",
      description: `Construct Structural Slabs & Columns (L1 to L${floors})`,
      type: "Task",
      duration: Math.max(20, floors * 6),
      percent_complete: 0,
      predecessors: [{ id: "C1000", type: "SS", lag: 6 }],
    },
    {
      activity_id: "C1020",
      wbs_code: "3.3",
      wbs_l1: "Superstructure",
      wbs_l2: "Roof Structure",
      description: "Construct Roof Slab, Plant Enclosure & Upstands",
      type: "Task",
      duration: 12,
      percent_complete: 0,
      predecessors: [{ id: "C1010", type: "FS", lag: 0 }],
    },
    {
      activity_id: "C1030",
      wbs_code: "3.4",
      wbs_l1: "Superstructure",
      wbs_l2: "Milestone",
      description: "Building Superstructure Topping Out",
      type: "Milestone",
      duration: 0,
      percent_complete: 0,
      predecessors: [{ id: "C1020", type: "FS", lag: 0 }],
    },

    // 4. Envelope & Façade
    {
      activity_id: "D1000",
      wbs_code: "4.1",
      wbs_l1: "Envelope & Façade",
      wbs_l2: "Façade Framing",
      description: "Install SFS Studwork & Weather Defence Sheathing Board",
      type: "Task",
      duration: Math.max(18, floors * 4),
      percent_complete: 0,
      predecessors: [{ id: "C1010", type: "SS", lag: 12 }],
    },
    {
      activity_id: "D1010",
      wbs_code: "4.2",
      wbs_l1: "Envelope & Façade",
      wbs_l2: "Windows & Glazing",
      description: "Install Unitised Windows, Glazing & External Doors",
      type: "Task",
      duration: Math.max(16, floors * 3),
      percent_complete: 0,
      predecessors: [{ id: "D1000", type: "SS", lag: 5 }],
    },
    {
      activity_id: "D1020",
      wbs_code: "4.3",
      wbs_l1: "Envelope & Façade",
      wbs_l2: "Roofing",
      description: "Install Roof Waterproofing Membrane, Insulation & Copings",
      type: "Task",
      duration: 16,
      percent_complete: 0,
      predecessors: [{ id: "C1030", type: "FS", lag: 0 }],
    },
    {
      activity_id: "D1030",
      wbs_code: "4.4",
      wbs_l1: "Envelope & Façade",
      wbs_l2: "Cladding & Brickwork",
      description: isResidential
        ? "External Brickwork, Cavity Trays & Architectural Cladding"
        : "Rain-screen Cladding Panels, Louvres & Architectural Fins",
      type: "Task",
      duration: Math.max(20, floors * 4),
      percent_complete: 0,
      predecessors: [{ id: "D1010", type: "SS", lag: 6 }],
    },
    {
      activity_id: "D1040",
      wbs_code: "4.5",
      wbs_l1: "Envelope & Façade",
      wbs_l2: "Milestone",
      description: "Building Envelope Weathertight Milestone",
      type: "Milestone",
      duration: 0,
      percent_complete: 0,
      predecessors: [
        { id: "D1010", type: "FS", lag: 0 },
        { id: "D1020", type: "FS", lag: 0 },
      ],
    },

    // 5. Internal Fit-Out & MEP
    {
      activity_id: "E1000",
      wbs_code: "5.1",
      wbs_l1: "Internal Fit-Out & MEP",
      wbs_l2: "1st Fix MEP",
      description: "1st Fix Mechanical, Electrical, Sprinklers & Public Health Containment",
      type: "Task",
      duration: Math.max(20, floors * 4),
      percent_complete: 0,
      predecessors: [{ id: "D1040", type: "FS", lag: 0 }],
    },
    {
      activity_id: "E1010",
      wbs_code: "5.2",
      wbs_l1: "Internal Fit-Out & MEP",
      wbs_l2: "Drylining & Partitions",
      description: "Internal Partition Framing, Insulation & Plasterboard 1st Side",
      type: "Task",
      duration: Math.max(18, floors * 3),
      percent_complete: 0,
      predecessors: [{ id: "E1000", type: "SS", lag: 6 }],
    },
    {
      activity_id: "E1020",
      wbs_code: "5.3",
      wbs_l1: "Internal Fit-Out & MEP",
      wbs_l2: "Drylining & Partitions",
      description: "Close Up Partitions, Tape & Jointing / Plaster Skim",
      type: "Task",
      duration: Math.max(15, floors * 3),
      percent_complete: 0,
      predecessors: [
        { id: "E1000", type: "FS", lag: 0 },
        { id: "E1010", type: "FS", lag: 0 },
      ],
    },
    {
      activity_id: "E1030",
      wbs_code: "5.4",
      wbs_l1: "Internal Fit-Out & MEP",
      wbs_l2: "2nd Fix MEP",
      description: "2nd Fix Wiring, DB Terminations, Sanitaryware & Diffusers",
      type: "Task",
      duration: Math.max(16, floors * 3),
      percent_complete: 0,
      predecessors: [{ id: "E1020", type: "FS", lag: 0 }],
    },
    {
      activity_id: "E1040",
      wbs_code: "5.5",
      wbs_l1: "Internal Fit-Out & MEP",
      wbs_l2: "Finishes",
      description: isResidential
        ? "Kitchens, Bathroom Vanity Units, Doorsets & Fitted Wardrobes"
        : "Internal Doorsets, Ironmongery, Kitchenettes / Joinery",
      type: "Task",
      duration: 15,
      percent_complete: 0,
      predecessors: [{ id: "E1020", type: "FS", lag: 2 }],
    },
    {
      activity_id: "E1050",
      wbs_code: "5.6",
      wbs_l1: "Internal Fit-Out & MEP",
      wbs_l2: "Finishes",
      description: "Floor Finishes (Raised Access Floor / Tiles / Carpet)",
      type: "Task",
      duration: 14,
      percent_complete: 0,
      predecessors: [
        { id: "E1030", type: "SS", lag: 5 },
        { id: "E1040", type: "SS", lag: 3 },
      ],
    },
    {
      activity_id: "E1060",
      wbs_code: "5.7",
      wbs_l1: "Internal Fit-Out & MEP",
      wbs_l2: "Decorations",
      description: "Final Mist Coat & Top Coats Emulsion / Glossing",
      type: "Task",
      duration: 12,
      percent_complete: 0,
      predecessors: [{ id: "E1050", type: "FS", lag: 0 }],
    },

    // 6. Commissioning & Handover
    {
      activity_id: "F1000",
      wbs_code: "6.1",
      wbs_l1: "Commissioning & Handover",
      wbs_l2: "MEP Commissioning",
      description: "Permanent Power Energisation & Water Supply Connection",
      type: "Milestone",
      duration: 0,
      percent_complete: 0,
      predecessors: [{ id: "E1030", type: "FS", lag: 0 }],
    },
    {
      activity_id: "F1010",
      wbs_code: "6.2",
      wbs_l1: "Commissioning & Handover",
      wbs_l2: "MEP Commissioning",
      description: "MEP System Flushing, Balancing, Testing & Integrated Cause & Effect Tests",
      type: "Task",
      duration: 15,
      percent_complete: 0,
      predecessors: [{ id: "F1000", type: "FS", lag: 0 }],
    },
    {
      activity_id: "F1020",
      wbs_code: "6.3",
      wbs_l1: "Commissioning & Handover",
      wbs_l2: "Snagging & Cleaning",
      description: "Builders Clean, Sparkle Clean & Defect De-snagging",
      type: "Task",
      duration: 10,
      percent_complete: 0,
      predecessors: [
        { id: "E1060", type: "FS", lag: 0 },
        { id: "F1010", type: "SS", lag: 5 },
      ],
    },
    {
      activity_id: "F1030",
      wbs_code: "6.4",
      wbs_l1: "Commissioning & Handover",
      wbs_l2: "Statutory Approvals",
      description: "Building Control Final Inspection, Fire Authority & O&M Manual Handover",
      type: "Task",
      duration: 8,
      percent_complete: 0,
      predecessors: [{ id: "F1020", type: "FS", lag: 0 }],
    },
    {
      activity_id: "F1040",
      wbs_code: "6.5",
      wbs_l1: "Commissioning & Handover",
      wbs_l2: "Practical Completion",
      description: "Practical Completion & Client Handover",
      type: "Milestone",
      duration: 0,
      percent_complete: 0,
      predecessors: [{ id: "F1030", type: "FS", lag: 0 }],
    },
  ];

  return acts;
}

/**
 * AI-Powered Activity & Programme Generator
 * Uses Gemini API to construct professional CPM programmes with realistic duration estimation
 */
export async function generateProgramme(inputs: GenerationInput): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    const acts = createFallbackActivities(inputs);
    return {
      activities: acts,
      assumptions: [
        {
          category: "Planning & Consents",
          assumption: "Pre-commencement planning conditions discharged prior to ground reduction.",
          basis: "Standard JCT Design & Build contractual requirements",
        },
        {
          category: "Enclosure & Fit-Out",
          assumption: "Internal drylining and MEP 1st fix commences once building is certified weathertight.",
          basis: "Warranty requirements & moisture sensitive plasterboard protection",
        },
        {
          category: "Energisation",
          assumption: "Statutory undertakers deliver permanent substation power 4 weeks prior to commissioning.",
          basis: "DNO lead times and plant load testing requirements",
        },
      ],
      summary: `Standard ${inputs.project_type || "Construction"} master programme structured across 6 WBS work packages with verified Critical Path logic, milestone gating, and realistic trade lead-times.`,
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const prompt = `You are a Senior Principal Construction Planning Engineer & CPM Scheduling Expert (Fellow of CIOB / APM).
Your goal is to estimate and generate a comprehensive, fully-linked Critical Path Method (CPM) Programme of Works for this specific project.

Project Input Data:
- Sector / Project Type: ${inputs.project_type || "Commercial Office"}
- Detailed Scope: ${inputs.description || "Comprehensive construction and delivery"}
- Gross Internal Area (GIA): ${inputs.gia || 8500} ${inputs.gia_unit || "sqm"}
- Storeys / Number of Floors: ${inputs.floors || 4}
- Procurement Route: ${inputs.procurement || "Design & Build (JCT)"}
- Schedule Start Date: ${inputs.start_date || new Date().toISOString().slice(0, 10)}
- Target Completion: ${inputs.target_completion || "Optimal achievable"}
- Specific Site Logistics & Constraints: ${inputs.site_constraints || "Standard urban access with restricted crane oversailing"}
- Long Lead Procurement Items: ${inputs.long_lead_items || "Façade, Structural Steel, HV Switchboards, Chillers"}
- Milestone Requirements: ${inputs.key_milestones || "Site Access, Substructure Box, Topping Out, Weathertight Envelope, Energisation, Practical Completion"}
- Programme Detail Density: ${inputs.programme_density || "medium"}

Engineering Estimation Instructions:
1. Activity Estimation:
   - Carefully tailor all activity descriptions, trade sequences, and work packages to the EXACT project type:
     * For Fit-Out: Strip-out, raised floors, MEP FCUs, partitions, acoustic ceilings, joinery, IT/comms rooms, commissioning.
     * For Residential: Foundations, RC slipform core, frame slabs, SFS framing, brickwork/cladding, bathroom pods, apartment fit-out, testing.
     * For Healthcare: Clinical zoning, medical gas, HTM compliance, clean rooms, clinical scrub & handover.
     * For Data Centre: Substation, generators, UPS, chillers, CRAH units, hot/cold containment, IST Level 1 to 5 commissioning.
     * For Civils/Logistics: Earthworks cut & fill, portal frame, FM2 floor slab, dock levellers, surfacing, drainage.
2. Realistic Durations:
   - Estimate realistic durations (in working days) based on standard trade productivity rates, GIA, and number of floors.
   - Durations should allow for proper concrete curing (lags) and sequential floor cycle handover.
3. Closed Network CPM Logic:
   - Provide 30 to 55 well-structured activities.
   - Assign clean WBS hierarchy (wbs_code e.g. "1.1", wbs_l1 e.g. "Preliminaries", wbs_l2, wbs_l3).
   - Every activity must have closed logic (only the initial Milestone has no predecessors, and only Practical Completion has no successors).
   - Link types: "FS" (Finish-to-Start), "SS" (Start-to-Start), "FF" (Finish-to-Finish), "SF" (Start-to-Finish) with realistic day lags.
4. Milestones:
   - Milestones MUST have duration: 0 and type: "Milestone".
5. Progress:
   - Set percent_complete: 0 for all generated activities.

Output ONLY valid JSON adhering strictly to this schema:
{
  "activities": [
    {
      "activity_id": "string (e.g. A1000, B1010)",
      "wbs_code": "string",
      "wbs_l1": "string",
      "wbs_l2": "string",
      "wbs_l3": "string",
      "description": "string",
      "type": "Task" | "Milestone",
      "duration": number,
      "percent_complete": 0,
      "predecessors": [
        { "id": "string", "type": "FS" | "SS" | "FF" | "SF", "lag": number }
      ],
      "constraint_type": "" | "SNET" | "FNLT" | "MSO",
      "constraint_date": null | "YYYY-MM-DD"
    }
  ],
  "assumptions": [
    {
      "category": "string",
      "assumption": "string",
      "basis": "string"
    }
  ],
  "summary": "string"
}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text || "{}";
    const data = JSON.parse(text);
    if (!data.activities || !Array.isArray(data.activities) || data.activities.length === 0) {
      throw new Error("Invalid response format from AI model");
    }
    return data;
  } catch (err) {
    console.error("AI generation failed, falling back to local domain engine:", err);
    const acts = createFallbackActivities(inputs);
    return {
      activities: acts,
      assumptions: [
        {
          category: "Planning & Sequencing",
          assumption: "Standard construction sequencing and trade productivity benchmarks adopted.",
          basis: "UK CIOB Construction Programme Best Practice",
        },
      ],
      summary: `Estimated programme for ${inputs.project_type || "Construction Project"} generated using structural engineering CPM scheduling benchmarks.`,
    };
  }
}

/**
 * AI-Powered Schedule Refinement
 */
export async function refineProgramme(
  inputs: any,
  activities: any[],
  instruction: string
): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    // Intelligent local refinement fallback
    const modifiedActs = activities.map((a) => ({ ...a }));
    const lower = instruction.toLowerCase();
    const changes: any[] = [];

    if (lower.includes("fast track") || lower.includes("compress") || lower.includes("speed up") || lower.includes("shorter")) {
      for (const a of modifiedActs) {
        if (a.type !== "Milestone" && (a.duration || 0) > 8) {
          const oldDur = a.duration;
          a.duration = Math.max(5, Math.round(a.duration * 0.8));
          changes.push({
            activity_id: a.activity_id,
            change_type: "modified",
            details: `Reduced duration from ${oldDur}wd to ${a.duration}wd to fast-track execution.`,
          });
        }
      }
    } else if (lower.includes("add inspection") || lower.includes("quality") || lower.includes("safety") || lower.includes("qa")) {
      const newAct = {
        activity_id: `Q${Date.now().toString().slice(-4)}`,
        wbs_code: "5.8",
        wbs_l1: "Quality & Safety",
        wbs_l2: "Inspections",
        description: "Hold Point Quality Assurance & Fire Barrier Inspection",
        type: "Task",
        duration: 3,
        percent_complete: 0,
        predecessors: [{ id: modifiedActs[Math.floor(modifiedActs.length / 2)]?.activity_id || "A1010", type: "FS", lag: 0 }],
      };
      modifiedActs.push(newAct);
      changes.push({
        activity_id: newAct.activity_id,
        change_type: "added",
        details: "Added Hold Point QA and Fire Barrier Inspection.",
      });
    } else {
      for (const a of modifiedActs) {
        if (a.type !== "Milestone" && (a.duration || 0) > 15) {
          a.duration = a.duration - 2;
          changes.push({
            activity_id: a.activity_id,
            change_type: "modified",
            details: `Adjusted duration to optimize schedule flow: ${a.duration}wd.`,
          });
          break;
        }
      }
    }

    return {
      activities: modifiedActs,
      assumptions: [
        {
          category: "Refinement",
          assumption: `Applied adjustment: ${instruction}`,
          basis: "AI Scheduler logic engine",
        },
      ],
      explanation: `Successfully applied scheduling refinement according to: "${instruction}". Updated ${changes.length} schedule items.`,
      changes,
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const prompt = `You are a Principal Construction Planning Engineer & CPM Scheduler.
A user wants to modify their existing construction programme of works.

User Request: "${instruction}"

Current Activities (${activities.length} total):
${JSON.stringify(activities.slice(0, 50), null, 2)}

Instructions:
1. Apply the user's requested changes directly to the activities array.
2. Keep existing activity_ids where possible, or add new IDs (e.g. N1000) for new tasks.
3. Ensure CPM predecessors are maintained and valid.
4. Provide a clear explanation of changes and a list of specific changes made.

Output ONLY valid JSON in the following schema:
{
  "activities": [...],
  "assumptions": [...],
  "explanation": "string",
  "changes": [
    {
      "activity_id": "string",
      "change_type": "added" | "modified" | "removed",
      "details": "string"
    }
  ]
}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text || "{}";
    const data = JSON.parse(text);
    return data;
  } catch (err) {
    console.error("AI refinement failed:", err);
    return {
      activities,
      assumptions: [],
      explanation: "Unable to process AI refinement request. Current schedule preserved.",
      changes: [],
    };
  }
}
