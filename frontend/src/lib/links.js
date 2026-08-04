const LINK_RE = /^\s*([A-Za-z0-9_.\-]+?)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+)?\s*d?\s*$/i;

export const parseLinks = (text) => {
  if (!text || !String(text).trim()) return [];
  return String(text)
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const m = LINK_RE.exec(part);
      if (!m) throw new Error(`Invalid link syntax: "${part}"`);
      return {
        id: m[1],
        type: (m[2] || "FS").toUpperCase(),
        lag: m[3] ? parseInt(m[3].replace(/\s/g, ""), 10) : 0,
      };
    });
};

export const formatLinks = (links) =>
  (links || [])
    .map((l) => {
      const lag = l.lag || 0;
      return `${l.id}${l.type || "FS"}${lag ? (lag > 0 ? "+" : "-") + Math.abs(lag) + "d" : ""}`;
    })
    .join(", ");

export const EDITABLE_KEYS = [
  "activity_id",
  "wbs_code",
  "wbs_l1",
  "wbs_l2",
  "wbs_l3",
  "description",
  "type",
  "duration",
  "predecessors",
];

export const stripComputed = (activities) =>
  activities.map((a) =>
    EDITABLE_KEYS.reduce((acc, k) => {
      acc[k] = a[k] ?? (k === "duration" ? 0 : k === "predecessors" ? [] : "");
      return acc;
    }, {}),
  );
