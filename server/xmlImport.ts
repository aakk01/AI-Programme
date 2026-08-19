import { parsePredecessorString } from "./cpm";

export interface ParsedXmlProgramme {
  name: string;
  start_date: string | null;
  finish_date: string | null;
  activities: any[];
  stats: {
    activities: number;
    links: number;
    milestones: number;
    format_detected: string;
  };
}

/**
 * Parses XML duration strings (e.g. "PT40H0M0S", "5d", "40h", "8.000", "5", etc.) into integer working days.
 */
function parseDurationToDays(durStr: string | null | undefined): number {
  if (!durStr) return 5;
  const str = durStr.trim();

  // ISO 8601 Duration: PT40H0M0S or P5D or PT8H
  if (str.startsWith("P") || str.startsWith("p")) {
    const hoursMatch = str.match(/(\d+(?:\.\d+)?)H/i);
    const daysMatch = str.match(/(\d+(?:\.\d+)?)D/i);
    if (hoursMatch) {
      const hours = parseFloat(hoursMatch[1]);
      return Math.max(0, Math.round(hours / 8.0));
    }
    if (daysMatch) {
      return Math.max(0, Math.round(parseFloat(daysMatch[1])));
    }
  }

  // Format like "5d", "5 days", "40h"
  if (str.toLowerCase().includes("h")) {
    const hours = parseFloat(str.replace(/[^0-9.]/g, ""));
    if (!isNaN(hours)) return Math.max(0, Math.round(hours / 8.0));
  }

  const num = parseFloat(str.replace(/[^0-9.]/g, ""));
  if (isNaN(num)) return 5;
  return Math.max(0, Math.round(num));
}

/**
 * Parses date string into YYYY-MM-DD format
 */
