// A tiny SVG trend line: de-emphasised ink stroke, a faint wash beneath it,
// and the current value marked with an accent dot.

import { useId } from "react";
import "../styles/components/sparkline.css";

export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  /** fixed y-range; defaults to the data range (padded) */
  min?: number;
  max?: number;
  /** colour of the current-value dot */
  accent?: string;
  /** accessible summary; defaults to first → last value */
  label?: string;
  className?: string;
}

export function Sparkline({
  values,
  width = 120,
  height = 28,
  min,
  max,
  accent = "var(--c-cerulean)",
  label,
  className,
}: SparklineProps) {
  const gid = useId();
  const pad = 3;
  const n = values.length;
  let lo = min ?? Math.min(...values);
  let hi = max ?? Math.max(...values);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0;
    hi = 1;
  }
  if (hi - lo < 1e-9) {
    const c = (hi + lo) / 2;
    const d = Math.max(Math.abs(c) * 0.05, 1e-3);
    lo = c - d;
    hi = c + d;
  }
  const x = (i: number) => pad + (n <= 1 ? 0 : (i / (n - 1)) * (width - 2 * pad));
  const y = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (height - 2 * pad);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const line = pts.length ? `M${pts.join("L")}` : "";
  const area = pts.length ? `${line}L${x(n - 1).toFixed(1)},${height}L${x(0).toFixed(1)},${height}Z` : "";
  const last = values[n - 1];
  const summary =
    label ?? (n > 1 ? `trend from ${values[0].toPrecision(3)} to ${last.toPrecision(3)}` : "no data yet");

  return (
    <svg
      className={["sparkline", className].filter(Boolean).join(" ")}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={summary}
    >
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.12" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line className="sparkline__base" x1={pad} x2={width - pad} y1={height - 0.5} y2={height - 0.5} />
      {n > 1 && (
        <>
          <path d={area} fill={`url(#${gid})`} />
          <path className="sparkline__line" d={line} />
          <circle cx={x(n - 1)} cy={y(last)} r={4} className="sparkline__halo" />
          <circle cx={x(n - 1)} cy={y(last)} r={2.4} fill={accent} />
        </>
      )}
    </svg>
  );
}
