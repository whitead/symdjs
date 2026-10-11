// III. The atlas: a table of plates, then 17 plates grouped by lattice.

import { HM, Orbifold } from "../components/GroupSymbol";
import { LatticeGlyph } from "../components/LatticeGlyph";
import { Plate } from "../components/Plate";
import { SectionHeader } from "../components/SectionHeader";
import { LATTICE_FAMILIES, planeGroup, toRoman } from "../lib/groups";
import "../styles/sections/atlas.css";

export function Atlas() {
  let plateIndex = 0;
  return (
    <section className="section atlas" id="atlas" aria-labelledby="atlas-title">
      <div className="wrap">
        <SectionHeader
          numeral="III"
          kicker="The atlas"
          id="atlas-title"
          className="wide"
          title={
            <>
              Seventeen <em>plates</em>
            </>
          }
        >
          <p>
            There are exactly seventeen ways to repeat a pattern in the plane. Each plate below runs one of them live.
            Choose which Wyckoff sites to fill, heat it, squeeze it, or release its symmetry to see whether the crystal
            survives on its own.
          </p>
        </SectionHeader>

        <nav className="atlas-index wide" aria-label="Table of plates">
          {LATTICE_FAMILIES.map((f) => (
            <div key={f.name} className="atlas-index__family" data-lattice={f.name.toLowerCase()}>
              <p className="atlas-index__lattice">
                <LatticeGlyph lattice={f.name} size={22} />
                {f.name}
              </p>
              <ul>
                {f.groups.map((name) => {
                  const g = planeGroup(name);
                  return (
                    <li key={name}>
                      <a href={`#plate-${name}`} className="atlas-index__link">
                        <span className="atlas-index__num">{toRoman(g.number)}</span>
                        <HM name={name} className="atlas-index__hm" />
                        <Orbifold symbol={g.orbifold} className="atlas-index__orb" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      {LATTICE_FAMILIES.map((f) => (
        <section key={f.name} className="lattice-family" aria-labelledby={`lattice-${f.name}`} data-lattice={f.name.toLowerCase()}>
          <header className="lattice-family__header">
            <LatticeGlyph lattice={f.name} size={52} />
            <div>
              <h3 className="lattice-family__title" id={`lattice-${f.name}`}>
                {f.name} <span>lattice</span>
              </h3>
              <p className="lattice-family__desc">{f.description}</p>
            </div>
            <p className="lattice-family__count">
              {f.groups.length} group{f.groups.length > 1 ? "s" : ""}
            </p>
          </header>
          <div className="lattice-family__plates">
            {f.groups.map((name) => {
              const flip = plateIndex++ % 2 === 1;
              return <Plate key={name} group={planeGroup(name)} flip={flip} />;
            })}
          </div>
        </section>
      ))}
    </section>
  );
}
