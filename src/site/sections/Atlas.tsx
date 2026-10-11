// I. The atlas: all seventeen plane groups at once, each a live simulation
// whose Wyckoff sites can be filled.

import { useMemo, useState } from "react";
import { Rng } from "../../engine/math/rng";
import { SectionHeader } from "../components/SectionHeader";
import { Slider } from "../components/Slider";
import { Tile } from "../components/Tile";
import { planeGroups, randomOccupancy } from "../lib/groups";
import "../styles/sections/atlas.css";

/** Slider position 0 is fixed volume; 1…100 map logarithmically onto P = 0.002…2. */
const P_MIN = 0.002;
const P_MAX = 2;
function pressureAt(x: number): number | null {
  return x <= 0 ? null : P_MIN * Math.pow(P_MAX / P_MIN, (x - 1) / 99);
}

export function Atlas() {
  const [px, setPx] = useState(0);
  const pressure = pressureAt(px);
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
      <div className="atlas__controls">
        <Slider
          label="Pressure"
          symbol="P"
          value={px}
          min={0}
          max={100}
          step={1}
          ticks={10}
          format={(x) => {
            const p = pressureAt(x);
            return p === null ? "fixed volume" : p < 0.1 ? p.toFixed(3) : p.toFixed(2);
          }}
          onChange={setPx}
          className="atlas__pressure"
        />
      </div>
      <ol className="atlas__grid">
        {groups.map((g, i) => (
          <Tile key={g.name} group={g} initial={initial[i]} seed={seed + 101 * g.number} pressure={pressure} />
        ))}
      </ol>
    </section>
  );
}
