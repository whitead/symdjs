// Frontispiece: a full-bleed live pattern behind the title, framed like an
// engraved plate.

import { useMemo, useState } from "react";
import { SimSlot } from "../components/SimSlot";
import { planeGroup, type Occupancy } from "../lib/groups";
import "../styles/sections/hero.css";

const HERO_GROUPS = ["p6m", "p4m", "p31m", "p4g", "p6", "cmm"];
const ALL_GROUPS = [...HERO_GROUPS, "p1", "p2", "pm", "pg", "cm", "pmm", "pmg", "pgg", "p4", "p3", "p3m1"];

function heroOccupancy(name: string): Occupancy {
  const g = planeGroup(name);
  const occ: Occupancy = {};
  const general = g.sites[g.sites.length - 1];
  occ[general.letter] = Math.max(2, Math.round(30 / g.order));
  const line = g.sites.find((s) => s.k === 1);
  const point = g.sites.find((s) => s.k === 0);
  if (line) occ[line.letter] = 1;
  if (point) occ[point.letter] = 1;
  return occ;
}

export function Hero() {
  const [seed] = useState(() => (Math.random() * 1e6) | 0);
  const name = useMemo(() => {
    const forced = new URLSearchParams(window.location.search).get("hero");
    return forced && ALL_GROUPS.includes(forced) ? forced : HERO_GROUPS[seed % HERO_GROUPS.length];
  }, [seed]);
  const occupancy = useMemo(() => heroOccupancy(name), [name]);

  return (
    <header className="hero" id="top">
      <SimSlot variant="hero" group={name} occupancy={occupancy} seed={seed} label={`A live ${name} pattern of Lennard-Jones particles`} />
      <div className="hero__veil" aria-hidden="true" />
      <div className="hero__frame" aria-hidden="true" />

      <div className="hero__copy">
        <h1 className="hero__title">
          <span className="hero__pre">An atlas of</span>{" "}
          <span className="hero__main">
            2D <em>crystals</em>
          </span>
        </h1>
        <p className="hero__subtitle">with symmetric molecular dynamics</p>
        <p className="hero__credit">
          After S. Cox &amp; A. D. White,{" "}
          <a href="https://doi.org/10.1021/acs.jctc.2c00401">
            <cite>Symmetric Molecular Dynamics</cite>
          </a>
          , J. Chem. Theory Comput. <b>18</b>, 4077 (2022). Reference implementation:{" "}
          <a href="https://github.com/whitead/symd">whitead/symd</a>.
        </p>
      </div>
    </header>
  );
}
