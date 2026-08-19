import React, { useState, useRef, useMemo, useEffect } from "react";
import { ZoomIn, ZoomOut, Eye, EyeOff, Calendar, AlertTriangle, Sparkles, Navigation, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseDate, formatDate } from "@/lib/utils";
import { GRID_ROW_HEIGHT, GRID_HEADER_HEIGHT } from "./DataGrid";

const ROW_HEIGHT = GRID_ROW_HEIGHT; // 40px
const HEADER_HEIGHT = GRID_HEADER_HEIGHT; // 48px
const MAIN_BAR_HEIGHT = 18;
const BASELINE_BAR_HEIGHT = 8;

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}

export function GanttChart({
  activities = [],
  schedule = {},
  baselineComparison = null,
  highlightedActivityId = null,
  onSelectActivity,
  scrollRef = null,
  onScroll = null,
}) {
  const [zoomLevel, setZoomLevel] = useState("week"); // "day" | "week" | "month"
  const [showLinks, setShowLinks] = useState(true);
  const [showBaseline, setShowBaseline] = useState(true); // Default true so yellow baseline bars are visible
  const [hoveredAct, setHoveredAct] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Separate Header scroll container to synchronize with body horizontally
  const headerScrollRef = useRef(null);
  const internalBodyScrollRef = useRef(null);
  const bodyRef = scrollRef || internalBodyScrollRef;

  // Sync horizontal scrolling between timeline header and gantt body
  const handleBodyScroll = (e) => {
    if (headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = e.target.scrollLeft;
    }
    onScroll?.(e);
  };

  // Determine Zoom pixel width per day
  const dayWidth = useMemo(() => {
    switch (zoomLevel) {
      case "day":
        return 32;
      case "month":
        return 8;
      case "week":
      default:
        return 18;
    }
  }, [zoomLevel]);

  // Determine timeline overall date range
  const { minDate, maxDate, dateList, totalDays, chartWidth } = useMemo(() => {
    let earliest = new Date();
    let latest = new Date();
    let hasDates = false;

    if (activities.length > 0) {
      activities.forEach((a) => {
        const s = parseDate(a.early_start || a.start || a.baseline_start);
        const f = parseDate(a.early_finish || a.finish || a.baseline_finish);
        if (s) {
          if (!hasDates || s < earliest) earliest = new Date(s);
          hasDates = true;
        }
        if (f) {
          if (!hasDates || f > latest) latest = new Date(f);
          hasDates = true;
        }
      });
    }

    if (!hasDates) {
      earliest = new Date();
      latest = new Date(Date.now() + 90 * 86400000);
    }

    // Align start to 1st of that month or start of previous month
    const start = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
    start.setDate(start.getDate() - 7); // 1 week buffer

    // Align finish to end of month + buffer
    const finish = new Date(latest.getFullYear(), latest.getMonth() + 1, 0);
    finish.setDate(finish.getDate() + 21); // 3 weeks buffer

    const list = [];
    const curr = new Date(start);
    while (curr <= finish) {
      list.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }

    return {
      minDate: start,
      maxDate: finish,
      dateList: list,
      totalDays: list.length,
      chartWidth: Math.max(800, list.length * dayWidth),
    };
  }, [activities, dayWidth]);

  // Calculate Month blocks for header & calendar guidelines
  const monthBlocks = useMemo(() => {
    const blocks = [];
    let current = null;

    dateList.forEach((d, i) => {
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!current || current.key !== key) {
        if (current) {
          current.width = (i - current.startIndex) * dayWidth;
        }
        current = {
          key,
          startIndex: i,
          x: i * dayWidth,
          year: d.getFullYear(),
          month: d.getMonth(),
          label: d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }).toUpperCase(),
        };
        blocks.push(current);
      }
    });

    if (current) {
      current.width = (dateList.length - current.startIndex) * dayWidth;
    }

    return blocks;
  }, [dateList, dayWidth]);

  // Calculate Week blocks for week and day zoom levels
  const weekBlocks = useMemo(() => {
    const blocks = [];
    let current = null;

    dateList.forEach((d, i) => {
      const isWeekStart = d.getDay() === 1 || i === 0; // Monday start
      if (isWeekStart) {
        if (current) {
          current.width = (i - current.startIndex) * dayWidth;
        }
        current = {
          startIndex: i,
          x: i * dayWidth,
          label: `${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "short" })}`,
          weekNum: getWeekNumber(d),
        };
        blocks.push(current);
      }
    });

    if (current) {
      current.width = (dateList.length - current.startIndex) * dayWidth;
    }

    return blocks;
  }, [dateList, dayWidth]);

  // Map of activity positions
  const actMap = useMemo(() => {
    const map = new Map();
    activities.forEach((act, idx) => {
      const actId = act.id || act.activity_id || `act-${idx}`;
      const s = parseDate(act.early_start || act.start);
      const f = parseDate(act.early_finish || act.finish);
      const dur = act.duration !== undefined ? act.duration : 0;
      const isMilestone = act.is_milestone || act.type === "Milestone" || dur === 0;

      let startX = 0;
      let barW = Math.max(dayWidth, dur * dayWidth);

      if (s) {
        const daysDiff = Math.max(0, Math.floor((s - minDate) / (1000 * 60 * 60 * 24)));
        startX = daysDiff * dayWidth;
      }

      if (f && s && !isMilestone) {
        const durDays = Math.max(1, Math.round((f - s) / (1000 * 60 * 60 * 24)) + 1);
        barW = Math.max(12, durDays * dayWidth);
      }

      // Baseline positioning (yellow bar underneath)
      const bl =
        baselineComparison?.[actId] ||
        baselineComparison?.[act.id] ||
        baselineComparison?.[act.activity_id];
      
      const blStartStr = bl?.baseline_start || act.baseline_start || act.early_start || act.start;
      const blFinishStr = bl?.baseline_finish || act.baseline_finish || act.early_finish || act.finish;
      const blDur = bl?.baseline_duration ?? act.baseline_duration ?? dur;

      let blStartX = startX;
      let blBarW = barW;
      const blS = parseDate(blStartStr);
      const blF = parseDate(blFinishStr);

      if (blS) {
        const blDaysDiff = Math.max(0, Math.floor((blS - minDate) / (1000 * 60 * 60 * 24)));
        blStartX = blDaysDiff * dayWidth;
      }
      if (blF && blS && !isMilestone) {
        const blDurDays = Math.max(1, Math.round((blF - blS) / (1000 * 60 * 60 * 24)) + 1);
        blBarW = Math.max(12, blDurDays * dayWidth);
      }

      const y = idx * ROW_HEIGHT;
      map.set(actId, {
        act,
        idx,
        startX,
        barW,
        blStartX,
        blBarW,
        blDur,
        y,
        isMilestone,
      });
    });
    return map;
  }, [activities, minDate, dayWidth, baselineComparison]);

  // Straight Orthogonal Logic Links (Asta / P6 Style) with Lag Badges
  const dependencyLinks = useMemo(() => {
    if (!showLinks) return [];
    const links = [];

    activities.forEach((act) => {
      const targetId = act.id || act.activity_id;
      const targetData = actMap.get(targetId);
      if (!targetData) return;

      const preds = act.predecessors || [];
      preds.forEach((pred) => {
        const sourceId = pred.id || pred.activity_id;
        const sourceData = actMap.get(sourceId);
        if (!sourceData) return;

        const isCriticalLink = act.critical && sourceData.act.critical;
        const linkType = (pred.type || "FS").toUpperCase();
        const lag = pred.lag !== undefined ? Number(pred.lag) : 0;

        // Vertical center of main task bar
        const sourceY = sourceData.y + 4 + MAIN_BAR_HEIGHT / 2;
        const targetY = targetData.y + 4 + MAIN_BAR_HEIGHT / 2;

        let fromX, toX;
        if (linkType === "SS") {
          fromX = sourceData.startX;
          toX = targetData.startX;
        } else if (linkType === "FF") {
          fromX = sourceData.isMilestone ? sourceData.startX : sourceData.startX + sourceData.barW;
          toX = targetData.isMilestone ? targetData.startX : targetData.startX + targetData.barW;
        } else if (linkType === "SF") {
          fromX = sourceData.startX;
          toX = targetData.isMilestone ? targetData.startX : targetData.startX + targetData.barW;
        } else {
          // FS (Default)
          fromX = sourceData.isMilestone ? sourceData.startX : sourceData.startX + sourceData.barW;
          toX = targetData.startX;
        }

        // Construct Orthogonal Straight Line Path (Asta-style right angles)
        let pathD = "";
        let lagBadgeX = 0;
        let lagBadgeY = 0;

        if (linkType === "FS") {
          const stepX = fromX + 10;
          if (toX >= stepX) {
            // Target is to the right: clean 3-segment orthogonal right-angle step
            pathD = `M ${fromX} ${sourceY} L ${stepX} ${sourceY} L ${stepX} ${targetY} L ${toX} ${targetY}`;
            lagBadgeX = stepX + 4;
            lagBadgeY = (sourceY + targetY) / 2;
          } else {
            // Target starts earlier: 5-segment stepped detour
            const midY = (sourceY + targetY) / 2;
            pathD = `M ${fromX} ${sourceY} L ${stepX} ${sourceY} L ${stepX} ${midY} L ${toX - 10} ${midY} L ${toX - 10} ${targetY} L ${toX} ${targetY}`;
            lagBadgeX = (stepX + toX - 10) / 2;
            lagBadgeY = midY;
          }
        } else if (linkType === "SS") {
          const stepX = Math.min(fromX, toX) - 10;
          pathD = `M ${fromX} ${sourceY} L ${stepX} ${sourceY} L ${stepX} ${targetY} L ${toX} ${targetY}`;
          lagBadgeX = stepX - 18;
          lagBadgeY = (sourceY + targetY) / 2;
        } else if (linkType === "FF") {
          const stepX = Math.max(fromX, toX) + 10;
          pathD = `M ${fromX} ${sourceY} L ${stepX} ${sourceY} L ${stepX} ${targetY} L ${toX} ${targetY}`;
          lagBadgeX = stepX + 4;
          lagBadgeY = (sourceY + targetY) / 2;
        } else {
          // SF
          const stepX1 = fromX - 10;
          const stepX2 = toX + 10;
          const midY = (sourceY + targetY) / 2;
          pathD = `M ${fromX} ${sourceY} L ${stepX1} ${sourceY} L ${stepX1} ${midY} L ${stepX2} ${midY} L ${stepX2} ${targetY} L ${toX} ${targetY}`;
          lagBadgeX = (stepX1 + stepX2) / 2;
          lagBadgeY = midY;
        }

        let lagLabel = "";
        if (lag !== 0) {
          lagLabel = `${linkType !== "FS" ? linkType : ""}${lag > 0 ? `+${lag}d` : `${lag}d`}`;
        } else if (linkType !== "FS") {
          lagLabel = linkType;
        }

        links.push({
          id: `${sourceId}->${targetId}-${linkType}`,
          path: pathD,
          isCritical: isCriticalLink,
          lagLabel,
          lagBadgeX,
          lagBadgeY,
          linkType,
          lag,
        });
      });
    });

    return links;
  }, [activities, actMap, showLinks]);

  // "Today" line calculation
  const todayX = useMemo(() => {
    const today = new Date();
    if (today >= minDate && today <= maxDate) {
      const daysDiff = (today - minDate) / (1000 * 60 * 60 * 24);
      return daysDiff * dayWidth;
    }
    return null;
  }, [minDate, maxDate, dayWidth]);

  const totalHeight = Math.max(300, activities.length * ROW_HEIGHT + 40);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200 select-none overflow-hidden">
      {/* Gantt Control Toolbar */}
      <div className="h-10 px-3 border-b border-slate-800 flex items-center justify-between bg-slate-900 dark:bg-slate-950 text-xs shrink-0 z-20">
        <div className="flex items-center gap-2.5">
          <span className="font-semibold text-slate-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-blue-400" />
            Gantt Timeline
          </span>

          {/* Zoom Level Controls */}
          <div className="flex items-center bg-slate-800/80 rounded-md p-0.5 border border-slate-700/80">
            <button
              type="button"
              onClick={() => setZoomLevel("day")}
              className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-colors ${
                zoomLevel === "day"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Day
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel("week")}
              className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-colors ${
                zoomLevel === "week"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Week
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel("month")}
              className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-colors ${
                zoomLevel === "month"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Month
            </button>
          </div>
        </div>

        {/* Legend & Visibility Toggles */}
        <div className="flex items-center gap-2">
          {/* Baseline Bars Toggle (Yellow bars underneath) */}
          <Button
            size="sm"
            variant="ghost"
            className={`h-7 text-[11px] gap-1 px-2 ${
              showBaseline ? "text-amber-400 bg-amber-500/10 border border-amber-500/30" : "text-slate-400"
            }`}
            onClick={() => setShowBaseline(!showBaseline)}
            title="Toggle yellow baseline bars underneath activities"
          >
            <div className="w-2.5 h-1.5 bg-amber-400 rounded-sm inline-block mr-0.5" />
            Baseline Bars
          </Button>

          {/* Logic Links Toggle */}
          <Button
            size="sm"
            variant="ghost"
            className={`h-7 text-[11px] gap-1 px-2 ${
              showLinks ? "text-blue-400 bg-blue-500/10 border border-blue-500/30" : "text-slate-400"
            }`}
            onClick={() => setShowLinks(!showLinks)}
            title="Toggle logic link dependency lines"
          >
            {showLinks ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            Logic Links
          </Button>
        </div>
      </div>

      {/* Synchronized Sticky Timeline Header (Fixed at top, scrolls horizontally with body) */}
      <div
        ref={headerScrollRef}
        className="overflow-x-hidden border-b border-slate-800 bg-slate-900/95 dark:bg-slate-950/95 shrink-0 select-none z-10"
        style={{ height: `${HEADER_HEIGHT}px` }}
      >
        <svg width={chartWidth} height={HEADER_HEIGHT} className="block pointer-events-none">
          {/* Top Row: Month Headers (Solid boundaries) */}
          {monthBlocks.map((m) => (
            <g key={`m-header-${m.key}`}>
              <rect
                x={m.x}
                y={0}
                width={m.width}
                height={zoomLevel === "month" ? HEADER_HEIGHT : 24}
                fill="rgba(15, 23, 42, 0.95)"
                stroke="rgba(51, 65, 85, 0.8)"
                strokeWidth="1"
              />
              <text
                x={m.x + 8}
                y={zoomLevel === "month" ? 28 : 16}
                fill="#cbd5e1"
                fontSize={zoomLevel === "month" ? "12px" : "11px"}
                fontWeight="700"
                fontFamily="system-ui, -apple-system, sans-serif"
                letterSpacing="0.05em"
              >
                {m.label}
              </text>
            </g>
          ))}

          {/* Bottom Row: Week or Day Headers (When not in month view) */}
          {zoomLevel === "week" &&
            weekBlocks.map((w, idx) => (
              <g key={`w-header-${idx}`}>
                <rect
                  x={w.x}
                  y={24}
                  width={w.width}
                  height={24}
                  fill="rgba(30, 41, 59, 0.7)"
                  stroke="rgba(51, 65, 85, 0.6)"
                  strokeWidth="1"
                />
                <text
                  x={w.x + 4}
                  y={40}
                  fill="#94a3b8"
                  fontSize="10px"
                  fontWeight="500"
                  fontFamily="monospace"
                >
                  {w.label}
                </text>
              </g>
            ))}

          {zoomLevel === "day" &&
            dateList.map((d, i) => {
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              const isMonday = d.getDay() === 1;
              const x = i * dayWidth;
              const dayLetters = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

              return (
                <g key={`day-hdr-${i}`}>
                  <rect
                    x={x}
                    y={24}
                    width={dayWidth}
                    height={24}
                    fill={isWeekend ? "rgba(30, 41, 59, 0.9)" : "rgba(15, 23, 42, 0.6)"}
                    stroke="rgba(51, 65, 85, 0.4)"
                    strokeWidth="1"
                  />
                  <text
                    x={x + dayWidth / 2}
                    y={36}
                    fill={isWeekend ? "#64748b" : "#cbd5e1"}
                    fontSize="9px"
                    fontWeight={isMonday ? "700" : "500"}
                    textAnchor="middle"
                    fontFamily="monospace"
                  >
                    {d.getDate()}
                  </text>
                  <text
                    x={x + dayWidth / 2}
                    y={45}
                    fill="#64748b"
                    fontSize="8px"
                    textAnchor="middle"
                  >
                    {dayLetters[d.getDay()]}
                  </text>
                </g>
              );
            })}
        </svg>
      </div>

      {/* Main Gantt Body Scroll Container (Synchronized with Spreadsheet DataGrid) */}
      <div
        ref={bodyRef}
        onScroll={handleBodyScroll}
        className="flex-1 overflow-auto relative bg-slate-950"
      >
        <svg
          width={chartWidth}
          height={totalHeight}
          className="block"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
          }}
        >
          <defs>
            {/* Critical Path Coral Gradient */}
            <linearGradient id="criticalGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#f43f5e" />
              <stop offset="100%" stopColor="#e11d48" />
            </linearGradient>

            {/* Normal Task Blue Gradient */}
            <linearGradient id="normalGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>

            {/* Completed Emerald Progress Gradient */}
            <linearGradient id="progressGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>

            {/* Baseline Yellow Gradient */}
            <linearGradient id="baselineYellowGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#facc15" />
              <stop offset="100%" stopColor="#eab308" />
            </linearGradient>

            {/* Arrow Marker for Dependency Links (Asta Style) */}
            <marker
              id="arrowhead-crit"
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 7 3.5, 0 7" fill="#f43f5e" />
            </marker>
            <marker
              id="arrowhead-norm"
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 7 3.5, 0 7" fill="#60a5fa" />
            </marker>
          </defs>

          {/* 1. Horizontal Row Backgrounds */}
          {activities.map((act, idx) => {
            const actId = act.id || act.activity_id;
            const isHighlighted =
              highlightedActivityId === actId ||
              highlightedActivityId === act.id ||
              highlightedActivityId === act.activity_id;
            const isCritical = act.critical || (act.total_float !== undefined && act.total_float <= 0);
            const y = idx * ROW_HEIGHT;

            return (
              <g key={`row-bg-${actId}-${idx}`}>
                <rect
                  x={0}
                  y={y}
                  width={chartWidth}
                  height={ROW_HEIGHT}
                  fill={
                    isHighlighted
                      ? "rgba(16, 185, 129, 0.12)"
                      : isCritical
                      ? "rgba(244, 63, 94, 0.04)"
                      : idx % 2 === 1
                      ? "rgba(15, 23, 42, 0.4)"
                      : "transparent"
                  }
                />
                <line
                  x1={0}
                  y1={y + ROW_HEIGHT}
                  x2={chartWidth}
                  y2={y + ROW_HEIGHT}
                  stroke="rgba(51, 65, 85, 0.4)"
                  strokeWidth="1"
                />
              </g>
            );
          })}

          {/* 2. CALENDAR GUIDELINES:
              - Month Zoom: ONLY solid month lines appear.
              - Week Zoom: Solid month lines + Dashed weekly lines.
              - Day Zoom: Solid month lines + Dashed weekly lines + Faint daily lines.
          */}
          {zoomLevel === "month" && (
            <g className="month-guidelines-only">
              {monthBlocks.map((m, idx) => (
                <line
                  key={`m-line-${idx}`}
                  x1={m.x}
                  y1={0}
                  x2={m.x}
                  y2={totalHeight}
                  stroke="rgba(100, 116, 139, 0.45)"
                  strokeWidth="1.5"
                />
              ))}
            </g>
          )}

          {zoomLevel === "week" && (
            <g className="week-guidelines">
              {/* Dashed Week Guidelines */}
              {weekBlocks.map((w, idx) => (
                <line
                  key={`w-line-${idx}`}
                  x1={w.x}
                  y1={0}
                  x2={w.x}
                  y2={totalHeight}
                  stroke="rgba(71, 85, 105, 0.35)"
                  strokeWidth="1"
                  strokeDasharray="4 3"
                />
              ))}

              {/* Solid Month Guidelines */}
              {monthBlocks.map((m, idx) => (
                <line
                  key={`m-line-${idx}`}
                  x1={m.x}
                  y1={0}
                  x2={m.x}
                  y2={totalHeight}
                  stroke="rgba(148, 163, 184, 0.65)"
                  strokeWidth="1.5"
                />
              ))}
            </g>
          )}

          {zoomLevel === "day" && (
            <g className="day-guidelines">
              {/* Weekend Background Shading */}
              {dateList.map((d, i) => {
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                if (!isWeekend) return null;
                return (
                  <rect
                    key={`wknd-${i}`}
                    x={i * dayWidth}
                    y={0}
                    width={dayWidth}
                    height={totalHeight}
                    fill="rgba(30, 41, 59, 0.25)"
                  />
                );
              })}

              {/* Faint Day Lines */}
              {dateList.map((d, i) => (
                <line
                  key={`d-line-${i}`}
                  x1={i * dayWidth}
                  y1={0}
                  x2={i * dayWidth}
                  y2={totalHeight}
                  stroke="rgba(51, 65, 85, 0.2)"
                  strokeWidth="1"
                />
              ))}

              {/* Dashed Week Guidelines */}
              {weekBlocks.map((w, idx) => (
                <line
                  key={`w-line-${idx}`}
                  x1={w.x}
                  y1={0}
                  x2={w.x}
                  y2={totalHeight}
                  stroke="rgba(100, 116, 139, 0.4)"
                  strokeWidth="1"
                  strokeDasharray="4 3"
                />
              ))}

              {/* Solid Month Guidelines */}
              {monthBlocks.map((m, idx) => (
                <line
                  key={`m-line-${idx}`}
                  x1={m.x}
                  y1={0}
                  x2={m.x}
                  y2={totalHeight}
                  stroke="rgba(148, 163, 184, 0.7)"
                  strokeWidth="1.5"
                />
              ))}
            </g>
          )}

          {/* 3. "Today" Line Indicator */}
          {todayX !== null && (
            <g>
              <line
                x1={todayX}
                y1={0}
                x2={todayX}
                y2={totalHeight}
                stroke="#10b981"
                strokeWidth="2"
                strokeDasharray="6 4"
              />
              <rect
                x={todayX - 22}
                y={4}
                width={44}
                height={16}
                rx={3}
                fill="#10b981"
              />
              <text
                x={todayX}
                y={15}
                fill="#022c22"
                fontSize="9px"
                fontWeight="bold"
                textAnchor="middle"
              >
                TODAY
              </text>
            </g>
          )}

          {/* 4. Logic Links: Straight Orthogonal Right-Angle Lines with Lag Badges (Asta Style) */}
          {dependencyLinks.map((link) => (
            <g key={link.id}>
              {/* Straight orthogonal path */}
              <path
                d={link.path}
                fill="none"
                stroke={link.isCritical ? "#f43f5e" : "#60a5fa"}
                strokeWidth={link.isCritical ? 2 : 1.25}
                strokeOpacity={link.isCritical ? 0.95 : 0.7}
                markerEnd={link.isCritical ? "url(#arrowhead-crit)" : "url(#arrowhead-norm)"}
              />

              {/* Lag Badge Pill on the straight line if present */}
              {link.lagLabel && (
                <g transform={`translate(${link.lagBadgeX}, ${link.lagBadgeY - 7})`}>
                  <rect
                    x={-14}
                    y={0}
                    width={28}
                    height={14}
                    rx={3}
                    fill="#0f172a"
                    stroke={link.isCritical ? "#f43f5e" : "#3b82f6"}
                    strokeWidth={1}
                    className="shadow-sm"
                  />
                  <text
                    x={0}
                    y={10}
                    fill={link.isCritical ? "#fecdd3" : "#93c5fd"}
                    fontSize="9px"
                    fontWeight="700"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {link.lagLabel}
                  </text>
                </g>
              )}
            </g>
          ))}

          {/* 5. Activity Bars & Yellow Baseline Bars Underneath */}
          {activities.map((act, idx) => {
            const actId = act.id || act.activity_id || `act-${idx}`;
            const data = actMap.get(actId);
            if (!data) return null;

            const { startX, barW, blStartX, blBarW, y, isMilestone } = data;
            const isCritical = act.critical || (act.total_float !== undefined && act.total_float <= 0);
            const isHighlighted =
              highlightedActivityId === actId ||
              highlightedActivityId === act.id ||
              highlightedActivityId === act.activity_id;
            const pct = Math.min(100, Math.max(0, parseFloat(act.percent_complete ?? act.progress ?? 0) || 0));

            const mainBarY = y + 4;
            const baselineBarY = y + 25;

            return (
              <g
                key={`gantt-row-bars-${actId}-${idx}`}
                className="cursor-pointer group/bar"
                onClick={() => onSelectActivity?.(actId)}
                onMouseEnter={() => setHoveredAct(act)}
                onMouseLeave={() => setHoveredAct(null)}
              >
                {/* 5A. Yellow Baseline Bar Underneath Main Activity Bar */}
                {showBaseline && (
                  isMilestone ? (
                    /* Yellow Baseline Milestone Diamond */
                    <g transform={`translate(${blStartX}, ${baselineBarY + 3})`}>
                      <polygon
                        points="0,-4 4,0 0,4 -4,0"
                        fill="#eab308"
                        stroke="#ca8a04"
                        strokeWidth="1"
                      />
                    </g>
                  ) : (
                    /* Yellow Baseline Bar Underneath */
                    <g>
                      <rect
                        x={blStartX}
                        y={baselineBarY}
                        width={blBarW}
                        height={BASELINE_BAR_HEIGHT}
                        rx={2}
                        fill="url(#baselineYellowGradient)"
                        stroke="#ca8a04"
                        strokeWidth="0.75"
                        opacity={0.95}
                        className="shadow-sm"
                      />
                    </g>
                  )
                )}

                {/* 5B. Primary Task Bar / Milestone Diamond */}
                {isMilestone ? (
                  <g transform={`translate(${startX}, ${mainBarY + MAIN_BAR_HEIGHT / 2})`}>
                    <polygon
                      points="0,-8 8,0 0,8 -8,0"
                      fill={isCritical ? "#f43f5e" : "#3b82f6"}
                      stroke={isHighlighted ? "#ffffff" : isCritical ? "#e11d48" : "#1d4ed8"}
                      strokeWidth={isHighlighted ? 2.5 : 1.5}
                      className="transition-transform group-hover/bar:scale-125"
                    />
                    {isCritical && (
                      <circle
                        r={12}
                        fill="none"
                        stroke="#f43f5e"
                        strokeWidth="1.5"
                        strokeDasharray="2 2"
                        opacity={0.7}
                      />
                    )}
                  </g>
                ) : (
                  /* Standard Task Bar */
                  <g>
                    {/* Main Bar Rectangle */}
                    <rect
                      x={startX}
                      y={mainBarY}
                      width={barW}
                      height={MAIN_BAR_HEIGHT}
                      rx={3}
                      fill={isCritical ? "url(#criticalGradient)" : "url(#normalGradient)"}
                      stroke={isHighlighted ? "#ffffff" : isCritical ? "#fb7185" : "#60a5fa"}
                      strokeWidth={isHighlighted ? 2 : 1}
                      className="transition-opacity group-hover/bar:opacity-90 shadow-sm"
                    />

                    {/* Progress Fill Overlay (Emerald) */}
                    {pct > 0 && (
                      <rect
                        x={startX}
                        y={mainBarY}
                        width={(barW * pct) / 100}
                        height={MAIN_BAR_HEIGHT}
                        rx={3}
                        fill="url(#progressGradient)"
                        opacity={0.9}
                      />
                    )}

                    {/* Task Label on Bar */}
                    <text
                      x={startX + 6}
                      y={mainBarY + 13}
                      fill="#ffffff"
                      fontSize="10px"
                      fontWeight="600"
                      className="pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                    >
                      {barW > 60 ? act.name || act.description || actId : ""}
                    </text>

                    {/* Right Percentage/Duration Tag if bar is wide */}
                    {barW > 100 && (
                      <text
                        x={startX + barW - 6}
                        y={mainBarY + 13}
                        fill="rgba(255,255,255,0.85)"
                        fontSize="9px"
                        fontWeight="500"
                        textAnchor="end"
                        className="pointer-events-none"
                      >
                        {pct > 0 ? `${pct}%` : `${act.duration}d`}
                      </text>
                    )}
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip */}
        {hoveredAct && (
          <div
            className="absolute z-50 pointer-events-none bg-slate-900/95 border border-slate-700 shadow-2xl rounded-lg p-3 text-xs max-w-xs backdrop-blur-md transition-opacity"
            style={{
              left: `${Math.min(chartWidth - 260, Math.max(10, tooltipPos.x + 15))}px`,
              top: `${Math.max(10, tooltipPos.y - 95)}px`,
            }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5 mb-1.5">
              <span className="font-mono font-bold text-emerald-400">
                {hoveredAct.id || hoveredAct.activity_id}
              </span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  hoveredAct.critical
                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                    : "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                }`}
              >
                {hoveredAct.critical ? "CRITICAL PATH" : "STANDARD"}
              </span>
            </div>
            <p className="font-medium text-white mb-2">{hoveredAct.name || hoveredAct.description}</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-300 font-mono">
              <div>Stage: <span className="text-white">{hoveredAct.stage || hoveredAct.wbs_l1 || "-"}</span></div>
              <div>Duration: <span className="text-white">{hoveredAct.duration}d</span></div>
              <div>Early Start: <span className="text-white">{formatDate(hoveredAct.early_start || hoveredAct.start)}</span></div>
              <div>Early Finish: <span className="text-white">{formatDate(hoveredAct.early_finish || hoveredAct.finish)}</span></div>
              <div className="col-span-2 pt-1 border-t border-slate-800/80 flex items-center gap-1.5">
                <span className="w-2.5 h-2 rounded-xs bg-amber-400 inline-block shrink-0" />
                <span>Baseline Target: <strong className="text-amber-300 font-semibold">{formatDate(hoveredAct.baseline_start || hoveredAct.early_start || hoveredAct.start)} → {formatDate(hoveredAct.baseline_finish || hoveredAct.early_finish || hoveredAct.finish)}</strong></span>
              </div>
              <div>Float: <span className="text-white">{hoveredAct.total_float !== undefined ? `${hoveredAct.total_float}d` : "-"}</span></div>
              <div>% Done: <span className="text-white">{hoveredAct.percent_complete ?? hoveredAct.progress ?? 0}%</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default GanttChart;
