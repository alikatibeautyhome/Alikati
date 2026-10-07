'use client';

import type { TrafficDay } from '@/lib/traffic-admin-api';

/**
 * Visits over time, as hand-rolled SVG.
 *
 * There is no charting dependency in this project and adding one for a single sparkline would be a
 * poor trade — the obvious libraries are larger than the rest of the runtime dependencies put
 * together, and this needs a line, an area and four gridlines. The whole chart is arithmetic over
 * the data and produces no client-side state.
 *
 * Two series on one axis: page views (area, the volume) and unique visitors (line, the people).
 * Plotting them together is the point — a widening gap between them means the same people coming
 * back, and a narrowing one means reach.
 */
export function TrafficTrendChart({ data, days }: { data: TrafficDay[]; days: number }) {
  const W = 720;
  const H = 200;
  const PAD_L = 36;
  const PAD_R = 10;
  const PAD_T = 12;
  const PAD_B = 24;

  const points = data.filter((d) => d.day);

  if (points.length < 2) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-charcoal/15 text-sm text-charcoal-soft">
        Not enough history in this window yet.
      </div>
    );
  }

  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const baseY = PAD_T + innerH;

  // A flat series would divide by zero; an empty window still needs a sane axis.
  const peak = Math.max(...points.map((d) => Math.max(d.views, d.visitors)), 1);

  const x = (index: number) => PAD_L + (index / (points.length - 1)) * innerW;
  const y = (value: number) => PAD_T + innerH - (value / peak) * innerH;

  const viewsLine = points.map((d, i) => `${x(i)},${y(d.views)}`).join(' ');
  const visitorsLine = points.map((d, i) => `${x(i)},${y(d.visitors)}`).join(' ');

  const areaPath =
    `M ${x(0)},${y(points[0].views)} ` +
    points
      .slice(1)
      .map((d, i) => `L ${x(i + 1)},${y(d.views)}`)
      .join(' ') +
    ` L ${x(points.length - 1)},${baseY} L ${x(0)},${baseY} Z`;

  // Four gridlines, from zero to the peak, each labelled with the value it represents.
  const gridlines = [0, 0.25, 0.5, 0.75, 1].map((fraction) => ({
    y: PAD_T + innerH - fraction * innerH,
    value: Math.round(peak * fraction),
  }));

  // At most six date labels, evenly spaced, so they never collide on a 30-day window.
  const labelStep = Math.max(1, Math.ceil(points.length / 6));
  const xLabels = points
    .map((d, i) => ({ i, day: d.day }))
    .filter(({ i }) => i % labelStep === 0 || i === points.length - 1);

  function formatDay(day: string): string {
    const date = new Date(`${day}T00:00:00`);
    if (Number.isNaN(date.getTime())) return day;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  const totalViews = points.reduce((sum, d) => sum + d.views, 0);
  const totalVisitors = points.reduce((sum, d) => sum + d.visitors, 0);

  return (
    <figure className="space-y-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-48 w-full"
        role="img"
        aria-label={`Page views and unique visitors over the last ${days} days`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="traffic-views-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        <g className="text-charcoal">
          {gridlines.map((line) => (
            <g key={line.y}>
              <line
                x1={PAD_L}
                y1={line.y}
                x2={W - PAD_R}
                y2={line.y}
                stroke="currentColor"
                strokeOpacity={0.08}
                strokeWidth={1}
              />
              <text
                x={PAD_L - 6}
                y={line.y + 4}
                textAnchor="end"
                className="fill-current text-[10px]"
                fillOpacity={0.5}
              >
                {line.value}
              </text>
            </g>
          ))}
        </g>

        {/* Views: the volume, as a filled area in the brand rose. */}
        <g className="text-rose-gold">
          <path d={areaPath} fill="url(#traffic-views-fill)" />
          <polyline
            points={viewsLine}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </g>

        {/* Visitors: the people, as a lighter dashed line so the two never blur together. */}
        <g className="text-charcoal">
          <polyline
            points={visitorsLine}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.55}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </g>

        <g className="text-charcoal">
          {xLabels.map(({ i, day }) => (
            <text
              key={day + i}
              x={x(i)}
              y={H - 6}
              textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
              className="fill-current text-[10px]"
              fillOpacity={0.5}
            >
              {formatDay(day)}
            </text>
          ))}
        </g>
      </svg>

      {/* A legend is cheaper than a tooltip here, and it survives the chart being screenshotted. */}
      <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-charcoal-soft">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-rose-gold" />
          Page views · {totalViews.toLocaleString('en-GB')}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-0.5 w-4 rounded-full border-t border-dashed border-charcoal/60"
          />
          Unique visitors · {totalVisitors.toLocaleString('en-GB')}
        </span>
        <span className="text-charcoal-soft/70">Visitors are counted per Nepal day, so they repeat.</span>
      </figcaption>
    </figure>
  );
}
