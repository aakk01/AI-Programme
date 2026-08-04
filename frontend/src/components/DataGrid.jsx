import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Diamond, GripVertical, Plus, Trash2 } from "lucide-react";
import { formatLinks, parseLinks } from "@/lib/links";
import { Button } from "@/components/ui/button";

const COLS = [
  { key: "activity_id", label: "Activity ID", w: "w-[96px]" },
  { key: "wbs_l1", label: "WBS L1", w: "w-[190px]" },
  { key: "description", label: "Description", w: "" },
  { key: "type", label: "Type", w: "w-[84px]" },
  { key: "duration", label: "Dur", w: "w-[52px]", num: true },
  { key: "predecessors", label: "Predecessors", w: "w-[140px]" },
  { key: "successors", label: "Successors", w: "w-[130px]", ro: true },
  { key: "constraint_type", label: "Cons.", w: "w-[64px]" },
  { key: "constraint_date", label: "Cons. Date", w: "w-[100px]" },
  { key: "start", label: "Start", w: "w-[100px]", ro: true },
  { key: "finish", label: "Finish", w: "w-[100px]", ro: true },
  { key: "total_float", label: "Float", w: "w-[52px]", ro: true, num: true },
];

const TYPES = ["Task", "Milestone", "Summary"];
const CONSTRAINTS = ["", "SNET", "FNLT", "MSO"];
const SELECTS = { type: TYPES, constraint_type: CONSTRAINTS };

const cellValue = (a, key) =>
  key === "predecessors" ? formatLinks(a.predecessors) : (a[key] ?? "");

const parseValue = (key, raw) => {
  if (key === "predecessors") return parseLinks(raw);
  if (key === "duration") return Math.max(0, parseInt(raw, 10) || 0);
  if (key === "type") {
    const v = String(raw).trim();
    const hit = TYPES.find((t) => t.toLowerCase() === v.toLowerCase());
    if (!hit) throw new Error(`Type must be one of ${TYPES.join(" / ")}`);
    return hit;
  }
  if (key === "constraint_type") {
    const v = String(raw).trim().toUpperCase();
    if (!CONSTRAINTS.includes(v))
      throw new Error("Constraint must be SNET, FNLT, MSO or blank");
    return v;
  }
  return String(raw);
};

const blankFor = (key) =>
  key === "predecessors" ? [] : key === "duration" ? 0 : "";

const norm = (sel) => ({
  r1: Math.min(sel.r1, sel.r2),
  r2: Math.max(sel.r1, sel.r2),
  c1: Math.min(sel.c1, sel.c2),
  c2: Math.max(sel.c1, sel.c2),
});

