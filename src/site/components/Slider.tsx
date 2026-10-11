// Labelled range input with a live value readout and engraved tick marks.

import { useId, type CSSProperties, type ReactNode } from "react";
import "../styles/components/slider.css";

export interface SliderProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  /** units shown after the value, e.g. "ε/k" */
  units?: ReactNode;
  /** math symbol shown before the label, e.g. T* */
  symbol?: ReactNode;
  /** value formatting (default: 2 decimals) */
  format?: (v: number) => string;
  /** number of minor ticks drawn under the track */
  ticks?: number;
  disabled?: boolean;
  className?: string;
}

export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.01,
  units,
  symbol,
  format = (v) => v.toFixed(2),
  ticks = 10,
  disabled,
  className,
}: SliderProps) {
  const id = useId();
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className={["slider", className].filter(Boolean).join(" ")} data-disabled={disabled || undefined}>
      <div className="slider__head">
        <label htmlFor={id} className="slider__label">
          {symbol && <span className="slider__symbol">{symbol}</span>}
          {label}
        </label>
        <output htmlFor={id} className="slider__value">
          {format(value)}
          {units && <span className="slider__units"> {units}</span>}
        </output>
      </div>
      <div className="slider__track" style={{ "--fill": `${fill}%` } as CSSProperties}>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.currentTarget.value))}
          aria-valuetext={`${format(value)}${typeof units === "string" ? ` ${units}` : ""}`}
        />
        <div className="slider__ticks" aria-hidden="true">
          {Array.from({ length: ticks + 1 }, (_, i) => (
            <span key={i} data-major={i === 0 || i === ticks || i === ticks / 2 || undefined} />
          ))}
        </div>
      </div>
    </div>
  );
}
