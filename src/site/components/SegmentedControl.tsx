// A row of mutually exclusive options built on native radio inputs, so the
// arrow keys, focus and form semantics come for free.

import { useId, type CSSProperties, type ReactNode } from "react";
import "../styles/components/segmented.css";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  /** tooltip / accessible description */
  title?: string;
}

export interface SegmentedControlProps<T extends string> {
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  /** visually hide the legend (it stays available to screen readers) */
  hideLabel?: boolean;
  className?: string;
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  hideLabel,
  className,
}: SegmentedControlProps<T>) {
  const name = useId();
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <fieldset className={["segmented", className].filter(Boolean).join(" ")}>
      <legend className={hideLabel ? "visually-hidden" : "segmented__legend"}>{label}</legend>
      <div
        className="segmented__track"
        style={{ "--count": options.length, "--index": index } as CSSProperties}
      >
        <span className="segmented__thumb" aria-hidden="true" />
        {options.map((o) => (
          <label key={o.value} className="segmented__option" title={o.title}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
