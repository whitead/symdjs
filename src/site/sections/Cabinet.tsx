// I. The cabinet: eight random (group, Wyckoff occupancy) crystals growing live.

import { useMemo, useState } from "react";
import { Button } from "../components/Button";
import { ShuffleIcon } from "../components/Icons";
import { SectionHeader } from "../components/SectionHeader";
import { SpecimenCard } from "../components/SpecimenCard";
import { randomCabinet } from "../lib/groups";
import "../styles/sections/cabinet.css";

export function Cabinet() {
  const [seed, setSeed] = useState(() => 1 + ((Math.random() * 1e5) | 0));
  const [shuffles, setShuffles] = useState(0);
  const specimens = useMemo(() => randomCabinet(seed), [seed]);

  return (
    <section className="section cabinet wrap" id="cabinet" aria-labelledby="cabinet-title">
      <SectionHeader
        numeral="I"
        kicker="The cabinet"
        className="wide"
        id="cabinet-title"
        title={
          <>
            Eight <em>random</em> crystals
          </>
        }
        action={
          <Button variant="secondary" icon={<ShuffleIcon />} onClick={() => {
              setSeed((s) => s + 1);
              setShuffles((n) => n + 1);
            }}>
            Shuffle
          </Button>
        }
      >
        <p>
          Each drawer holds a plane group and a random choice of Wyckoff sites to fill. The particles start as a
          gas, are squeezed and slowly cooled, and settle into a crystal that obeys its group exactly, at every step.
        </p>
      </SectionHeader>
      <p className="visually-hidden" aria-live="polite">
        {shuffles > 0 ? `Shuffled: ${specimens.map((s) => s.group.name).join(", ")}` : ""}
      </p>
      <ol className="cabinet__grid wide">
        {specimens.map((s, i) => (
          <SpecimenCard key={`${seed}-${i}`} index={i} group={s.group} occupancy={s.occupancy} seed={s.seed} />
        ))}
      </ol>
      <p className="cabinet__legend">
        <span>
          <span className="cabinet__swatch" data-phase="compressing" /> compressing
        </span>
        <span>
          <span className="cabinet__swatch" data-phase="annealing" /> annealing
        </span>
        <span>
          <span className="cabinet__swatch" data-phase="crystal" /> crystal
        </span>
        <span className="cabinet__legend-note">
          A label like <span className="cabinet__wy">4<i>e</i></span> names Wyckoff site <i>e</i>, with 4 images per cell
        </span>
      </p>
    </section>
  );
}