function extractDate(val: string | null | undefined): string | null {
  if (!val) return null;
  const m = val.trim().match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Fast regex-based XML tag content extractor that handles nested tags and attributes.
 */
function getTagContent(xml: string, tag: string): string | null {
  const reg = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = xml.match(reg);
  return match ? match[1].trim() : null;
}

function getTagAttribute(tagXml: string, attr: string): string | null {
  const reg = new RegExp(`${attr}=["']([^"']+)["']`, "i");
  const match = tagXml.match(reg);
  return match ? match[1] : null;
}

function getAllTags(xml: string, tag: string): string[] {
  const reg = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
  const matches = xml.match(reg);
  return matches ? Array.from(matches) : [];
}

/**
 * Parses Asta Powerproject XML or MS Project XML or Primavera XML format
 */
export function importXmlProgramme(xmlContent: string): ParsedXmlProgramme {
  if (!xmlContent || !xmlContent.trim()) {
    throw new Error("Uploaded XML file is empty");
  }

  let formatDetected = "XML Standard";
  let projectName = "Imported Programme";
  let startDate: string | null = null;
  let finishDate: string | null = null;

  // Extract root project name
  const titleTag = getTagContent(xmlContent, "Title") || getTagContent(xmlContent, "Name") || getTagContent(xmlContent, "ProjectName");
  if (titleTag) {
    projectName = titleTag;
  }

  const startTag = getTagContent(xmlContent, "StartDate") || getTagContent(xmlContent, "Start") || getTagContent(xmlContent, "ProjectStart");
  if (startTag) {
    startDate = extractDate(startTag);
  }

  const finishTag = getTagContent(xmlContent, "FinishDate") || getTagContent(xmlContent, "Finish") || getTagContent(xmlContent, "ProjectFinish");
  if (finishTag) {
    finishDate = extractDate(finishTag);
  }

  const rawTasks = getAllTags(xmlContent, "Task");
  const rawActivities = getAllTags(xmlContent, "Activity");
  const rawAstaBars = getAllTags(xmlContent, "Bar") || getAllTags(xmlContent, "AstaTask");

  const taskNodes = rawTasks.length > 0 ? rawTasks : rawActivities.length > 0 ? rawActivities : rawAstaBars;

  if (taskNodes.length === 0) {
    // Try to see if there are generic tags like <Item>, <Row>, <Record>
    const itemNodes = getAllTags(xmlContent, "Item");
    if (itemNodes.length > 0) {
      taskNodes.push(...itemNodes);
    }
  }

  if (taskNodes.length === 0) {
    throw new Error("Could not find any <Task> or <Activity> records in the XML file.");
  }

  // Check if Asta Powerproject XML
  if (xmlContent.includes("Asta") || xmlContent.includes("Powerproject") || xmlContent.includes("Elecosoft")) {
    formatDetected = "Asta Powerproject XML";
  } else if (xmlContent.includes("schemas.microsoft.com/project") || xmlContent.includes("<SaveVersion>")) {
    formatDetected = "Microsoft Project XML";
  } else if (xmlContent.includes("Primavera") || xmlContent.includes("pmxml") || xmlContent.includes("p6")) {
    formatDetected = "Primavera XML";
  }

  // UID to Activity mapping for MSP / Asta predecessors
  const uidMap: Record<string, string> = {};
  const activitiesList: any[] = [];
  let totalLinks = 0;
  let totalMilestones = 0;

  // 1. First Pass: Collect all tasks and assign IDs
  taskNodes.forEach((node, index) => {
    // Ignore MS Project summary root task if UID is 0 and name equals project name
    const uid = getTagContent(node, "UID") || getTagContent(node, "Id") || getTagContent(node, "ID") || `task_${index + 1}`;
    const id = getTagContent(node, "ID") || getTagContent(node, "ActivityID") || getTagContent(node, "Code") || `A${1000 + index * 10}`;
    const name = getTagContent(node, "Name") || getTagContent(node, "Description") || getTagContent(node, "Title") || `Activity ${id}`;
    
    // Check if MS Project summary project root
    if (uid === "0" && (index === 0 || name.toLowerCase() === projectName.toLowerCase())) {
      return;
    }

    const isMilestone =
      getTagContent(node, "Milestone") === "1" ||
      getTagContent(node, "IsMilestone") === "true" ||
      name.toLowerCase().includes("milestone") ||
      name.toLowerCase().includes("completion") ||
      name.toLowerCase().includes("access date");

    const durContent = getTagContent(node, "Duration") || getTagContent(node, "PlannedDuration") || (isMilestone ? "0" : "5");
    const duration = isMilestone ? 0 : parseDurationToDays(durContent);

    const wbsL1 =
      getTagContent(node, "WBS") ||
      getTagContent(node, "WBSName") ||
      getTagContent(node, "Stage") ||
      getTagContent(node, "OutlineNumber") ||
      "General Works";

    const earlyStart = extractDate(getTagContent(node, "Start") || getTagContent(node, "EarlyStart") || getTagContent(node, "PlannedStart"));
    const earlyFinish = extractDate(getTagContent(node, "Finish") || getTagContent(node, "EarlyFinish") || getTagContent(node, "PlannedFinish"));

    const percentCompleteStr = getTagContent(node, "PercentComplete") || getTagContent(node, "PercentProgress") || "0";
    const percentComplete = Math.min(100, Math.max(0, parseInt(percentCompleteStr.replace(/[^0-9]/g, ""), 10) || 0));

    const cleanId = id.toString().replace(/[^a-zA-Z0-9_\-]/g, "");
    uidMap[uid] = cleanId;

    if (isMilestone) totalMilestones++;

    activitiesList.push({
      _nodeXml: node,
      _uid: uid,
      activity_id: cleanId,
      id: cleanId,
      description: name,
      name: name,
      wbs_l1: wbsL1,
      wbs_code: getTagContent(node, "OutlineNumber") || getTagContent(node, "WBSCode") || `${index + 1}`,
      duration: duration,
      type: duration === 0 ? "Milestone" : "Task",
      percent_complete: percentComplete,
      is_milestone: isMilestone || duration === 0,
      early_start: earlyStart,
      early_finish: earlyFinish,
      predecessors: [],
    });
  });

  // 2. Second Pass: Extract Predecessors & Relationships
  // Also check top-level <Links> or <Relationships> if not embedded inside <Task>
  const globalLinks = getAllTags(xmlContent, "Link") || getAllTags(xmlContent, "Relationship");
  const globalLinksBySuccessor: Record<string, any[]> = {};

  globalLinks.forEach((linkNode) => {
    const predId = getTagContent(linkNode, "PredecessorID") || getTagContent(linkNode, "PredecessorUID") || getTagContent(linkNode, "PredecessorActivityId");
    const succId = getTagContent(linkNode, "SuccessorID") || getTagContent(linkNode, "SuccessorUID") || getTagContent(linkNode, "SuccessorActivityId");
    const typeStr = getTagContent(linkNode, "Type") || getTagContent(linkNode, "LinkType") || "FS";
    const lagStr = getTagContent(linkNode, "Lag") || getTagContent(linkNode, "LinkLag") || "0";
    const lag = parseDurationToDays(lagStr);

    let linkType: "FS" | "SS" | "FF" | "SF" = "FS";
    if (typeStr === "1" || typeStr.toUpperCase() === "SS") linkType = "SS";
    else if (typeStr === "2" || typeStr.toUpperCase() === "FF") linkType = "FF";
    else if (typeStr === "3" || typeStr.toUpperCase() === "SF") linkType = "SF";

    if (succId && predId) {
      if (!globalLinksBySuccessor[succId]) globalLinksBySuccessor[succId] = [];
      globalLinksBySuccessor[succId].push({ predId, type: linkType, lag });
    }
  });

  activitiesList.forEach((act, actIdx) => {
    const preds: any[] = [];
    const predNodes = getAllTags(act._nodeXml, "PredecessorLink") || getAllTags(act._nodeXml, "Predecessor");

    predNodes.forEach((pNode) => {
      const predUid = getTagContent(pNode, "PredecessorUID") || getTagContent(pNode, "PredecessorID") || getTagContent(pNode, "ID");
      const typeCode = getTagContent(pNode, "Type") || getTagContent(pNode, "LinkType") || "1"; // In MSP: 1=FF, 0=FS? Actually in MSP XML 1=FF, 2=FS, 3=SF, 0=None or 1=FS. Let's map accurately.
      const lagVal = getTagContent(pNode, "LinkLag") || getTagContent(pNode, "Lag") || "0";
      const lag = parseDurationToDays(lagVal);

      let pType: "FS" | "SS" | "FF" | "SF" = "FS";
      if (typeCode === "0" || typeCode.toUpperCase() === "FF") pType = "FF";
      else if (typeCode === "1" || typeCode === "4" || typeCode.toUpperCase() === "FS") pType = "FS";
      else if (typeCode === "2" || typeCode.toUpperCase() === "SF") pType = "SF";
      else if (typeCode === "3" || typeCode.toUpperCase() === "SS") pType = "SS";

      const targetActId = predUid ? (uidMap[predUid] || predUid) : null;
      if (targetActId && targetActId !== act.activity_id) {
        preds.push({ id: targetActId, type: pType, lag });
        totalLinks++;
      }
    });

    // Check global links map if no local predecessor tags found
    const extraLinks = globalLinksBySuccessor[act._uid] || globalLinksBySuccessor[act.activity_id] || [];
    extraLinks.forEach((link) => {
      const targetId = uidMap[link.predId] || link.predId;
      if (targetId && targetId !== act.activity_id && !preds.some((p) => p.id === targetId)) {
        preds.push({ id: targetId, type: link.type, lag: link.lag });
        totalLinks++;
      }
    });

    // Clean internal properties
    delete act._nodeXml;
    delete act._uid;
    act.predecessors = preds;
  });

  // If no links were found at all in the file, automatically chain tasks linearly in sequence so CPM functions properly
  if (totalLinks === 0 && activitiesList.length > 1) {
    for (let i = 1; i < activitiesList.length; i++) {
      activitiesList[i].predecessors = [
        { id: activitiesList[i - 1].activity_id, type: "FS", lag: 0 },
      ];
      totalLinks++;
    }
  }

  return {
    name: projectName,
    start_date: startDate || new Date().toISOString().slice(0, 10),
    finish_date: finishDate,
    activities: activitiesList,
    stats: {
      activities: activitiesList.length,
      links: totalLinks,
      milestones: totalMilestones,
      format_detected: formatDetected,
    },
  };
}
