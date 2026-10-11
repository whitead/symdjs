// I. The atlas: all seventeen plane groups at once, each a live simulation
// whose Wyckoff sites can be filled.

import { useMemo, useState } from "react";
import { Rng } from "../../engine/math/rng";
import { SectionHeader } from "../components/SectionHeader";
import { Tile } from "../components/Tile";
import { planeGroups, randomOccupancy } from "../lib/groups";
import "../styles/sections/atlas.css";

export function Atlas() {
  // a different arrangement of Wyckoff sites on every visit
  const [seed] = useState(() => 1 + ((Math.random() * 1e6) | 0));
  const groups = planeGroups();
  const initial = useMemo(() => {
    const rng = new Rng(seed);
    return groups.map((g) => randomOccupancy(g, rng));
  }, [seed, groups]);

  return (
    <section className="section atlas" id="atlas" aria-labelledby="atlas-title">
      <div className="wrap">
        <SectionHeader
          numeral="I"
          kicker="The atlas"
          id="atlas-title"
          className="wide"
          title={
            <>
              Seventeen <em>plane groups</em>
            </>
          }
        >
          <p>
            There are exactly seventeen ways to repeat a pattern in the plane. Each one runs here as Lennard-Jones
            particles in which only the asymmetric unit moves freely and every other particle is its symmetric copy.
            The chips beneath each group are its Wyckoff sites; add or remove particles on them.
          </p>
        </SectionHeader>
      </div>
      <ol className="atlas__grid">
        {groups.map((g, i) => (
          <Tile key={g.name} group={g} initial={initial[i]} seed={seed + 101 * g.number} />
        ))}
      </ol>
    </section>
  );
}
