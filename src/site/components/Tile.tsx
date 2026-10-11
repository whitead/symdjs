// One plane group in the atlas grid: a live simulation, its name, a small
// symmetry diagram, the Wyckoff sites you can fill, and a switch to release
// the symmetry.

import { useState } from "react";
import type { Group } from "../../engine/groups/group";
import { cellCount, toRoman, type Occupancy } from "../lib/groups";
import { Button } from "./Button";
import { HM, Orbifold } from "./GroupSymbol";
import { LockIcon, UnlockIcon } from "./Icons";
import { SimSlot } from "./SimSlot";
import { SymmetryDiagram } from "./SymmetryDiagram";
import { WyckoffEditor } from "./WyckoffEditor";
import "../styles/components/tile.css";

export interface TileProps {
  group: Group;
  initial: Occupancy;
  seed: number;
  /** barostat pressure shared by the atlas (null = fixed volume) */
  pressure: number | null;
}

export function Tile({ group, initial, seed, pressure }: TileProps) {
  const [occupancy, setOccupancy] = useState<Occupancy>(initial);
  const [released, setReleased] = useState(false);
  // a released crystal has no Wyckoff sites to edit: editing restores the symmetry
  const editSites = (occ: Occupancy) => {
    setReleased(false);
    setOccupancy(occ);
  };
  return (
    <li className="tile" id={`plate-${group.name}`}>
      <div className="tile__mat">
        <SimSlot
          variant="tile"
          group={group.name}
          occupancy={occupancy}
          seed={seed}
          released={released}
          pressure={pressure}
          label={`Live ${group.name} simulation${released ? " with its symmetry released" : ""}. Press and move to touch it.`}
        />
      </div>
      <div className="tile__label">
        <div className="tile__head">
          <p className="tile__no">{toRoman(group.number)}</p>
          <h3 className="tile__name">
            <HM name={group.name} />
            <Orbifold symbol={group.orbifold} className="tile__orbifold" />
          </h3>
          <p className="tile__meta">
            {group.lattice.toLowerCase()} · {cellCount(group, occupancy)} per cell
          </p>
        </div>
        <SymmetryDiagram group={group} size={52} showAsym showWyckoff={false} className="tile__diagram" />
      </div>
      <WyckoffEditor className="wyckoff--compact tile__wyckoff" group={group} value={occupancy} onChange={editSites} summary={false} />
      <div className="tile__foot">
        <Button
          size="s"
          variant="quiet"
          className="tile__symmetry"
          data-released={released || undefined}
          pressed={!released}
          icon={released ? <UnlockIcon /> : <LockIcon />}
          onClick={() => setReleased((r) => !r)}
          title={released ? "Symmetry released: every copy is a free particle. Click to restore." : "Symmetry on. Click to release it: every copy becomes a free particle."}
        >
          symmetry
        </Button>
      </div>
    </li>
  );
}