export const DataGrid = ({
  activities,
  selectedId,
  onSelect,
  onApplyEdits,
  onAdd,
  onDelete,
  onReorder,
  reorderEnabled = true,
  rowHeight = 26,
}) => {
  const [draft, setDraft] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [sel, setSel] = useState(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (sel && sel.r2 >= activities.length) setSel(null);
  }, [activities.length, sel]);

  const editsFor = (range, valueAt) => {
    const out = [];
    for (let r = range.r1; r <= range.r2; r += 1) {
      for (let c = range.c1; c <= range.c2; c += 1) {
        const col = COLS[c];
        if (col.ro) continue;
        const a = activities[r];
        if (!a) continue;
        const raw = valueAt(r, c);
        if (raw === undefined) continue;
        out.push({ activity_id: a.activity_id, key: col.key, value: raw });
      }
    }
    return out;
  };

  const apply = (edits) => {
    if (!edits.length) return;
    try {
      onApplyEdits(
        edits.map((e) => ({ ...e, value: parseValue(e.key, e.value) })),
      );
    } catch (err) {
      toast.error(err.message);
    }
  };

  const commit = (rowIdx, key, value) => {
    const range = sel ? norm(sel) : null;
    const multi =
      range && range.r1 !== range.r2 && rowIdx >= range.r1 && rowIdx <= range.r2;
    const rows = multi
      ? Array.from({ length: range.r2 - range.r1 + 1 }, (_, i) => range.r1 + i)
      : [rowIdx];
    apply(
      rows
        .filter((r) => activities[r])
        .map((r) => ({ activity_id: activities[r].activity_id, key, value })),
    );
    setDraft(null);
    wrapRef.current?.focus();
  };

  const startEdit = (r, c, initial) => {
    const col = COLS[c];
    if (col.ro) return;
    setDraft({
      r,
      key: col.key,
      value: initial !== undefined ? initial : cellValue(activities[r], col.key),
    });
  };

  const selectCell = (r, c, extend) => {
    setSel((prev) =>
      extend && prev ? { ...prev, r2: r, c2: c } : { r1: r, c1: c, r2: r, c2: c },
    );
    onSelect(activities[r]?.activity_id);
  };

  const copyRange = () => {
    const range = norm(sel);
    const rows = [];
    for (let r = range.r1; r <= range.r2; r += 1) {
      const cells = [];
      for (let c = range.c1; c <= range.c2; c += 1)
        cells.push(String(cellValue(activities[r], COLS[c].key)));
      rows.push(cells.join("\t"));
    }
    const text = rows.join("\n");
    navigator.clipboard?.writeText(text).catch(() => {});
    toast.success(`Copied ${range.r2 - range.r1 + 1} row(s)`);
  };

  const onPaste = (e) => {
    if (!sel || draft) return;
    const text = e.clipboardData?.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    const rows = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((l) => l.split("\t"));
    const { r1, c1 } = norm(sel);
    const edits = [];
    rows.forEach((cells, ri) => {
      cells.forEach((raw, ci) => {
        const a = activities[r1 + ri];
        const col = COLS[c1 + ci];
        if (!a || !col || col.ro) return;
        edits.push({ activity_id: a.activity_id, key: col.key, value: raw });
      });
    });
    apply(edits);
    toast.success(`Pasted ${rows.length} row(s)`);
  };

  const onKeyDown = (e) => {
    if (draft || !sel) return;
    const range = norm(sel);
    const move = (dr, dc) => {
      e.preventDefault();
      const r = Math.max(0, Math.min(activities.length - 1, sel.r2 + dr));
      const c = Math.max(0, Math.min(COLS.length - 1, sel.c2 + dc));
      if (e.shiftKey) setSel({ ...sel, r2: r, c2: c });
      else selectCell(r, c, false);
    };
    const mod = e.ctrlKey || e.metaKey;

    if (e.key === "ArrowDown") return move(1, 0);
    if (e.key === "ArrowUp") return move(-1, 0);
    if (e.key === "ArrowRight") return move(0, 1);
    if (e.key === "ArrowLeft") return move(0, -1);
    if (mod && e.key.toLowerCase() === "c") {
      e.preventDefault();
      return copyRange();
    }
    if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault();
      return apply(
        editsFor({ ...range, r1: range.r1 + 1 }, (r, c) =>
          String(cellValue(activities[range.r1], COLS[c].key)),
        ),
      );
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      return apply(editsFor(range, (r, c) => String(blankFor(COLS[c].key))));
    }
    if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      return startEdit(sel.r2, sel.c2);
    }
    if (!mod && !e.altKey && e.key.length === 1) {
      e.preventDefault();
      return startEdit(sel.r2, sel.c2, e.key);
    }
  };

  const drop = (targetId) => {
    if (dragId && targetId && dragId !== targetId) onReorder(dragId, targetId);
    setDragId(null);
  };

  const inRange = (r, c) => {
    if (!sel) return false;
    const n = norm(sel);
    return r >= n.r1 && r <= n.r2 && c >= n.c1 && c <= n.c2;
  };

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      className="h-full overflow-auto outline-none"
      data-testid="data-grid"
    >
      <table className="w-full table-fixed border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-[hsl(var(--surface))]">
          <tr>
            <th className="w-8 border-b border-r border-border px-1 py-1.5 font-mono-data text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              #
            </th>
            {COLS.map((c) => (
              <th
                key={c.key}
                className={`${c.w} border-b border-r border-border px-2 py-1.5 font-mono-data text-[10px] font-medium uppercase tracking-wider text-muted-foreground ${c.num ? "text-right" : ""}`}
              >
                {c.label}
              </th>
            ))}
            <th className="w-10 border-b border-border" />
          </tr>
        </thead>
        <tbody>
          {activities.map((a, i) => {
            const isRow = a.activity_id === selectedId;
            return (
              <tr
                key={`${a.activity_id}-${i}`}
                data-testid={`grid-row-${a.activity_id}`}
                draggable={reorderEnabled}
                onDragStart={() => setDragId(a.activity_id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drop(a.activity_id)}
                onDragEnd={() => setDragId(null)}
                style={{ height: rowHeight }}
                className={`group ${dragId === a.activity_id ? "opacity-40" : ""} ${
                  isRow ? "bg-[hsl(var(--bar))]/[0.07]" : "hover:bg-[hsl(var(--surface))]"
                }`}
              >
                <td className="border-b border-r border-border px-1 text-center font-mono-data text-[10px] text-muted-foreground">
                  <span className={reorderEnabled ? "group-hover:hidden" : ""}>
                    {i + 1}
                  </span>
                  {reorderEnabled && (
                    <GripVertical
                      data-testid={`drag-handle-${a.activity_id}`}
                      className="mx-auto hidden h-3 w-3 cursor-grab group-hover:block"
                    />
                  )}
                </td>
                {COLS.map((c, ci) => {
                  const editing = draft && draft.r === i && draft.key === c.key;
                  const selected = inRange(i, ci);
                  return (
                    <td
                      key={c.key}
                      data-testid={`cellbox-${c.key}-${a.activity_id}`}
                      onMouseDown={(e) => selectCell(i, ci, e.shiftKey)}
                      onDoubleClick={() => startEdit(i, ci)}
                      className={`cursor-cell border-b border-r border-border font-mono-data text-[12px] ${
                        c.num ? "text-right" : ""
                      } ${selected ? "bg-[hsl(var(--bar))]/20 ring-1 ring-inset ring-[hsl(var(--ring))]/40" : ""} ${
                        c.key === "total_float" && a.critical
                          ? "font-semibold text-[hsl(var(--bar-critical))]"
                          : c.ro
                            ? "text-muted-foreground"
                            : ""
                      }`}
                    >
                      {editing ? (
                        SELECTS[c.key] ? (
                          <select
                            autoFocus
                            data-testid={`cell-${c.key}-${a.activity_id}`}
                            className="cell-input"
                            value={draft.value}
                            onChange={(e) => commit(i, c.key, e.target.value)}
                            onBlur={() => setDraft(null)}
                          >
                            {SELECTS[c.key].map((t) => (
                              <option key={t || "none"} value={t}>
                                {t || "—"}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            autoFocus
                            data-testid={`cell-${c.key}-${a.activity_id}`}
                            type={c.key === "constraint_date" ? "date" : "text"}
                            className={`cell-input ${c.num ? "text-right" : ""}`}
                            value={draft.value || ""}
                            onChange={(e) =>
                              setDraft({ ...draft, value: e.target.value })
                            }
                            onBlur={() => commit(i, c.key, draft.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commit(i, c.key, draft.value);
                              if (e.key === "Escape") setDraft(null);
                              e.stopPropagation();
                            }}
                          />
                        )
                      ) : (
                        <span
                          className={`block truncate px-2 py-[3px] ${
                            a.type === "Summary" ? "font-semibold" : ""
                          }`}
                        >
                          {c.key === "description" && a.type === "Milestone" ? (
                            <span className="flex items-center gap-1.5">
                              <Diamond className="h-2.5 w-2.5 shrink-0 fill-[hsl(var(--bar-milestone))] text-[hsl(var(--bar-milestone))]" />
                              {a.description}
                            </span>
                          ) : (
                            cellValue(a, c.key)
                          )}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="border-b border-border text-center">
                  <button
                    data-testid={`delete-row-${a.activity_id}`}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(i);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-[hsl(var(--bar-critical))]" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center gap-3 border-b border-border p-2">
        <Button
          data-testid="add-activity-button"
          variant="outline"
          size="sm"
          className="h-7 rounded-sm text-xs"
          onClick={onAdd}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add activity
        </Button>
        <span className="font-mono-data text-[10px] uppercase tracking-wider text-muted-foreground">
          Shift+click to select a range · Ctrl+D fill down · Ctrl+C / Ctrl+V ·
          Del clears · Ctrl+Z undo
        </span>
      </div>
    </div>
  );
};
