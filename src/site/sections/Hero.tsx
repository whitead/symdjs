// Frontispiece: a full-bleed live crystal behind the title, framed like an
// engraved plate.

import { useMemo, useState } from "react";
import { HandIcon, ArrowDownIcon } from "../components/Icons";
import { PlateCaption } from "../components/PlateCaption";
import { SimSlot } from "../components/SimSlot";
import { occupancyLabel, planeGroup, type Occupancy } from "../lib/groups";
import "../styles/sections/hero.css";

const HERO_GROUPS = ["p6m", "p4m", "p31m", "p4g", "p6", "cmm"];

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
    return forced && HERO_GROUPS.concat(["p1", "p2", "pm", "pg", "cm", "pmm", "pmg", "pgg", "p4", "p3", "p3m1"]).includes(forced)
      ? forced
      : HERO_GROUPS[seed % HERO_GROUPS.length];
  }, [seed]);
  const group = planeGroup(name);
  const occupancy = useMemo(() => heroOccupancy(name), [name]);

  return (
    <header className="hero" id="top">
      <SimSlot
        variant="hero"
        group={name}
        occupancy={occupancy}
        seed={seed}
        label={`A live ${name} crystal. Drag a particle and all of its symmetric images follow.`}
      />
      <div className="hero__veil" aria-hidden="true" />
      <div className="hero__frame" aria-hidden="true" />

      <nav className="masthead" aria-label="Sections">
        <a className="masthead__mark" href="#top">
          symd<span>.js</span>
        </a>
        <ul className="masthead__links">
          <li>
            <a href="#cabinet">Cabinet</a>
          </li>
          <li>
            <a href="#how">How it works</a>
          </li>
          <li>
            <a href="#atlas">Atlas</a>
          </li>
          <li>
            <a href="#lab">Lab</a>
          </li>
        </ul>
      </nav>

      <div className="hero__copy">
        <h1 className="hero__title">
          <span className="hero__pre">An Atlas of</span>{" "}
          <span className="hero__main">
            <em>Symmetric</em> Molecular Dynamics
          </span>
        </h1>
        <p className="hero__subtitle">
          Every way a two-dimensional crystal can be symmetric, simulated live in your browser.
        </p>
        <p className="hero__credit">
          After S. Cox &amp; A. D. White,{" "}
          <a href="https://doi.org/10.1021/acs.jctc.2c00401">
            <cite>Symmetric Molecular Dynamics</cite>
          </a>
          , J. Chem. Theory Comput. <b>18</b>, 4077 (2022). Reference implementation:{" "}
          <a href="https://github.com/whitead/symd">whitead/symd</a>.
        </p>
      </div>

      <div className="hero__foot">
        <a className="scroll-cue" href="#cabinet">
          <span className="scroll-cue__line" aria-hidden="true" />
          <span>Begin</span>
          <ArrowDownIcon size={14} />
        </a>
        <div className="hero__legend">
          <p className="hero__hint">
            <HandIcon size={15} />
            drag a particle: all its symmetric images follow
          </p>
          <PlateCaption group={group} kind="Frontispiece" hideNumber extra={occupancyLabel(group, occupancy)} />
        </div>
      </div>
    </header>
  );
}
