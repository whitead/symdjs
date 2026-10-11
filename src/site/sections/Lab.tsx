// IV. The lab: a teaser for the free-form workbench (any group, custom
// generators, potentials). Layout only; nothing here is wired up yet.

import { HM } from "../components/GroupSymbol";
import { SectionHeader } from "../components/SectionHeader";
import { SimSlot } from "../components/SimSlot";
import { planeGroup } from "../lib/groups";
import "../styles/sections/lab.css";

const LAB_GROUP = "p4g";

export function Lab() {
  const g = planeGroup(LAB_GROUP);
  const general = g.sites[g.sites.length - 1];
  return (
    <section className="section lab wrap" id="lab" aria-labelledby="lab-title">
      <SectionHeader
        numeral="IV"
        kicker="The lab"
        id="lab-title"
        className="wide"
        title={
          <>
            A workbench for <em>any</em> symmetry
          </>
        }
      >
        <p>
          The atlas fixes one plate per group. The lab will let you write your own: pick a group or type its generators,
          choose a potential, mix species across Wyckoff sites, and export what grows.
        </p>
      </SectionHeader>

      <div className="lab__bench wide">
        <div className="lab__stage">
          <SimSlot variant="plate" group={LAB_GROUP} seed={42} label="Preview of the lab workbench" />
          <p className="lab__stamp" aria-hidden="true">
            In preparation
          </p>
        </div>

        <div className="lab__panel" aria-label="Planned lab controls">
          <div className="lab__block">
            <p className="lab__label">Group</p>
            <p className="lab__group">
              <HM name={LAB_GROUP} /> <span className="lab__or">or your own generators</span>
            </p>
          </div>
          <div className="lab__block">
            <p className="lab__label">Generators · xyz notation</p>
            <ol className="lab__ops">
              {general.coords.map((c, i) => (
                <li key={i}>
                  <span className="lab__op-num">{i + 1}</span>
                  <code>{c.replace(/-/g, "−").replace(/,/g, ", ")}</code>
                </li>
              ))}
              <li className="lab__op-new">
                <span className="lab__op-num">+</span>
                <code>add an operation…</code>
              </li>
            </ol>
          </div>
          <div className="lab__block">
            <p className="lab__label">Potential</p>
            <ul className="lab__chips">
              <li data-on>Lennard-Jones</li>
              <li>WCA</li>
              <li>soft cosine</li>
              <li>custom u(r)</li>
            </ul>
          </div>
          <ul className="lab__list">
            <li>All 17 plane groups, every Wyckoff site</li>
            <li>Several species, each on its own sites</li>
            <li>Export coordinates and the unit cell</li>
            <li>Later: the 230 space groups in three dimensions</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
