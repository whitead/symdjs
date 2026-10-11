// The symmetry-diagram figure on each plate: an International-Tables-style
// diagram of the cell (mirrors, glides, rotation centres, asymmetric unit
// and Wyckoff sites) in a square plate-mark frame.

import type { Group } from "../../engine/groups/group";
import { SymmetryDiagram } from "./SymmetryDiagram";
import "../styles/components/diagram-slot.css";

export interface DiagramSlotProps {
  group: Group;
  caption?: string;
  className?: string;
  highlightSite?: string;
  onHoverSite?: (letter: string | null) => void;
}

export function DiagramSlot({ group, caption = "Symmetry elements & Wyckoff sites", className, highlightSite, onHoverSite }: DiagramSlotProps) {
  return (
    <figure className={["diagram-slot", className].filter(Boolean).join(" ")}>
      <div className="diagram-slot__frame">
        <SymmetryDiagram group={group} size={320} showAsym showWyckoff highlightSite={highlightSite} onHoverSite={onHoverSite} />
      </div>
      <figcaption className="diagram-slot__caption">{caption}</figcaption>
    </figure>
  );
}
