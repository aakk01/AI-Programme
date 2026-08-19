import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  AlertCircle,
  Check,
  Calendar,
  Layers,
  Clock,
  Link as LinkIcon,
  Percent,
  CheckCircle2,
  ChevronRight,
  Filter,
  Edit2,
  Copy,
  ArrowDown,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { parsePredecessors, formatPredecessors } from "@/lib/links";
import { formatDate } from "@/lib/utils";

export const GRID_ROW_HEIGHT = 40;
export const GRID_HEADER_HEIGHT = 48;

const DEFAULT_COLUMN_WIDTHS = {
  index: 38,
  id: 85,
  wbs: 150,
  name: 240,
  duration: 72,
  percent: 80,
  predecessors: 130,
  early_start: 95,
  early_finish: 95,
  total_float: 75,
  bl_start: 90,
  bl_finish: 90,
  bl_var: 65,
  actions: 60,
};

const MIN_COLUMN_WIDTHS = {
  index: 30,
  id: 60,
  wbs: 90,
  name: 120,
  duration: 55,
  percent: 65,
  predecessors: 80,
  early_start: 75,
  early_finish: 75,
  total_float: 60,
  bl_start: 70,
  bl_finish: 70,
  bl_var: 50,
  actions: 50,
};

const STAGE_SUGGESTIONS = [
  "Preliminaries",
  "Substructure",
  "Superstructure",
  "Façade & Envelope",
  "Internal Fit-Out & MEP",
  "Commissioning & Handover",
  "External Works & Landscaping",
];

