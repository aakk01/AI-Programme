import React, { useState, useRef, useEffect } from "react";
import {
  Plus,
  Trash2,
  GripVertical,
  AlertCircle,
  Check,
  Calendar,
  Layers,
  Clock,
  Link as LinkIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parsePredecessors, formatPredecessors } from "@/lib/links";
import { formatDate } from "@/lib/utils";

export function DataGrid({
  activities = [],
  baselineComparison = null,
  showBaselineCols = false,
  onActivitiesChange,
  onAddActivity,
  onDeleteActivity,
  highlightedActivityId = null,
  onSelectActivity,
}) {
  const [editingCell, setEditingCell] = useState(null); // { id, field }
  const [editValue, setEditValue] = useState("");
  const [errorCell, setErrorCell] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingCell]);

  const handleStartEdit = (act, field) => {
    // Read-only calculated fields
    if (["early_start", "early_finish", "late_start", "late_finish", "total_float", "free_float"].includes(field)) {
      return;
    }
    const actId = act.id || act.activity_id;
    setEditingCell({ id: actId, field });
    if (field === "predecessors") {
      setEditValue(formatPredecessors(act.predecessors));
    } else if (field === "name") {
      setEditValue(act.name || act.description || "");
    } else if (field === "id") {
      setEditValue(act.id || act.activity_id || "");
    } else if (field === "stage") {
      setEditValue(act.stage || act.wbs_l1 || "");
    } else {
      setEditValue(act[field] !== undefined ? String(act[field]) : "");
    }
    setErrorCell(null);
  };

  const handleSaveEdit = () => {
    if (!editingCell) return;
    const { id, field } = editingCell;
    const currentAct = activities.find((a) => (a.id || a.activity_id) === id);
    if (!currentAct) {
      setEditingCell(null);
      return;
    }

    try {
      let updatedFieldVal = editValue;
      if (field === "duration") {
        const d = parseInt(editValue, 10);
        updatedFieldVal = isNaN(d) ? 0 : Math.max(0, d);
      } else if (field === "percent_complete" || field === "progress") {
        const p = parseFloat(editValue);
        updatedFieldVal = isNaN(p) ? 0 : Math.min(100, Math.max(0, Math.round(p)));
      } else if (field === "predecessors") {
        updatedFieldVal = parsePredecessors(editValue);
      }

      const updated = activities.map((a) => {
        if ((a.id || a.activity_id) === id) {
          const res = {
            ...a,
            [field]: updatedFieldVal,
            is_milestone: field === "duration" ? updatedFieldVal === 0 : a.is_milestone,
          };
          if (field === "name") {
            res.description = updatedFieldVal;
          }
          if (field === "id") {
            res.activity_id = updatedFieldVal;
          }
          if (field === "stage") {
            res.wbs_l1 = updatedFieldVal;
          }
          if (field === "percent_complete") {
            res.progress = updatedFieldVal;
          }
          return res;
        }
        return a;
      });

      onActivitiesChange?.(updated);
      setEditingCell(null);
      setErrorCell(null);
    } catch (err) {
      setErrorCell({ id, field, message: err.message });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === "Escape") {
      setEditingCell(null);
      setErrorCell(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-card border-r">
      {/* Grid Toolbar */}
      <div className="p-2 border-b flex items-center justify-between bg-muted/20 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-muted-foreground uppercase tracking-wider">
            Activity Network ({activities.length})
          </span>
          {showBaselineCols && (
            <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">
              Baseline Overlay Active
            </Badge>
          )}
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onAddActivity}>
          <Plus className="h-3.5 w-3.5" /> Add Task
        </Button>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs text-left border-collapse select-none">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur-xs z-10 font-semibold border-b text-muted-foreground">
            <tr>
              <th className="p-2 w-10 text-center">#</th>
              <th className="p-2 w-20">ID</th>
              <th className="p-2 min-w-[200px]">Activity Name</th>
              <th className="p-2 w-28">Stage / WBS</th>
              <th className="p-2 w-16 text-center">Dur (d)</th>
              <th className="p-2 w-20 text-center">% Done</th>
              <th className="p-2 w-32">Predecessors</th>
              <th className="p-2 w-24">Start</th>
              <th className="p-2 w-24">Finish</th>
              <th className="p-2 w-16 text-center">Float</th>
              {showBaselineCols && (
                <>
                  <th className="p-2 w-24 bg-amber-500/5 text-amber-700 dark:text-amber-400">BL Start</th>
                  <th className="p-2 w-24 bg-amber-500/5 text-amber-700 dark:text-amber-400">BL Finish</th>
                  <th className="p-2 w-16 bg-amber-500/5 text-amber-700 dark:text-amber-400 text-center">Var (d)</th>
                </>
              )}
              <th className="p-2 w-12 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {activities.length === 0 ? (
              <tr>
                <td colSpan={showBaselineCols ? 13 : 10} className="p-8 text-center text-muted-foreground">
                  No activities in schedule. Click "+ Add Task" or generate baseline with AI.
                </td>
              </tr>
            ) : (
              activities.map((act, index) => {
                const actId = act.id || act.activity_id || `act-${index + 1}`;
                const actName = act.name || act.description || actId;
                const actStage = act.stage || act.wbs_l1 || act.wbs_l2 || "General Works";
                const isCritical = act.critical || (act.total_float !== undefined && act.total_float <= 0);
                const isHighlighted = highlightedActivityId === actId || highlightedActivityId === act.id || highlightedActivityId === act.activity_id;
                const bl = baselineComparison?.[actId] || baselineComparison?.[act.id] || baselineComparison?.[act.activity_id];

                return (
                  <tr
                    key={`grid-row-${actId}-${index}`}
                    onClick={() => onSelectActivity?.(actId)}
                    className={`hover:bg-muted/40 transition-colors group cursor-pointer ${
                      isHighlighted ? "bg-primary/10" : isCritical ? "bg-rose-500/[0.03]" : ""
                    }`}
                  >
                    {/* Index */}
                    <td className="p-2 text-center text-muted-foreground font-mono text-[11px]">
                      {index + 1}
                    </td>

                    {/* ID */}
                    <td className="p-2 font-mono font-medium text-primary">
                      {editingCell?.id === actId && editingCell?.field === "id" ? (
                        <Input
                          ref={inputRef}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={handleSaveEdit}
                          onKeyDown={handleKeyDown}
                          className="h-6 text-xs font-mono p-1"
                        />
                      ) : (
                        <span onDoubleClick={() => handleStartEdit(act, "id")}>{actId}</span>
                      )}
                    </td>

                    {/* Name */}
                    <td className="p-2 font-medium">
                      {editingCell?.id === actId && editingCell?.field === "name" ? (
                        <Input
                          ref={inputRef}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={handleSaveEdit}
                          onKeyDown={handleKeyDown}
                          className="h-6 text-xs p-1"
                        />
                      ) : (
                        <div
                          className="flex items-center gap-1.5"
                          onDoubleClick={() => handleStartEdit(act, "name")}
                        >
                          {(act.is_milestone || act.duration === 0) && (
                            <span className="h-2 w-2 rotate-45 bg-amber-500 shrink-0 inline-block" />
                          )}
                          <span className="truncate">{actName}</span>
                        </div>
                      )}
                    </td>

                    {/* Stage */}
                    <td className="p-2 text-muted-foreground">
                      {editingCell?.id === actId && editingCell?.field === "stage" ? (
                        <Input
                          ref={inputRef}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={handleSaveEdit}
                          onKeyDown={handleKeyDown}
                          className="h-6 text-xs p-1"
                        />
                      ) : (
                        <span
                          className="truncate block max-w-[120px]"
                          onDoubleClick={() => handleStartEdit(act, "stage")}
                        >
                          {actStage}
                        </span>
                      )}
                    </td>

                    {/* Duration */}
                    <td className="p-2 text-center font-mono">
                      {editingCell?.id === act.id && editingCell?.field === "duration" ? (
                        <Input
                          ref={inputRef}
                          type="number"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={handleSaveEdit}
                          onKeyDown={handleKeyDown}
                          className="h-6 text-xs font-mono text-center p-1"
                        />
                      ) : (
                        <span
                          className="px-1 py-0.5 rounded hover:bg-muted font-medium"
                          onDoubleClick={() => handleStartEdit(act, "duration")}
                        >
                          {act.duration}d
                        </span>
                      )}
                    </td>

                    {/* % Done */}
                    <td className="p-2 text-center font-mono">
                      {editingCell?.id === act.id && (editingCell?.field === "percent_complete" || editingCell?.field === "progress") ? (
                        <Input
                          ref={inputRef}
                          type="number"
                          min="0"
                          max="100"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={handleSaveEdit}
                          onKeyDown={handleKeyDown}
                          className="h-6 text-xs font-mono text-center p-1 w-16 mx-auto"
                        />
                      ) : (
                        <div
                          className="flex items-center justify-center gap-1.5 cursor-pointer group/pct"
                          onDoubleClick={() => handleStartEdit(act, "percent_complete")}
                          title="Double click to edit percentage (0-100%)"
                        >
                          <div className="w-10 bg-muted rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                (act.percent_complete ?? act.progress ?? 0) >= 100
                                  ? "bg-emerald-500"
                                  : (act.percent_complete ?? act.progress ?? 0) > 0
                                  ? "bg-blue-500"
                                  : "bg-transparent"
                              }`}
                              style={{ width: `${Math.min(100, Math.max(0, act.percent_complete ?? act.progress ?? 0))}%` }}
                            />
                          </div>
                          <span
                            className={`text-[11px] font-semibold ${
                              (act.percent_complete ?? act.progress ?? 0) >= 100
                                ? "text-emerald-600 dark:text-emerald-400"
                                : (act.percent_complete ?? act.progress ?? 0) > 0
                                ? "text-blue-600 dark:text-blue-400"
                                : "text-muted-foreground"
                            }`}
                          >
                            {act.percent_complete ?? act.progress ?? 0}%
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Predecessors */}
                    <td className="p-2 font-mono text-[11px]">
                      {editingCell?.id === act.id && editingCell?.field === "predecessors" ? (
                        <div className="relative">
                          <Input
                            ref={inputRef}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleSaveEdit}
                            onKeyDown={handleKeyDown}
                            className={`h-6 text-xs font-mono p-1 ${
                              errorCell ? "border-destructive text-destructive" : ""
                            }`}
                          />
                          {errorCell && (
                            <span className="absolute left-0 top-7 z-20 text-[10px] text-destructive bg-background border rounded px-1 shadow">
                              {errorCell.message}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span
                          className="text-muted-foreground hover:text-foreground cursor-text block truncate"
                          onDoubleClick={() => handleStartEdit(act, "predecessors")}
                          title="Double click to edit logic links (e.g. A1010FS+2d)"
                        >
                          {formatPredecessors(act.predecessors) || "-"}
                        </span>
                      )}
                    </td>

                    {/* Early Start */}
                    <td className="p-2 font-mono text-[11px] text-muted-foreground">
                      {formatDate(act.early_start || act.start)}
                    </td>

                    {/* Early Finish */}
                    <td className="p-2 font-mono text-[11px] text-muted-foreground">
                      {formatDate(act.early_finish || act.finish)}
                    </td>

                    {/* Total Float */}
                    <td className="p-2 text-center font-mono">
                      {isCritical ? (
                        <span className="text-rose-600 dark:text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded text-[11px]">
                          {act.total_float !== undefined ? `${act.total_float}d` : "0d"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">
                          {act.total_float !== undefined ? `${act.total_float}d` : "-"}
                        </span>
                      )}
                    </td>

                    {/* Baseline Columns */}
                    {showBaselineCols && (
                      <>
                        <td className="p-2 font-mono text-[11px] bg-amber-500/5 text-muted-foreground">
                          {bl ? formatDate(bl.baseline_start) : "-"}
                        </td>
                        <td className="p-2 font-mono text-[11px] bg-amber-500/5 text-muted-foreground">
                          {bl ? formatDate(bl.baseline_finish) : "-"}
                        </td>
                        <td className="p-2 text-center font-mono text-[11px] bg-amber-500/5">
                          {bl && bl.finish_variance_days !== undefined ? (
                            <span
                              className={
                                bl.finish_variance_days > 0
                                  ? "text-rose-600 font-bold"
                                  : bl.finish_variance_days < 0
                                  ? "text-emerald-600 font-bold"
                                  : "text-muted-foreground"
                              }
                            >
                              {bl.finish_variance_days > 0 ? `+${bl.finish_variance_days}d` : `${bl.finish_variance_days}d`}
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                      </>
                    )}

                    {/* Delete action */}
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteActivity?.(act.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                        title="Delete task"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
