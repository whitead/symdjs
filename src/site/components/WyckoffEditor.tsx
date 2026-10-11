// Wyckoff occupancy editor: one chip per site letter showing its
// multiplicity ("4e"), what kind of site it is (in the site's particle
// colour), and a −/+ stepper for how many independent particles sit there.

import type { CSSProperties } from "react";
import type { Group, WyckoffSite } from "../../engine/groups/group";
import { wyckoffColor } from "../../engine/render/renderer";
import { MAX_CELL, MAX_REPS, cellCount, maxCount, repCount, siteKind, type Occupancy } from "../lib/groups";
import { MinusIcon, PlusIcon } from "./Icons";
import "../styles/components/wyckoff.css";

export interface WyckoffEditorProps {
  group: Group;
  value: Occupancy;
  onChange: (next: Occupancy) => void;
  /** show the N-per-cell summary line (default true) */
  summary?: boolean;
  className?: string;
}

const KIND_TEXT = {
  point: "on a rotation centre: fixed in place",
  line: "on a mirror line: slides along it",
  general: "general position: free in the plane",
} as const;

function SiteGlyph({ site }: { site: WyckoffSite }) {
  const kind = siteKind(site);
  return (
    <svg className="wyckoff__glyph" viewBox="0 0 14 14" aria-hidden="true">
      {kind === "point" && <circle cx="7" cy="7" r="2.6" fill="currentColor" />}
      {kind === "line" && (
        <>
          <path d="M1.5 12.5 12.5 1.5" stroke="currentColor" strokeWidth="1.1" strokeDasharray="2 1.6" />
          <circle cx="7" cy="7" r="2.1" fill="currentColor" />
        </>
      )}
      {kind === "general" && (
        <>
          <rect x="1.5" y="1.5" width="11" height="11" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="5.2" cy="8.3" r="2.1" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

export function WyckoffEditor({ group, value, onChange, summary = true, className }: WyckoffEditorProps) {
  const total = repCount(value);
  const perCell = cellCount(group, value);
  const set = (letter: string, n: number) => onChange({ ...value, [letter]: n });

  return (
    <div className={["wyckoff", className].filter(Boolean).join(" ")}>
      <ul className="wyckoff__chips">
        {group.sites.map((site, si) => {
          const n = value[site.letter] ?? 0;
          const max = maxCount(site, group.order);
          const kind = siteKind(site);
          const desc = `Site ${site.label}, ${KIND_TEXT[kind]}, ${site.multiplicity} image${site.multiplicity > 1 ? "s" : ""} per cell`;
          return (
            <li
              key={site.letter}
              className="wyckoff__chip"
              data-kind={kind}
              data-active={n > 0 || undefined}
              title={desc}
              style={{ "--site": wyckoffColor(si, group.sites.length) } as CSSProperties}
            >
              <span className="wyckoff__site">
                <SiteGlyph site={site} />
                <span className="wyckoff__mult">{site.multiplicity}</span>
                <i className="wyckoff__letter">{site.letter}</i>
              </span>
              <span className="wyckoff__stepper" role="group" aria-label={desc}>
                <button
                  type="button"
                  onClick={() => set(site.letter, n - 1)}
                  disabled={n <= 0 || total <= 1}
                  aria-label={`Remove a particle from ${site.label}`}
                >
                  <MinusIcon size={11} />
                </button>
                <output className="wyckoff__count" aria-live="polite">
                  {n}
                </output>
                <button
                  type="button"
                  onClick={() => set(site.letter, n + 1)}
                  disabled={n >= max || total + 1 > MAX_REPS || perCell + site.multiplicity > MAX_CELL}
                  aria-label={`Add a particle to ${site.label}`}
                >
                  <PlusIcon size={11} />
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {summary && (
        <p className="wyckoff__summary">
          <span>
            <b>{total}</b> independent
          </span>
          <span aria-hidden="true">→</span>
          <span>
            <b>{perCell}</b> per cell
          </span>
        </p>
      )}
    </div>
  );
}
