import { useState } from "react";
import { toast } from "sonner";
import { Diamond, Plus, Trash2 } from "lucide-react";
import { formatLinks, parseLinks } from "@/lib/links";
import { Button } from "@/components/ui/button";

const COLS = [
  { key: "activity_id", label: "Activity ID", w: "w-[104px]" },
  { key: "wbs_l1", label: "WBS L1", w: "w-[168px]" },
  { key: "description", label: "Description", w: "min-w-[280px]" },
  { key: "type", label: "Type", w: "w-[92px]" },
  { key: "duration", label: "Dur", w: "w-[56px]", num: true },
  { key: "predecessors", label: "Predecessors", w: "w-[168px]" },
  { key: "successors", label: "Successors", w: "w-[168px]", ro: true },
  { key: "start", label: "Start", w: "w-[104px]", ro: true },
  { key: "finish", label: "Finish", w: "w-[104px]", ro: true },
  { key: "total_float", label: "Float", w: "w-[56px]", ro: true, num: true },
];

const TYPES = ["Task", "Milestone", "Summary"];

export const DataGrid = ({
  activities,
  selectedId,
  onSelect,
  onEdit,
  onAdd,
  onDelete,
  rowHeight = 26,
}) => {
  const [draft, setDraft] = useState(null);

  const commit = (index, key, value) => {
    if (key === "predecessors") {
      try {
        onEdit(index, "predecessors", parseLinks(value));
      } catch (e) {
        toast.error(e.message);
      }
    } else if (key === "duration") {
      onEdit(index, "duration", Math.max(0, parseInt(value, 10) || 0));
    } else {
      onEdit(index, key, value);
    }
    setDraft(null);
  };

  const cellValue = (a, key) =>
    key === "predecessors" ? formatLinks(a.predecessors) : (a[key] ?? "");

  return (
    <div className="h-full overflow-auto" data-testid="data-grid">
      <table className="w-full border-collapse text-left">
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
            const selected = a.activity_id === selectedId;
            return (
              <tr
                key={`${a.activity_id}-${i}`}
                data-testid={`grid-row-${a.activity_id}`}
                onClick={() => onSelect(a.activity_id)}
                style={{ height: rowHeight }}
                className={`group cursor-pointer ${
                  selected
                    ? "bg-[hsl(var(--bar))]/10"
                    : "hover:bg-[hsl(var(--surface))]"
                }`}
              >
                <td className="border-b border-r border-border px-1 text-center font-mono-data text-[10px] text-muted-foreground">
                  {i + 1}
                </td>
                {COLS.map((c) => {
                  const editing =
                    draft && draft.i === i && draft.key === c.key && !c.ro;
                  return (
                    <td
                      key={c.key}
                      className={`border-b border-r border-border font-mono-data text-[12px] ${
                        c.num ? "text-right" : ""
                      } ${
                        c.key === "total_float" && a.critical
                          ? "font-semibold text-[hsl(var(--bar-critical))]"
                          : ""
                      } ${c.ro ? "text-muted-foreground" : ""}`}
                      onDoubleClick={() =>
                        !c.ro && setDraft({ i, key: c.key, value: cellValue(a, c.key) })
                      }
                    >
                      {editing ? (
                        c.key === "type" ? (
                          <select
                            autoFocus
                            data-testid={`cell-type-${a.activity_id}`}
                            className="cell-input"
                            value={draft.value}
                            onChange={(e) => commit(i, "type", e.target.value)}
                            onBlur={() => setDraft(null)}
                          >
                            {TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            autoFocus
                            data-testid={`cell-${c.key}-${a.activity_id}`}
                            className={`cell-input ${c.num ? "text-right" : ""}`}
                            value={draft.value}
                            onChange={(e) =>
                              setDraft({ ...draft, value: e.target.value })
                            }
                            onBlur={() => commit(i, c.key, draft.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commit(i, c.key, draft.value);
                              if (e.key === "Escape") setDraft(null);
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
      <div className="border-b border-border p-2">
        <Button
          data-testid="add-activity-button"
          variant="outline"
          size="sm"
          className="h-7 rounded-sm text-xs"
          onClick={onAdd}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add activity
        </Button>
      </div>
    </div>
  );
};
