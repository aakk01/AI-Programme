import { useMemo, useRef, useState } from "react";

const addWorkingDays = (startIso, n) => {
  const d = new Date(`${startIso}T00:00:00`);
  let remaining = Math.max(0, n);
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) remaining -= 1;
  }
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
};

const fmt = (d, zoom) =>
  zoom === "month"
    ? d.toLocaleDateString(undefined, { month: "short", year: "2-digit" })
    : d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });

const PX = { day: 26, week: 8, month: 2.6 };
const TICK = { day: 1, week: 5, month: 20 };

export const GanttChart = ({
  activities,
  projectStart,
  zoom = "week",
  rowHeight = 26,
  selectedId,
  onSelect,
  onDurationChange,
}) => {
  const px = PX[zoom];
  const [drag, setDrag] = useState(null);
  const svgRef = useRef(null);

  const total = useMemo(
    () => Math.max(20, ...activities.map((a) => (a.ef ?? 0) + 5)),
    [activities],
  );
  const width = Math.max(600, total * px);
  const height = activities.length * rowHeight;
  const rowOf = useMemo(() => {
    const m = {};
    activities.forEach((a, i) => (m[a.activity_id] = i));
    return m;
  }, [activities]);

  const ticks = [];
  for (let i = 0; i <= total; i += TICK[zoom]) {
    ticks.push({ i, label: fmt(addWorkingDays(projectStart, i), zoom) });
  }

  const startDrag = (e, a, index) => {
    e.stopPropagation();
    setDrag({ index, id: a.activity_id, startX: e.clientX, base: a.duration });
  };

  const onMove = (e) => {
    if (!drag) return;
    const delta = Math.round((e.clientX - drag.startX) / px);
    const next = Math.max(1, drag.base + delta);
    if (next !== drag.preview) setDrag({ ...drag, preview: next });
  };

  const endDrag = () => {
    if (drag?.preview != null && drag.preview !== drag.base)
      onDurationChange(drag.index, drag.preview);
    setDrag(null);
  };

  const arrows = [];
  activities.forEach((a) => {
    (a.predecessors || []).forEach((p) => {
      const pr = activities.find((x) => x.activity_id === p.id);
      if (!pr || rowOf[p.id] === undefined) return;
      const y1 = rowOf[p.id] * rowHeight + rowHeight / 2;
      const y2 = rowOf[a.activity_id] * rowHeight + rowHeight / 2;
      const type = p.type || "FS";
      const x1 = (type === "SS" || type === "SF" ? pr.es : pr.ef) * px;
      const x2 = (type === "FF" || type === "SF" ? a.ef : a.es) * px;
      const mid = x1 + 8;
      arrows.push({
        key: `${p.id}-${a.activity_id}-${type}`,
        d: `M ${x1} ${y1} L ${mid} ${y1} L ${mid} ${y2} L ${x2} ${y2}`,
        critical: pr.critical && a.critical,
        head: `${x2},${y2} ${x2 - 4},${y2 - 3} ${x2 - 4},${y2 + 3}`,
      });
    });
  });

  return (
    <div className="flex h-full flex-col" data-testid="gantt-chart">
      <div className="flex-1 overflow-auto">
        <div style={{ width }}>
          <svg width={width} height={22} className="block bg-[hsl(var(--surface))]">
            {ticks.map((t) => (
              <g key={t.i}>
                <line
                  x1={t.i * px}
                  x2={t.i * px}
                  y1={0}
                  y2={22}
                  stroke="hsl(var(--border))"
                />
                <text
                  x={t.i * px + 4}
                  y={14}
                  fontSize="9"
                  fill="hsl(var(--muted-foreground))"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {t.label}
                </text>
              </g>
            ))}
          </svg>
          <svg
            ref={svgRef}
            width={width}
            height={height}
            onMouseMove={onMove}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            className="block"
          >
            {ticks.map((t) => (
              <line
                key={`g${t.i}`}
                x1={t.i * px}
                x2={t.i * px}
                y1={0}
                y2={height}
                stroke="hsl(var(--border))"
                strokeOpacity="0.6"
              />
            ))}
            {activities.map((a, i) => (
              <rect
                key={`r${a.activity_id}-${i}`}
                x={0}
                y={i * rowHeight}
                width={width}
                height={rowHeight}
                fill={
                  a.activity_id === selectedId
                    ? "hsl(var(--bar) / 0.1)"
                    : "transparent"
                }
                stroke="hsl(var(--border))"
                strokeOpacity="0.5"
                onClick={() => onSelect(a.activity_id)}
              />
            ))}
            {arrows.map((ar) => (
              <g key={ar.key}>
                <path
                  d={ar.d}
                  fill="none"
                  stroke={
                    ar.critical
                      ? "hsl(var(--bar-critical))"
                      : "hsl(var(--muted-foreground))"
                  }
                  strokeOpacity={ar.critical ? 0.9 : 0.45}
                  strokeWidth="1"
                />
                <polygon
                  points={ar.head}
                  fill={
                    ar.critical
                      ? "hsl(var(--bar-critical))"
                      : "hsl(var(--muted-foreground))"
                  }
                  fillOpacity={ar.critical ? 0.9 : 0.5}
                />
              </g>
            ))}
            {activities.map((a, i) => {
              const y = i * rowHeight + 5;
              const h = rowHeight - 10;
              const dur =
                drag?.id === a.activity_id && drag.preview != null
                  ? drag.preview
                  : a.duration;
              const x = (a.es ?? 0) * px;
              const w = Math.max(2, dur * px);
              if (a.type === "Milestone") {
                const cy = i * rowHeight + rowHeight / 2;
                const s = 5;
                return (
                  <polygon
                    key={`m${a.activity_id}-${i}`}
                    data-testid={`gantt-milestone-${a.activity_id}`}
                    points={`${x},${cy - s} ${x + s},${cy} ${x},${cy + s} ${x - s},${cy}`}
                    fill="hsl(var(--bar-milestone))"
                    onClick={() => onSelect(a.activity_id)}
                    className="cursor-pointer"
                  />
                );
              }
              if (a.type === "Summary") {
                return (
                  <g key={`s${a.activity_id}-${i}`} onClick={() => onSelect(a.activity_id)}>
                    <rect
                      x={x}
                      y={i * rowHeight + rowHeight / 2 - 3}
                      width={w}
                      height={5}
                      fill="hsl(var(--foreground))"
                      fillOpacity="0.75"
                    />
                    <polygon
                      points={`${x},${i * rowHeight + rowHeight / 2 + 2} ${x + 5},${i * rowHeight + rowHeight / 2 + 2} ${x},${i * rowHeight + rowHeight / 2 + 8}`}
                      fill="hsl(var(--foreground))"
                      fillOpacity="0.75"
                    />
                    <polygon
                      points={`${x + w},${i * rowHeight + rowHeight / 2 + 2} ${x + w - 5},${i * rowHeight + rowHeight / 2 + 2} ${x + w},${i * rowHeight + rowHeight / 2 + 8}`}
                      fill="hsl(var(--foreground))"
                      fillOpacity="0.75"
                    />
                  </g>
                );
              }
              return (
                <g key={`b${a.activity_id}-${i}`}>
                  <rect
                    data-testid={`gantt-bar-${a.activity_id}`}
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    rx="1"
                    fill={
                      a.critical ? "hsl(var(--bar-critical))" : "hsl(var(--bar))"
                    }
                    className="cursor-pointer"
                    onClick={() => onSelect(a.activity_id)}
                  />
                  <rect
                    x={x + w - 3}
                    y={y}
                    width={6}
                    height={h}
                    fill="transparent"
                    className="cursor-ew-resize"
                    onMouseDown={(e) => startDrag(e, a, i)}
                  />
                  {w > 44 && (
                    <text
                      x={x + w + 5}
                      y={y + h - 2}
                      fontSize="9"
                      fill="hsl(var(--muted-foreground))"
                      fontFamily="IBM Plex Mono, monospace"
                    >
                      {dur}d
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
};
