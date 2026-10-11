// II. How it works: a sticky simulation beside six scrolling steps. The
// active step drives the explainer's `stage`.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { HM } from "../components/GroupSymbol";
import { SectionHeader } from "../components/SectionHeader";
import { SimSlot } from "../components/SimSlot";
import type { ExplainerStage } from "../sim/types";
import "../styles/sections/how.css";

const EXPLAINER_GROUP = "cmm";
const EXPLAINER_OCCUPANCY = { f: 2, e: 1, a: 1 };

const G = () => (
  <span className="math-inline">
    <span className="up">|</span>
    <i>G</i>
    <span className="up">|</span>
  </span>
);

interface Step {
  stage: ExplainerStage;
  title: string;
  caption: ReactNode;
  body: ReactNode;
}

const STEPS: Step[] = [
  {
    stage: "asym",
    title: "A crystal is mostly redundant",
    caption: (
      <>
        The asymmetric unit of <HM name="cmm" /> (hatched) is one eighth of the cell. Only the ringed particles are
        integrated.
      </>
    ),
    body: (
      <>
        <p>
          Look closely at any crystal and most of it is repetition. Under a symmetry group <i>G</i>, the whole unit cell
          can be rebuilt from one small region, the <em>asymmetric unit</em>, which holds just 1/<G /> of the cell.
        </p>
        <p>
          Only the particles in that region are independent, so they are the only ones we integrate. For{" "}
          <HM name="cmm" />, with <G /> = 8, that is an eighth of the work.
        </p>
      </>
    ),
  },
  {
    stage: "ghosts",
    title: "Ghost particles",
    caption: <>The eight operations of the group stamp ghosts (pale) out of the asymmetric unit.</>,
    body: (
      <>
        <p>
          Every other particle is a <em>ghost</em>, made by applying the group&rsquo;s affine operations (rotations,
          reflections, glides) to the asymmetric unit in fractional coordinates, <span className="formula">s = B⁻¹q</span>.
          Ghosts are never integrated. They exist only while forces are computed.
        </p>
        <p>
          The potential does not change when particles are rotated, reflected or translated, so the forces are{" "}
          <em>G-equivariant</em>: the force on a ghost is exactly the transformed force on its parent. The symmetry is
          therefore preserved exactly at every step, not just on average.
        </p>
      </>
    ),
  },
  {
    stage: "tiling",
    title: "Tiling",
    caption: <>Lattice translations repeat the cell across the plane.</>,
    body: (
      <>
        <p>
          Lattice translations repeat the unit cell to fill the plane. Rather than keeping a fixed shell of periodic
          copies, this engine loops over exactly the lattice images that fall within the cutoff of each particle.
        </p>
        <p>
          That keeps the forces correct even when the cell shrinks below the cutoff distance, which happens often when a
          small asymmetric unit is squeezed under pressure.
        </p>
      </>
    ),
  },
  {
    stage: "lattice",
    title: "The Bravais lattice",
    caption: <>A rectangular lattice: the box stretches and squeezes, but its corners stay square.</>,
    body: (
      <>
        <p>
          At constant pressure the box has to change shape, but not into just any shape. Depending on the group it must
          stay square, rectangular, hexagonal or oblique.
        </p>
        <p>
          A tensor <i>L</i> maps an unconstrained box onto the proper lattice, <span className="formula">B = L·B′</span>.
          Monte Carlo moves then sample the box at fixed fractional coordinates, so the crystal finds its own density and
          proportions without ever breaking its lattice type.
        </p>
      </>
    ),
  },
  {
    stage: "wyckoff",
    title: "Wyckoff positions",
    caption: <>Particles on mirror lines (dashed) slide along them, and have 4 images instead of 8.</>,
    body: (
      <>
        <p>
          Particles can also sit <em>on</em> a symmetry element: a mirror line or a rotation centre. There, several of
          their images coincide, so they have fewer distinct images. That number is the multiplicity in a Wyckoff label
          like <span className="wy">4<i>e</i></span>.
        </p>
        <p>
          Such a particle is held on its line or point by a constraint, a Lagrange multiplier applied as a RATTLE
          projection of its velocity. It can slide along the mirror, but never leave it.
        </p>
      </>
    ),
  },
  {
    stage: "release",
    title: "Is it stable?",
    caption: <>Symmetry released: every ghost is now a free particle. Does the crystal hold?</>,
    body: (
      <>
        <p>
          A symmetric crystal is only a candidate. To test it, release the symmetry: every ghost becomes a real particle,
          and ordinary unconstrained dynamics take over.
        </p>
        <p>
          In the paper&rsquo;s atlas of 258 Lennard-Jones crystals, <HM name="p1" />, <HM name="p2" />,{" "}
          <HM name="pg" />, <HM name="p3" />, <HM name="p6" /> and <HM name="cmm" /> gave hexagonal packing,{" "}
          <HM name="p4m" /> and <HM name="p3m1" /> gave unusual metastable structures, and <HM name="p6m" /> had no
          metastable structure at all.
        </p>
      </>
    ),
  },
];

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    // the activation line sits mid-screen, or below the pinned figure on narrow screens
    const narrow = window.matchMedia("(max-width: 52rem)").matches;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const i = Number((e.target as HTMLElement).dataset.index);
            setActive(i);
          }
        }
      },
      { rootMargin: narrow ? "-66% 0px -32% 0px" : "-48% 0px -48% 0px" },
    );
    stepRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  const step = STEPS[active];

  return (
    <section className="section how" id="how" aria-labelledby="how-title">
      <div className="wrap">
        <SectionHeader numeral="II" kicker="Methods" id="how-title" className="wide" title={<>Simulate only what is <em>unique</em></>}>
          <p>
            Symmetric molecular dynamics runs a crystal in a chosen plane group by integrating only its asymmetric unit
            and generating the rest. Six ideas make it work. Scroll through them.
          </p>
        </SectionHeader>
      </div>

      <div className="how__body">
        <div className="how__sticky">
          <figure className="how__figure">
            <div className="how__mat">
              <SimSlot
                variant="explainer"
                group={EXPLAINER_GROUP}
                occupancy={EXPLAINER_OCCUPANCY}
                seed={7}
                stage={step.stage}
                label={`Illustration for step ${active + 1}: ${step.title}`}
              />
            </div>
            <figcaption className="how__caption">
              <span className="how__fig">Fig. {active + 1}</span>
              <span key={active} className="how__caption-text">
                {step.caption}
              </span>
            </figcaption>
            <ol className="how__dots" aria-hidden="true">
              {STEPS.map((s, i) => (
                <li key={s.stage} data-active={i === active || undefined} data-done={i < active || undefined} />
              ))}
            </ol>
          </figure>
        </div>

        <ol className="how__steps">
          {STEPS.map((s, i) => (
            <li
              key={s.stage}
              ref={(el) => {
                stepRefs.current[i] = el;
              }}
              data-index={i}
              data-active={i === active || undefined}
              className="how__step"
            >
              <p className="how__num">{String(i + 1).padStart(2, "0")}</p>
              <h3 className="how__title">{s.title}</h3>
              <div className="how__text prose">{s.body}</div>
            </li>
          ))}
          <li className="how__note-wrap">
            <aside className="how__note" aria-label="A note on temperature">
              <p className="how__note-kicker">A note on temperature</p>
              <p className="how__formula">
                <i>T</i>
                <sub>apparent</sub> ≈ <i>T</i> / <span className="up">|</span>
                <i>G</i>
                <span className="up">|</span>
              </p>
              <p>
                Each independent particle drags <G />&thinsp;−&thinsp;1 symmetric copies with it, so its thermal
                kicks are shared across its whole orbit. A symmetric crystal at temperature <i>T</i> therefore
                fluctuates like an unconstrained one at about <i>T</i>/<G />: a <HM name="p6m" /> crystal looks as
                calm as a free one at a twelfth of the temperature.
              </p>
            </aside>
          </li>
        </ol>
      </div>
    </section>
  );
}
