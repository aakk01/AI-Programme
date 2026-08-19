const LINK_RE = /^\s*([A-Za-z0-9_.\-]+?)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+)?\s*d?\s*$/i;

export function parsePredecessors(text) {
  if (!text || !String(text).trim()) return [];
  const out = [];
  const parts = String(text).split(/[,;]/);
  for (let part of parts) {
    part = part.trim();
    if (!part) continue;
    const m = part.match(LINK_RE);
    if (!m) {
      throw new Error(`Invalid link syntax: '${part}'. Examples: A1000, A1000FS, A1000SS+5d`);
    }
    const pid = m[1];
    const ltype = (m[2] || "FS").toUpperCase();
    const lagStr = m[3];
    const lag = lagStr ? parseInt(lagStr.replace(/\s+/g, ""), 10) : 0;
    out.push({ id: pid, type: ltype, lag: isNaN(lag) ? 0 : lag });
  }
  return out;
}

export function formatPredecessors(preds = []) {
  if (!preds || !Array.isArray(preds)) return "";
  const parts = [];
  for (const p of preds) {
    if (!p || !p.id) continue;
    const lag = p.lag || 0;
    let s = `${p.id}${p.type || "FS"}`;
    if (lag) {
      s += `${lag > 0 ? "+" : "-"}${Math.abs(lag)}d`;
    }
    parts.push(s);
  }
  return parts.join(", ");
}
