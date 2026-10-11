// I. The atlas: all seventeen plane groups at once, each a live simulation
// whose Wyckoff sites can be filled.

import { useMemo, useState } from "react";
import { Rng } from "../../engine/math/rng";
import { SectionHeader } from "../components/SectionHeader";
import { Slider } from "../components/Slider";
import { Tile } from "../components/Tile";
import { planeGroups, randomOccupancy } from "../lib/groups";
import "../styles/sections/atlas.css";

/**
 * Slider position x ∈ [−100, 100] maps onto pressure with a signed log scale:
 * 0 is P = 0, and ±1…±100 span |P| = 0.002…2 (negative = tension).
 */
const P_MIN = 0.002;
const P_MAX = 2;
function pressureAt(x: number): number {
  if (x === 0) return 0;
  return Math.sign(x) * P_MIN * Math.pow(P_MAX / P_MIN, (Math.abs(x) - 1) / 99);
}

function formatPressure(p: number): string {
  if (p === 0) return "0";
  const a = Math.abs(p);
  return (p < 0 ? "−" : "") + (a < 0.1 ? a.toFixed(3) : a.toFixed(2));
}

/** default slider position */
const DEFAULT_PX = 0;

export function Atlas() {
  const [px, setPx] = useState(() => {
    const q = new URLSearchParams(window.location.search).get("p");
    return q !== null && Number.isFinite(Number(q)) ? Math.max(-100, Math.min(100, Number(q))) : DEFAULT_PX;
  });
  // constant volume by default; unchecking hands the box to the barostat
  const [fixedVolume, setFixedVolume] = useState(true);
  const pressure = fixedVolume ? null : pressureAt(px);
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
            This is showing a method to constrain simulations to follow a tiling group. There are seventeen ways to tile a
            plane in 2D. Below are Lennard-Jones simulations for each of those seventeen tilings.
          </p>
        </SectionHeader>
      </div>
      <div className="atlas__body">
        <aside className="atlas__controls" aria-label="Simulation controls">
          <label className="atlas__check">
            <input type="checkbox" checked={fixedVolume} onChange={(e) => setFixedVolume(e.currentTarget.checked)} />
            fixed volume
          </label>
          <Slider
            label="Pressure"
            symbol="P"
            value={px}
            min={-100}
            max={100}
            step={1}
            ticks={10}
            format={(x) => formatPressure(pressureAt(x))}
            onChange={setPx}
            disabled={fixedVolume}
            className="atlas__pressure"
          />
        </aside>
        <ol className="atlas__grid">
          {groups.map((g, i) => (
            <Tile key={g.name} group={g} initial={initial[i]} seed={seed + 101 * g.number} pressure={pressure} />
          ))}
        </ol>
      </div>
    </section>
  );
}