export function DataGrid({
  activities = [],
  baselineComparison = null,
  showBaselineCols = false,
  onActivitiesChange,
  onAddActivity,
  onEditActivity,
  onDeleteActivity,
  onDuplicateActivity,
  highlightedActivityId = null,
  onSelectActivity,
  scrollRef = null,
  onScroll = null,
}) {
  const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMN_WIDTHS);
  const [resizingCol, setResizingCol] = useState(null);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(0);

  const [editingCell, setEditingCell] = useState(null); // { id, field }
  const [editValue, setEditValue] = useState("");
  const [errorCell, setErrorCell] = useState(null);
  const inputRef = useRef(null);

  // Column Resizing Logic
  const handleStartResize = (colKey, e) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingCol(colKey);
    resizeStartXRef.current = e.clientX;
    resizeStartWidthRef.current = columnWidths[colKey] || DEFAULT_COLUMN_WIDTHS[colKey] || 80;

    const handleMouseMove = (moveEvent) => {
      const delta = moveEvent.clientX - resizeStartXRef.current;
      const minW = MIN_COLUMN_WIDTHS[colKey] || 40;
      const newWidth = Math.max(minW, resizeStartWidthRef.current + delta);
      setColumnWidths((prev) => ({
        ...prev,
        [colKey]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      setResizingCol(null);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleResetColWidth = (colKey, e) => {
    e.stopPropagation();
    setColumnWidths((prev) => ({
      ...prev,
      [colKey]: DEFAULT_COLUMN_WIDTHS[colKey],
    }));
  };

  const handleResetAllWidths = () => {
    setColumnWidths(DEFAULT_COLUMN_WIDTHS);
  };

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current.select) inputRef.current.select();
    }
  }, [editingCell]);

  const handleStartEdit = (act, field) => {
    // Read-only calculated CPM fields
    if (["early_start", "early_finish", "late_start", "late_finish", "total_float", "free_float"].includes(field)) {
      return;
    }
    const actId = act.id || act.activity_id;
    setEditingCell({ id: actId, field });
    if (field === "predecessors") {
      setEditValue(formatPredecessors(act.predecessors));
    } else if (field === "name" || field === "description") {
      setEditValue(act.name || act.description || "");
    } else if (field === "id" || field === "activity_id") {
      setEditValue(act.id || act.activity_id || "");
    } else if (field === "wbs" || field === "stage" || field === "wbs_code") {
      setEditValue(act.stage || act.wbs_l1 || act.wbs_code || "");
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
          if (field === "name" || field === "description") {
            res.name = updatedFieldVal;
            res.description = updatedFieldVal;
          }
          if (field === "id" || field === "activity_id") {
            res.id = updatedFieldVal;
            res.activity_id = updatedFieldVal;
          }
          if (field === "wbs" || field === "stage" || field === "wbs_code") {
            res.stage = updatedFieldVal;
            res.wbs_l1 = updatedFieldVal;
          }
          if (field === "percent_complete" || field === "progress") {
            res.percent_complete = updatedFieldVal;
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

  // Helper render for draggable column header with resize handle
  const renderColHeader = (colKey, title, align = "left") => (
    <th
      className={`px-2 relative group/th select-none font-semibold text-slate-300 text-[11px] ${
        align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left"
      }`}
      style={{ width: `${columnWidths[colKey]}px`, minWidth: `${MIN_COLUMN_WIDTHS[colKey]}px` }}
    >
      <div className="truncate pr-1" title={title}>
        {title}
      </div>
      {/* Draggable Column Resizer */}
      <div
        onMouseDown={(e) => handleStartResize(colKey, e)}
        onDoubleClick={(e) => handleResetColWidth(colKey, e)}
        title="Drag to resize column. Double click to reset width."
        className={`absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-30 transition-colors ${
          resizingCol === colKey
            ? "bg-emerald-400 w-2"
            : "group-hover/th:bg-emerald-500/50 hover:bg-emerald-400"
        }`}
      />
    </th>
  );

  return (
    <div className="flex flex-col h-full bg-slate-900/95 dark:bg-slate-950/95 border-r border-slate-800 text-slate-200 select-none">
      {/* Grid Toolbar Header */}
      <div className="h-10 px-3 border-b border-slate-800 flex items-center justify-between bg-slate-900 dark:bg-slate-950 text-xs shrink-0 z-20">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-emerald-400" />
            Interactive Schedule Grid ({activities.length})
          </span>
          {showBaselineCols && (
            <Badge variant="outline" className="text-[9px] h-5 text-amber-400 border-amber-500/30 bg-amber-500/10">
              BL Overlay Active
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[10px] px-2 text-slate-400 hover:text-slate-200"
            onClick={handleResetAllWidths}
            title="Reset all column widths to default"
          >
            <RotateCcw className="h-3 w-3 mr-1" /> Reset Widths
          </Button>

          <Button
            size="sm"
            className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs font-semibold"
            onClick={onAddActivity}
          >
            <Plus className="h-3.5 w-3.5" /> Add Task
          </Button>
        </div>
      </div>

      {/* Table Body Scroll Container (Synchronized with Gantt Chart) */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-auto bg-slate-900/95 dark:bg-slate-950/95"
      >
        <table className="w-full text-xs text-left border-collapse select-none table-fixed">
          {/* Column Group for Live Resizing Widths */}
          <colgroup>
            <col style={{ width: `${columnWidths.index}px` }} />
            <col style={{ width: `${columnWidths.id}px` }} />
            <col style={{ width: `${columnWidths.wbs}px` }} />
            <col style={{ width: `${columnWidths.name}px` }} />
            <col style={{ width: `${columnWidths.duration}px` }} />
            <col style={{ width: `${columnWidths.percent}px` }} />
            <col style={{ width: `${columnWidths.predecessors}px` }} />
            <col style={{ width: `${columnWidths.early_start}px` }} />
            <col style={{ width: `${columnWidths.early_finish}px` }} />
            <col style={{ width: `${columnWidths.total_float}px` }} />
            {showBaselineCols && (
              <>
                <col style={{ width: `${columnWidths.bl_start}px` }} />
                <col style={{ width: `${columnWidths.bl_finish}px` }} />
                <col style={{ width: `${columnWidths.bl_var}px` }} />
              </>
            )}
            <col style={{ width: `${columnWidths.actions}px` }} />
          </colgroup>

          {/* Sticky Table Header */}
          <thead className="sticky top-0 bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-md z-20 border-b border-slate-800 text-slate-400 text-[11px]">
            <tr style={{ height: `${GRID_HEADER_HEIGHT}px` }}>
              {renderColHeader("index", "#", "center")}
              {renderColHeader("id", "Activity ID")}
              {renderColHeader("wbs", "WBS (Stage)")}
              {renderColHeader("name", "Task Name")}
              {renderColHeader("duration", "Duration", "center")}
              {renderColHeader("percent", "% Done", "center")}
              {renderColHeader("predecessors", "Predecessors")}
              {renderColHeader("early_start", "Early Start")}
              {renderColHeader("early_finish", "Early Finish")}
              {renderColHeader("total_float", "Total Float", "center")}
              {showBaselineCols && (
                <>
                  {renderColHeader("bl_start", "BL Start")}
                  {renderColHeader("bl_finish", "BL Finish")}
                  {renderColHeader("bl_var", "Var (d)", "center")}
                </>
              )}
              {renderColHeader("actions", "Actions", "center")}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800/70">
            {activities.length === 0 ? (
              <tr>
                <td colSpan={showBaselineCols ? 14 : 11} className="p-12 text-center text-slate-500">
                  <div className="max-w-xs mx-auto space-y-2">
                    <p className="text-sm font-medium text-slate-400">No activities in schedule</p>
                    <p className="text-xs text-slate-500">
                      Click <strong className="text-emerald-400">+ Add Task</strong> to insert your first construction activity.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              activities.map((act, index) => {
                const actId = act.id || act.activity_id || `act-${index + 1}`;
                const actName = act.name || act.description || actId;
                const actStage = act.stage || act.wbs_l1 || act.wbs_l2 || act.wbs_code || "General Works";
                const isCritical = act.critical || (act.total_float !== undefined && act.total_float <= 0);
                const isMilestone = act.is_milestone || act.type === "Milestone" || act.duration === 0;
                const isHighlighted =
                  highlightedActivityId === actId ||
                  highlightedActivityId === act.id ||
                  highlightedActivityId === act.activity_id;
                const bl =
                  baselineComparison?.[actId] ||
                  baselineComparison?.[act.id] ||
                  baselineComparison?.[act.activity_id];
                const pct = Math.min(100, Math.max(0, parseFloat(act.percent_complete ?? act.progress ?? 0) || 0));

                return (
                  <tr
                    key={`grid-row-${actId}-${index}`}
                    onClick={() => onSelectActivity?.(actId)}
                    onDoubleClick={() => onEditActivity?.(act)}
                    style={{
                      height: `${GRID_ROW_HEIGHT}px`,
                      minHeight: `${GRID_ROW_HEIGHT}px`,
                      maxHeight: `${GRID_ROW_HEIGHT}px`,
                    }}
                    className={`transition-colors group cursor-pointer border-b border-slate-800/60 ${
                      isHighlighted
                        ? "bg-emerald-500/15 border-emerald-500/40"
                        : isCritical
                        ? "bg-rose-500/[0.04] hover:bg-rose-500/[0.08]"
                        : "hover:bg-slate-800/50"
                    }`}
                  >
                    {/* Index */}
                    <td className="px-2 text-center text-slate-500 font-mono text-[11px]">
                      {index + 1}
                    </td>

                    {/* Activity ID */}
                    <td className="px-2 font-mono text-[11px] font-medium text-emerald-400">
                      {editingCell?.id === actId && (editingCell?.field === "id" || editingCell?.field === "activity_id") ? (
                        <Input
                          ref={inputRef}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={handleSaveEdit}
                          onKeyDown={handleKeyDown}
                          className="h-6 text-xs font-mono p-1 bg-slate-900 border-emerald-500 text-emerald-300"
                        />
                      ) : (
                        <span
                          className="hover:underline hover:text-emerald-300 cursor-text truncate block"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleStartEdit(act, "activity_id");
                          }}
                          title="Double click to inline edit ID"
                        >
                          {actId}
                        </span>
                      )}
                    </td>

                    {/* WBS (Shows Stage Name) */}
                    <td className="px-2 text-slate-300">
                      {editingCell?.id === actId && (editingCell?.field === "stage" || editingCell?.field === "wbs" || editingCell?.field === "wbs_code") ? (
                        <div className="flex items-center gap-1">
                          <Input
                            ref={inputRef}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleSaveEdit}
                            onKeyDown={handleKeyDown}
                            list="stage-datalist"
                            className="h-6 text-xs p-1 bg-slate-900 border-slate-700 text-slate-200"
                          />
                          <datalist id="stage-datalist">
                            {STAGE_SUGGESTIONS.map((st) => (
                              <option key={st} value={st} />
                            ))}
                          </datalist>
                        </div>
                      ) : (
                        <span
                          className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800/80 border border-slate-700/60 text-slate-300 truncate block max-w-full"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleStartEdit(act, "stage");
                          }}
                          title={`Stage: ${actStage}`}
                        >
                          {actStage}
                        </span>
                      )}
                    </td>

                    {/* Task Name */}
                    <td className="px-2 font-medium text-slate-200">
                      {editingCell?.id === actId && (editingCell?.field === "name" || editingCell?.field === "description") ? (
                        <Input
                          ref={inputRef}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={handleSaveEdit}
                          onKeyDown={handleKeyDown}
                          className="h-6 text-xs p-1 bg-slate-900 border-emerald-500 text-white"
                        />
                      ) : (
                        <div
                          className="flex items-center gap-1.5 truncate"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleStartEdit(act, "name");
                          }}
                          title="Double click to edit task name"
                        >
                          {isMilestone && (
                            <span
                              className={`h-2.5 w-2.5 rotate-45 shrink-0 inline-block ${
                                isCritical ? "bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]" : "bg-amber-400"
                              }`}
                            />
                          )}
                          <span
                            className={`truncate ${
                              isCritical ? "text-white font-medium" : "text-slate-200"
                            }`}
                          >
                            {actName}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Duration */}
                    <td className="px-2 text-center font-mono">
                      {editingCell?.id === actId && editingCell?.field === "duration" ? (
                        <Input
                          ref={inputRef}
                          type="number"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={handleSaveEdit}
                          onKeyDown={handleKeyDown}
                          className="h-6 text-xs font-mono text-center p-1 bg-slate-900 border-emerald-500 text-white"
                        />
                      ) : (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
                            act.duration === 0
                              ? "text-amber-400 bg-amber-500/10 border border-amber-500/20"
                              : "text-slate-300 hover:bg-slate-800"
                          }`}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleStartEdit(act, "duration");
                          }}
                          title="Double click to edit duration"
                        >
                          {act.duration}d
                        </span>
                      )}
                    </td>

                    {/* % Done */}
                    <td className="px-2 text-center font-mono">
                      {editingCell?.id === actId && (editingCell?.field === "percent_complete" || editingCell?.field === "progress") ? (
                        <Input
                          ref={inputRef}
                          type="number"
                          min="0"
                          max="100"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={handleSaveEdit}
                          onKeyDown={handleKeyDown}
                          className="h-6 text-xs font-mono text-center p-1 w-14 mx-auto bg-slate-900 border-emerald-500 text-white"
                        />
                      ) : (
                        <div
                          className="flex items-center justify-center gap-1 cursor-pointer group/pct"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleStartEdit(act, "percent_complete");
                          }}
                          title="Double click to edit % completion"
                        >
                          <div className="w-8 bg-slate-800 rounded-full h-1.5 overflow-hidden border border-slate-700/60">
                            <div
                              className={`h-full rounded-full ${
                                pct >= 100
                                  ? "bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.8)]"
                                  : pct > 0
                                  ? "bg-blue-500"
                                  : "bg-transparent"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span
                            className={`text-[10px] font-semibold ${
                              pct >= 100
                                ? "text-emerald-400"
                                : pct > 0
                                ? "text-blue-400"
                                : "text-slate-500"
                            }`}
                          >
                            {pct}%
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Predecessors */}
                    <td className="px-2 font-mono text-[11px]">
                      {editingCell?.id === actId && editingCell?.field === "predecessors" ? (
                        <div className="relative">
                          <Input
                            ref={inputRef}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleSaveEdit}
                            onKeyDown={handleKeyDown}
                            className={`h-6 text-xs font-mono p-1 bg-slate-900 ${
                              errorCell ? "border-rose-500 text-rose-300" : "border-emerald-500 text-white"
                            }`}
                          />
                          {errorCell && (
                            <span className="absolute left-0 top-7 z-30 text-[10px] text-rose-400 bg-slate-950 border border-rose-500/40 rounded px-1 shadow-lg whitespace-nowrap">
                              {errorCell.message}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span
                          className="text-slate-400 hover:text-slate-200 cursor-text truncate block"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleStartEdit(act, "predecessors");
                          }}
                          title="Double click to edit logic links (e.g. A1010FS, A1000SS+3d)"
                        >
                          {formatPredecessors(act.predecessors) || "-"}
                        </span>
                      )}
                    </td>

                    {/* Early Start */}
                    <td className="px-2 font-mono text-[11px] text-slate-400 truncate">
                      {formatDate(act.early_start || act.start)}
                    </td>

                    {/* Early Finish */}
                    <td className="px-2 font-mono text-[11px] text-slate-400 truncate">
                      {formatDate(act.early_finish || act.finish)}
                    </td>

                    {/* Total Float */}
                    <td className="px-2 text-center font-mono">
                      {isCritical ? (
                        <span className="text-rose-400 font-bold bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.5 rounded text-[10px] shadow-[0_0_6px_rgba(244,63,94,0.3)] inline-block">
                          {act.total_float !== undefined ? `${act.total_float}d` : "0d"}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">
                          {act.total_float !== undefined ? `${act.total_float}d` : "-"}
                        </span>
                      )}
                    </td>

                    {/* Baseline Columns */}
                    {showBaselineCols && (
                      <>
                        <td className="px-2 font-mono text-[10px] bg-amber-500/5 text-amber-300/80 truncate">
                          {bl ? formatDate(bl.baseline_start) : "-"}
                        </td>
                        <td className="px-2 font-mono text-[10px] bg-amber-500/5 text-amber-300/80 truncate">
                          {bl ? formatDate(bl.baseline_finish) : "-"}
                        </td>
                        <td className="px-2 text-center font-mono text-[11px] bg-amber-500/5">
                          {bl && bl.finish_variance_days !== undefined ? (
                            <span
                              className={
                                bl.finish_variance_days > 0
                                  ? "text-rose-400 font-bold"
                                  : bl.finish_variance_days < 0
                                  ? "text-emerald-400 font-bold"
                                  : "text-slate-400"
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

                    {/* Actions: Edit modal, Duplicate, Delete */}
                    <td className="px-1 text-center">
                      <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditActivity?.(act);
                          }}
                          className="text-slate-400 hover:text-emerald-400 p-1 transition-colors"
                          title="Edit activity in dialog"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="text-slate-400 hover:text-slate-200 p-1"
                              title="More options"
                            >
                              <ChevronRight className="h-3 w-3" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-slate-900 border-slate-700 text-slate-200">
                            <DropdownMenuItem onClick={() => onEditActivity?.(act)}>
                              <Edit2 className="h-3.5 w-3.5 mr-2 text-emerald-400" /> Edit Details...
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onDuplicateActivity?.(act)}>
                              <Copy className="h-3.5 w-3.5 mr-2 text-blue-400" /> Duplicate Task
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-slate-800" />
                            <DropdownMenuItem
                              onClick={() => onDeleteActivity?.(actId)}
                              className="text-rose-400 focus:text-rose-300"
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete Activity
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
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

export default DataGrid;
