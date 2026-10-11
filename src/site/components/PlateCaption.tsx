// Engraved caption line: PLATE XI · p4m · ∗442 · square lattice · |G| = 8

import type { Group } from "../../engine/groups/group";
import { latticeLabel, toRoman } from "../lib/groups";
import { HM, Orbifold } from "./GroupSymbol";
import "../styles/components/plate-caption.css";

export interface PlateCaptionProps {
  group: Group;
  /** "Plate" in the atlas, "Specimen", "Frontispiece" elsewhere */
  kind?: string;
  /** plate number; defaults to the group's international number */
  number?: number;
  /** extra trailing item, e.g. an occupancy "8g + 1a" */
  extra?: string;
  /** hide the number (e.g. frontispiece) */
  hideNumber?: boolean;
  className?: string;
}

export function PlateCaption({ group, kind = "Plate", number, extra, hideNumber, className }: PlateCaptionProps) {
  const n = number ?? group.number;
  return (
    <p className={["plate-caption", className].filter(Boolean).join(" ")}>
      <span className="plate-caption__kind">
        {kind}
        {!hideNumber && <span className="plate-caption__num"> {toRoman(n)}</span>}
      </span>
      <span className="plate-caption__sep" aria-hidden="true">
        ·
      </span>
      <HM name={group.name} className="plate-caption__hm" />
      <span className="plate-caption__sep" aria-hidden="true">
        ·
      </span>
      <Orbifold symbol={group.orbifold} />
      <span className="plate-caption__sep" aria-hidden="true">
        ·
      </span>
      <span>{latticeLabel(group.lattice)}</span>
      <span className="plate-caption__sep" aria-hidden="true">
        ·
      </span>
      <span className="plate-caption__order">
        |<i>G</i>| = {group.order}
      </span>
      {extra && (
        <>
          <span className="plate-caption__sep" aria-hidden="true">
            ·
          </span>
          <span>{extra}</span>
        </>
      )}
    </p>
  );
}
