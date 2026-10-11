// One atlas plate: caption bar, live simulation with readouts, title and
// notes, the symmetry-diagram slot, and the controls panel.

import { useCallback, useMemo, useState } from "react";
import type { Group } from "../../engine/groups/group";
import { GROUP_NOTES, cellCount, defaultOccupancy, occupancyLabel, type Occupancy } from "../lib/groups";
import { plateDefaults } from "../content/defaults";
import { DEFAULT_PARAMS, type Potential, type SimParams, type SimStats } from "../sim/types";
import { Button } from "./Button";
import { DiagramSlot } from "./DiagramSlot";
import { HM, Orbifold } from "./GroupSymbol";
import { FlameIcon, LockIcon, RegrowIcon, SnowIcon, UnlockIcon } from "./Icons";
import { PlateCaption } from "./PlateCaption";
import { Readout, ReadoutRow } from "./Readout";
import { SegmentedControl } from "./SegmentedControl";
import { SimSlot } from "./SimSlot";
import { Slider } from "./Slider";
import { WyckoffEditor } from "./WyckoffEditor";
import "../styles/components/plate.css";

export interface PlateProps {
  group: Group;
  /** mirror the layout (simulation on the right) for rhythm down the page */
  flip?: boolean;
}

const HISTORY = 48;

const PHASE_TEXT: Record<SimStats["phase"], string> = {
  compressing: "compressing…",
  annealing: "annealing…",
  crystal: "crystal",
  released: "symmetry released",
};

type History = Record<"density" | "energy" | "temperature" | "pressure", number[]>;

const POTENTIALS: { value: Potential; label: string; title: string }[] = [
  { value: "lj", label: "LJ", title: "Lennard-Jones, truncated and shifted" },
  { value: "wca", label: "WCA", title: "Weeks–Chandler–Andersen: purely repulsive" },
  { value: "soft", label: "soft", title: "Soft cosine, for removing overlaps" },
];

export function Plate({ group, flip }: PlateProps) {
  const [occupancy, setOccupancy] = useState<Occupancy>(() => ({ ...(plateDefaults[group.name] ?? defaultOccupancy(group)) }));
  const [params, setParams] = useState<SimParams>(DEFAULT_PARAMS);
  const [latest, setLatest] = useState<SimStats | null>(null);
  const [history, setHistory] = useState<History>({ density: [], energy: [], temperature: [], pressure: [] });

  const onStats = useCallback((s: SimStats) => {
    setLatest(s);
    setHistory((h) => ({
      density: [...h.density, s.density].slice(-HISTORY),
      energy: [...h.energy, s.energy].slice(-HISTORY),
      temperature: [...h.temperature, s.temperature].slice(-HISTORY),
      pressure: [...h.pressure, s.pressure].slice(-HISTORY),
    }));
  }, []);

  const set = <K extends keyof SimParams>(k: K, v: SimParams[K]) => setParams((p) => ({ ...p, [k]: v }));
  const regrow = () => setParams((p) => ({ ...p, released: false, regrow: p.regrow + 1 }));

  const note = GROUP_NOTES[group.name];
  const occLabel = useMemo(() => occupancyLabel(group, occupancy), [group, occupancy]);
  const titleId = `plate-${group.name}-title`;

  return (
    <article className="plate" id={`plate-${group.name}`} data-flip={flip || undefined} aria-labelledby={titleId}>
      <header className="plate__bar">
        <PlateCaption group={group} />
        <span className="plate__count">
          {group.number} / 17
        </span>
      </header>

      <div className="plate__body">
        <div className="plate__figure">
          <div className="plate__mat">
            <SimSlot
              variant="plate"
              group={group.name}
              occupancy={occupancy}
              seed={group.number * 101}
              params={params}
              onStats={onStats}
              label={`Live ${group.name} crystal, Wyckoff occupancy ${occLabel}. Drag a particle to move all its images.`}
            >
              {latest && (
                <span className="plate__phase" data-phase={latest.phase} aria-hidden="true">
                  <span className="plate__phase-dot" />
                  {PHASE_TEXT[latest.phase]}
                </span>
              )}
            </SimSlot>
          </div>
          <ReadoutRow className="plate__readouts">
            <Readout label="Density" symbol="ρ" value={latest?.density ?? null} history={history.density} digits={3} />
            <Readout
              label="Energy"
              symbol={
                <>
                  E<span className="sub">/N</span>
                </>
              }
              value={latest?.energy ?? null}
              history={history.energy}
              digits={4}
            />
            <Readout label="Temperature" symbol="T*" value={latest?.temperature ?? null} history={history.temperature} />
            <Readout label="Pressure" symbol="P" value={latest?.pressure ?? null} history={history.pressure} />
          </ReadoutRow>
        </div>

        <div className="plate__side">
          <div className="plate__heading">
            <h3 className="plate__title" id={titleId}>
              <HM name={group.name} />
            </h3>
            <div className="plate__meta">
              <Orbifold symbol={group.orbifold} className="plate__orbifold" />
              <span className="plate__lattice">{group.lattice.toLowerCase()}</span>
            </div>
          </div>
          <p className="plate__blurb">{note?.blurb}</p>
          {note?.field && (
            <p className="plate__field">
              <span className="plate__field-label">Field note</span>
              {note.field}
            </p>
          )}

          <div className="plate__diagram-row">
            <DiagramSlot group={group} className="plate__diagram" />
            <dl className="plate__facts">
              <div>
                <dt>Order</dt>
                <dd>
                  |<i>G</i>| = {group.order}
                </dd>
              </div>
              <div>
                <dt>Asymmetric unit</dt>
                <dd>1/{group.order} of the cell</dd>
              </div>
              <div>
                <dt>Wyckoff sites</dt>
                <dd>
                  {group.sites.length} ({group.sites.filter((s) => !s.general).length} special)
                </dd>
              </div>
              <div>
                <dt>Per cell</dt>
                <dd>{cellCount(group, occupancy)} particles</dd>
              </div>
            </dl>
          </div>

          <div className="plate__controls">
            <fieldset className="plate__fieldset">
              <legend>Wyckoff occupancy</legend>
              <WyckoffEditor group={group} value={occupancy} onChange={setOccupancy} />
            </fieldset>

            <div className="plate__sliders">
              <Slider
                label="Temperature"
                symbol="T*"
                value={params.temperature}
                min={0.02}
                max={2}
                step={0.01}
                onChange={(v) => set("temperature", v)}
              />
              <Slider
                label="Pressure"
                symbol="P*"
                value={params.pressure}
                min={0.2}
                max={10}
                step={0.1}
                format={(v) => v.toFixed(1)}
                onChange={(v) => set("pressure", v)}
              />
            </div>

            <SegmentedControl
              label="Potential"
              options={POTENTIALS}
              value={params.potential}
              onChange={(v) => set("potential", v)}
            />

            <div className="plate__actions">
              <Button variant="primary" icon={<RegrowIcon />} onClick={regrow}>
                Regrow
              </Button>
              <Button icon={<FlameIcon />} onClick={() => set("temperature", 1.6)}>
                Melt
              </Button>
              <Button icon={<SnowIcon />} onClick={() => set("temperature", 0.05)}>
                Quench
              </Button>
            </div>

            <div className="plate__release-row">
              <p className="plate__release-text">
                <b>Stability test.</b> Free every ghost and run without symmetry.
              </p>
              <Button
                tone="alarm"
                icon={params.released ? <UnlockIcon /> : <LockIcon />}
                pressed={params.released}
                onClick={() => set("released", !params.released)}
              >
                {params.released ? "Symmetry released" : "Release symmetry"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
