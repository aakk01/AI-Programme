import React, { useState, useRef, useMemo } from "react";
import { ZoomIn, ZoomOut, Maximize2, Calendar, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 48;

export function GanttChart({
  activities = [],
  schedule = {},
  baselineComparison = null,
  highlightedActivityId = null,
  onSelectActivity,
  onActivityDurationChange,
}) {
  const [zoomLevel, setZoomLevel] = useState("week"); // 'day' | 'week' | 'month'
  const [showLinks, setShowLinks] = useState(true);
  const containerRef = useRef(null);

  // Day width based on zoom level
  const dayWidth = zoomLevel === "day" ? 28 : zoomLevel === "week" ? 14 : 6;

  // Calculate project bounds
  const { minDate, maxDate, totalDays, dateList } = useMemo(() => {
    let start = schedule.project_start ? new Date(schedule.project_start) : new Date();
    let finish = schedule.project_finish ? new Date(schedule.project_finish) : new Date(start);

    if (activities.length > 0) {
      for (const act of activities) {
        if (act.early_start) {
          const s = new Date(act.early_start);
          if (s < start) start = s;
        }
        if (act.early_finish) {
          const f = new Date(act.early_finish);
          if (f > finish) finish = f;
        }
      }
    }

    // Add padding days
    const minD = new Date(start);
    minD.setDate(minD.getDate() - 3);
    const maxD = new Date(finish);
    maxD.setDate(maxD.getDate() + 10);

    const diffTime = Math.max(1, maxD.getTime() - minD.getTime());
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const dates = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(minD);
      d.setDate(d.getDate() + i);
      dates.push(d);
    }

    return { minDate: minD, maxDate: maxD, totalDays: days, dateList: dates };
  }, [activities, schedule]);

  const chartWidth = Math.max(800, totalDays * dayWidth);

  // Date to X coordinate helper
  const getXForDate = (dateStr) => {
    if (!dateStr) return 0;
    const d = new Date(dateStr);
    const diff = (d.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, diff * dayWidth);
  };

  // Build dependency arrows
  const linkPaths = useMemo(() => {
    if (!showLinks) return [];
    const actMap = new Map();
    activities.forEach((act, idx) => {
      if (act.id) actMap.set(act.id, { act, idx });
      if (act.activity_id) actMap.set(act.activity_id, { act, idx });
    });

    const paths = [];
    activities.forEach((targetAct, targetIdx) => {
      const preds = targetAct.predecessors || [];
      preds.forEach((p, pIdx) => {
        const source = actMap.get(p.id) || actMap.get(p.activity_id);
        if (!source) return;

        const sourceAct = source.act;
        const sourceIdx = source.idx;

        const sourceX = getXForDate(sourceAct.early_finish || sourceAct.finish);
        const sourceY = HEADER_HEIGHT + sourceIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

        const targetX = getXForDate(targetAct.early_start || targetAct.start);
        const targetY = HEADER_HEIGHT + targetIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

        const isCrit = (sourceAct.critical || (sourceAct.total_float !== undefined && sourceAct.total_float <= 0)) &&
                       (targetAct.critical || (targetAct.total_float !== undefined && targetAct.total_float <= 0));

        // Orthogonal Bezier / Step curve
        const midX = sourceX + (targetX > sourceX ? Math.min(20, (targetX - sourceX) / 2) : -15);
        const d = `M ${sourceX} ${sourceY} H ${midX} V ${targetY} H ${targetX - 4}`;

        const sId = sourceAct.id || sourceAct.activity_id || `s${sourceIdx}`;
        const tId = targetAct.id || targetAct.activity_id || `t${targetIdx}`;

        paths.push({
          id: `link-${sId}-${tId}-${p.type || "FS"}-${targetIdx}-${pIdx}`,
          d,
          isCritical: isCrit,
          targetX,
          targetY,
        });
      });
    });

    return paths;
  }, [activities, showLinks, minDate, dayWidth]);

  return (
    <div className="flex flex-col h-full bg-card select-none">
      {/* Gantt Header Controls */}
      <div className="p-2 border-b flex items-center justify-between bg-muted/20 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-muted-foreground uppercase tracking-wider">
            Gantt Timeline
          </span>
          <Button
            size="sm"
            variant={showLinks ? "secondary" : "ghost"}
            className="h-7 text-xs px-2"
            onClick={() => setShowLinks(!showLinks)}
          >
            {showLinks ? "Hide Logic Links" : "Show Logic Links"}
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={zoomLevel === "day" ? "secondary" : "ghost"}
            className="h-7 text-xs px-2"
            onClick={() => setZoomLevel("day")}
          >
            Day
          </Button>
          <Button
            size="sm"
            variant={zoomLevel === "week" ? "secondary" : "ghost"}
            className="h-7 text-xs px-2"
            onClick={() => setZoomLevel("week")}
          >
            Week
          </Button>
          <Button
            size="sm"
            variant={zoomLevel === "month" ? "secondary" : "ghost"}
            className="h-7 text-xs px-2"
            onClick={() => setZoomLevel("month")}
          >
            Month
          </Button>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div ref={containerRef} className="flex-1 overflow-auto relative">
        <svg
          width={chartWidth}
          height={HEADER_HEIGHT + activities.length * ROW_HEIGHT + 40}
          className="block"
        >
          <defs>
            <marker
              id="arrow-default"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 8 5 L 0 9 z" fill="#94a3b8" />
            </marker>
            <marker
              id="arrow-critical"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 8 5 L 0 9 z" fill="#f43f5e" />
            </marker>
          </defs>

          {/* Grid background columns & days */}
          {dateList.map((d, i) => {
            const x = i * dayWidth;
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            return (
              <g key={`grid-col-${i}`}>
                <rect
                  x={x}
                  y={0}
                  width={dayWidth}
                  height={HEADER_HEIGHT + activities.length * ROW_HEIGHT}
                  fill={isWeekend ? "rgba(100, 116, 139, 0.05)" : "transparent"}
                />
                <line
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={HEADER_HEIGHT + activities.length * ROW_HEIGHT}
                  stroke="rgba(100, 116, 139, 0.1)"
                  strokeWidth="1"
                />
              </g>
            );
          })}

          {/* Timeline Header */}
          <rect x={0} y={0} width={chartWidth} height={HEADER_HEIGHT} fill="hsl(var(--muted)/0.7)" />
          <line x1={0} y1={HEADER_HEIGHT} x2={chartWidth} y2={HEADER_HEIGHT} stroke="hsl(var(--border))" />

          {dateList.map((d, i) => {
            const x = i * dayWidth;
            const isFirstOfMonth = d.getDate() === 1 || i === 0;
            const isMonday = d.getDay() === 1;

            return (
              <g key={`header-${i}`}>
                {isFirstOfMonth && (
                  <text
                    x={x + 4}
                    y={18}
                    fill="hsl(var(--foreground))"
                    fontSize="11"
                    fontWeight="600"
                  >
                    {d.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                  </text>
                )}
                {(zoomLevel === "day" || (zoomLevel === "week" && isMonday)) && (
                  <text
                    x={x + 2}
                    y={38}
                    fill="hsl(var(--muted-foreground))"
                    fontSize="10"
                    fontFamily="monospace"
                  >
                    {zoomLevel === "day" ? d.getDate() : `W${Math.ceil(d.getDate() / 7)}`}
                  </text>
                )}
              </g>
            );
          })}

          {/* Row stripes */}
          {activities.map((_, idx) => (
            <line
              key={`row-line-${idx}`}
              x1={0}
              y1={HEADER_HEIGHT + (idx + 1) * ROW_HEIGHT}
              x2={chartWidth}
              y2={HEADER_HEIGHT + (idx + 1) * ROW_HEIGHT}
              stroke="hsl(var(--border)/0.5)"
            />
          ))}

          {/* Dependency Links */}
          {linkPaths.map((link) => (
            <path
              key={link.id}
              d={link.d}
              fill="none"
              stroke={link.isCritical ? "#f43f5e" : "#94a3b8"}
              strokeWidth={link.isCritical ? "2" : "1.2"}
              markerEnd={link.isCritical ? "url(#arrow-critical)" : "url(#arrow-default)"}
              className="transition-all opacity-80 hover:opacity-100"
            />
          ))}

          {/* Activity Bars */}
          {activities.map((act, idx) => {
            const actId = act.id || act.activity_id || `act-${idx + 1}`;
            const actName = act.name || act.description || actId;
            const y = HEADER_HEIGHT + idx * ROW_HEIGHT + 6;
            const startX = getXForDate(act.early_start || act.start);
            const finishX = getXForDate(act.early_finish || act.finish);
            const width = Math.max(dayWidth, finishX - startX);
            const isCritical = act.critical || (act.total_float !== undefined && act.total_float <= 0);
            const isMilestone = act.is_milestone || act.type === "Milestone" || act.duration === 0;
            const isHighlighted = highlightedActivityId === actId || highlightedActivityId === act.id || highlightedActivityId === act.activity_id;

            // Baseline comparison bar
            const bl = baselineComparison?.[actId] || baselineComparison?.[act.id] || baselineComparison?.[act.activity_id];
            let blStartX = 0;
            let blWidth = 0;
            if (bl?.baseline_start && bl?.baseline_finish) {
              blStartX = getXForDate(bl.baseline_start);
              const blFinishX = getXForDate(bl.baseline_finish);
              blWidth = Math.max(dayWidth, blFinishX - blStartX);
            }

            return (
              <g
                key={`gantt-bar-${actId}-${idx}`}
                onClick={() => onSelectActivity?.(actId)}
                className="cursor-pointer group"
              >
                {/* Highlight halo */}
                {isHighlighted && (
                  <rect
                    x={startX - 3}
                    y={y - 3}
                    width={width + 6}
                    height={ROW_HEIGHT - 6}
                    rx="6"
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="2"
                  />
                )}

                {/* Baseline Ghost Bar */}
                {bl && blWidth > 0 && (
                  <rect
                    x={blStartX}
                    y={y + 16}
                    width={blWidth}
                    height={5}
                    rx="2.5"
                    fill="#f59e0b"
                    opacity="0.75"
                  />
                )}

                {isMilestone ? (
                  // Milestone Diamond
                  <polygon
                    points={`${startX},${y + 12} ${startX + 8},${y + 4} ${startX + 16},${y + 12} ${startX + 8},${y + 20}`}
                    fill="#f59e0b"
                    stroke="#d97706"
                    strokeWidth="1.5"
                  />
                ) : (
                  // Standard Task Bar
                  <rect
                    x={startX}
                    y={y}
                    width={width}
                    height={ROW_HEIGHT - 12}
                    rx="4"
                    fill={isCritical ? "hsl(350 89% 60%)" : "hsl(221 83% 53%)"}
                    className="transition-all hover:brightness-110 shadow-sm"
                  />
                )}

                {/* Activity Name Label alongside bar */}
                <text
                  x={startX + width + 8}
                  y={y + 16}
                  fill="hsl(var(--foreground))"
                  fontSize="11"
                  className="font-medium opacity-90 select-none pointer-events-none"
                >
                  {actName} {act.duration > 0 ? `(${act.duration}d)` : ""}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
