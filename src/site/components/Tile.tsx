// One plane group in the atlas grid: a live simulation, its name, a small
// symmetry diagram, and the Wyckoff sites you can fill.

import { useState } from "react";
import type { Group } from "../../engine/groups/group";
import { cellCount, toRoman, type Occupancy } from "../lib/groups";
import { HM, Orbifold } from "./GroupSymbol";
import { SimSlot } from "./SimSlot";
import { SymmetryDiagram } from "./SymmetryDiagram";
import { WyckoffEditor } from "./WyckoffEditor";
import "../styles/components/tile.css";

export interface TileProps {
  group: Group;
  initial: Occupancy;
  seed: number;
}

export function Tile({ group, initial, seed }: TileProps) {
  const [occupancy, setOccupancy] = useState<Occupancy>(initial);
  return (
    <li className="tile" id={`plate-${group.name}`}>
      <div className="tile__mat">
        <SimSlot
          variant="tile"
          group={group.name}
          occupancy={occupancy}
          seed={seed}
          label={`Live ${group.name} simulation. Press and move to touch it.`}
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
      <WyckoffEditor className="wyckoff--compact tile__wyckoff" group={group} value={occupancy} onChange={setOccupancy} summary={false} />
    </li>
  );
}
