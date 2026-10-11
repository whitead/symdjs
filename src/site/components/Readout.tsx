// Live readouts: a label, the current value, and a sparkline of recent
// history. ReadoutRow lays several out as an engraved table row.

import type { ReactNode } from "react";
import { Sparkline } from "./Sparkline";
import "../styles/components/readout.css";

export interface ReadoutProps {
  /** sentence-case name, e.g. "Density" */
  label: string;
  /** math symbol, e.g. ρ */
  symbol: ReactNode;
  value: number | null;
  history: number[];
  units?: ReactNode;
  digits?: number;
  accent?: string;
}

export function Readout({ label, symbol, value, history, units, digits = 2, accent }: ReadoutProps) {
  const text = value === null || !Number.isFinite(value) ? "–" : formatValue(value, digits);
  return (
    <div className="readout">
      <dt className="readout__label">
        <span className="readout__symbol">{symbol}</span>
        <span className="readout__name">{label}</span>
      </dt>
      <dd className="readout__value">
        <span className="readout__number">{text}</span>
        {units && <span className="readout__units">{units}</span>}
      </dd>
      <dd className="readout__spark">
        <Sparkline values={history} width={120} height={26} accent={accent} label={`${label} trend`} />
      </dd>
    </div>
  );
}

export function ReadoutRow({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={["readout-row", className].filter(Boolean).join(" ")}>{children}</dl>;
}

function formatValue(v: number, digits: number): string {
  const s = Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(digits);
  return s.replace("-", "−");
}
