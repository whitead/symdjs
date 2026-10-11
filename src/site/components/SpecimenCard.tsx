// One drawer of the cabinet: a live crystal with a specimen label giving
// its group, Wyckoff occupancy and growth status.

import { useCallback, useState, type CSSProperties } from "react";
import type { Group } from "../../engine/groups/group";
import { occupancyLabel, cellCount, toRoman, type Occupancy } from "../lib/groups";
import type { SimPhase, SimStats } from "../sim/types";
import { HM, Orbifold } from "./GroupSymbol";
import { SimSlot } from "./SimSlot";
import "../styles/components/specimen-card.css";

export interface SpecimenCardProps {
  index: number;
  group: Group;
  occupancy: Occupancy;
  seed: number;
}

const PHASE_TEXT: Record<SimPhase, string> = {
  compressing: "compressing…",
  annealing: "annealing…",
  crystal: "crystal",
  released: "released",
};

export function SpecimenCard({ index, group, occupancy, seed }: SpecimenCardProps) {
  const [status, setStatus] = useState<{ phase: SimPhase; progress: number }>({ phase: "compressing", progress: 0 });
  const onStats = useCallback((s: SimStats) => {
    setStatus((prev) =>
      prev.phase === s.phase && Math.abs(prev.progress - s.progress) < 0.02 ? prev : { phase: s.phase, progress: s.progress },
    );
  }, []);
  const occ = occupancyLabel(group, occupancy);

  return (
    <li className="specimen">
      <div className="specimen__mat">
        <SimSlot
          variant="card"
          group={group.name}
          occupancy={occupancy}
          seed={seed}
          onStats={onStats}
          label={`Specimen ${index + 1}: a ${group.name} crystal with Wyckoff occupancy ${occ}`}
        />
      </div>
      <div className="specimen__label">
        <div className="specimen__head">
          <span className="specimen__no">No. {index + 1}</span>
          <a className="specimen__plate" href={`#plate-${group.name}`}>
            Plate {toRoman(group.number)}
          </a>
        </div>
        <h3 className="specimen__name">
          <HM name={group.name} />
          <Orbifold symbol={group.orbifold} className="specimen__orbifold" />
        </h3>
        <p className="specimen__occ">
          {occ}
          <span className="specimen__n"> · {cellCount(group, occupancy)}/cell</span>
        </p>
        <p
          className="specimen__status"
          data-phase={status.phase}
          style={{ "--progress": status.progress } as CSSProperties}
          aria-live="off"
        >
          <span className="specimen__dot" aria-hidden="true" />
          <span className="specimen__phase">{PHASE_TEXT[status.phase]}</span>
          <span className="specimen__bar" aria-hidden="true" />
        </p>
      </div>
    </li>
  );
}
