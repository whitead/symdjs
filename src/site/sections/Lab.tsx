// IV. The lab: any of the 17 plane groups with any Wyckoff occupancy, or a
// group of your own written as generators in xyz notation. Everything runs
// on the same engine as the atlas; the unit cell can be exported.

import { useCallback, useMemo, useState } from "react";
import { buildCustomGroup, formatOp } from "../../engine/groups/custom";
import type { Group } from "../../engine/groups/group";
import { Button } from "../components/Button";
import { HM } from "../components/GroupSymbol";
import { FlameIcon, LockIcon, RegrowIcon, SnowIcon, UnlockIcon } from "../components/Icons";
import { Readout, ReadoutRow } from "../components/Readout";
import { SectionHeader } from "../components/SectionHeader";
import { SegmentedControl } from "../components/SegmentedControl";
import { SimSlot } from "../components/SimSlot";
import { Slider } from "../components/Slider";
import { WyckoffEditor } from "../components/WyckoffEditor";
import { plateDefaults } from "../content/defaults";
import { LATTICE_FAMILIES, cellCount, occupancyLabel, planeGroup, type Occupancy } from "../lib/groups";
import { DEFAULT_PARAMS, type CellExport, type Potential, type SimApi, type SimParams, type SimStats } from "../sim/types";
import "../styles/sections/lab.css";

const PRESETS: { name: string; gens: string }[] = [
  { name: "quarter turn + centring", gens: "-y,x\nx+1/2,y+1/2" },
  { name: "threefold + mirror", gens: "-y,x-y\ny,x" },
  { name: "sixfold", gens: "x-y,x" },
  { name: "inversion + glide", gens: "-x,-y\nx+1/2,-y+1/2" },
  { name: "two glides", gens: "-x+1/2,y+1/2\nx+1/2,-y" },
  { name: "half turn + centring", gens: "-x,-y\nx+1/2,y+1/2" },
];

const POTENTIALS: { value: Potential; label: string; title: string }[] = [
  { value: "lj", label: "LJ", title: "Lennard-Jones, truncated and shifted" },
  { value: "wca", label: "WCA", title: "Weeks–Chandler–Andersen: purely repulsive" },
  { value: "soft", label: "soft", title: "Soft cosine" },
];

type ColorMode = "rep" | "op" | "site";
const COLORS: { value: ColorMode; label: string; title: string }[] = [
  { value: "op", label: "operation", title: "Colour each copy by the symmetry operation that made it" },
  { value: "rep", label: "particle", title: "Colour by independent particle (the motif repeats)" },
  { value: "site", label: "site", title: "Colour by Wyckoff site" },
];

const HISTORY = 48;

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toXyz(c: CellExport): string {
  const B = c.B;
  const lines = [
    String(c.cartesian.length),
    `Lattice="${B[0]} ${B[2]} 0 ${B[1]} ${B[3]} 0 0 0 1" Properties=species:S:1:pos:R:3 group=${c.group}`,
    ...c.cartesian.map((p) => `X ${p[0].toFixed(6)} ${p[1].toFixed(6)} 0`),
  ];
  return lines.join("\n") + "\n";
}

export function Lab() {
  const [source, setSource] = useState<"table" | "custom">("table");
  const [groupName, setGroupName] = useState("p4g");
  const [occupancy, setOccupancy] = useState<Occupancy>(() => ({ ...plateDefaults.p4g }));
  const [genText, setGenText] = useState(PRESETS[0].gens);
  const [nCustom, setNCustom] = useState(4);
  const [params, setParams] = useState<SimParams>(DEFAULT_PARAMS);
  const [colorMode, setColorMode] = useState<ColorMode>("op");
  const [scale, setScale] = useState(24);
  const [api, setApi] = useState<SimApi | null>(null);
  const [latest, setLatest] = useState<SimStats | null>(null);
  const [history, setHistory] = useState<{ density: number[]; energy: number[]; temperature: number[] }>({
    density: [],
    energy: [],
    temperature: [],
  });

  const custom = useMemo(() => buildCustomGroup(genText.split("\n")), [genText]);
  const group: Group | undefined = source === "table" ? planeGroup(groupName) : custom.group;
  const nCustomMax = custom.group ? Math.max(2, Math.floor(96 / custom.group.order)) : 2;
  const nCustomEff = Math.min(nCustom, nCustomMax);
  const occ = useMemo<Occupancy>(() => (source === "table" ? occupancy : { a: nCustomEff }), [source, occupancy, nCustomEff]);

  const onStats = useCallback((s: SimStats) => {
    setLatest(s);
    setHistory((h) => ({
      density: [...h.density, s.density].slice(-HISTORY),
      energy: [...h.energy, s.energy].slice(-HISTORY),
      temperature: [...h.temperature, s.temperature].slice(-HISTORY),
    }));
  }, []);

  const pickGroup = (name: string) => {
    setSource("table");
    setGroupName(name);
    setOccupancy({ ...(plateDefaults[name] ?? { a: 4 }) });
    setParams((p) => ({ ...p, released: false }));
  };
  const set = <K extends keyof SimParams>(k: K, v: SimParams[K]) => setParams((p) => ({ ...p, [k]: v }));
  const regrow = () => setParams((p) => ({ ...p, released: false, regrow: p.regrow + 1 }));

  const exportAs = async (kind: "json" | "xyz") => {
    if (!api) return;
    const cell = await api.exportCell();
    const name = `symd-${cell.group}${cell.released ? "-released" : ""}`;
    if (kind === "json") download(`${name}.json`, JSON.stringify({ ...cell, occupancy: occ, generators: source === "custom" ? genText.split("\n").filter(Boolean) : undefined }, null, 1), "application/json");
    else download(`${name}.xyz`, toXyz(cell), "chemical/x-xyz");
  };

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
          Choose a plane group and fill its Wyckoff sites, or write a group of your own as generators in xyz
          notation. The lab closes them into a group modulo the lattice, finds the most general Bravais lattice they
          preserve, and grows a crystal. Drag particles, release the symmetry, and export the unit cell.
        </p>
      </SectionHeader>

      <div className="lab__bench wide">
        <div className="lab__stage">
          {group ? (
            <SimSlot
              variant="plate"
              group={source === "table" ? groupName : "custom"}
              groupObj={source === "custom" ? group : undefined}
              occupancy={occ}
              seed={4242}
              params={params}
              onStats={onStats}
              onApi={setApi}
              display={{ colorMode, scale, showAsym: source === "table", markReps: true, showGrid: true }}
              label={`Lab simulation in ${source === "table" ? groupName : "a custom group"}`}
            />
          ) : (
            <p className="lab__empty">{custom.error}</p>
          )}
          <ReadoutRow className="lab__readouts">
            <Readout label="Density" symbol="ρ" value={latest?.density ?? null} history={history.density} digits={3} />
            <Readout label="Energy" symbol={<>E<span className="sub">/N</span></>} value={latest?.energy ?? null} history={history.energy} digits={3} />
            <Readout label="Temperature" symbol="T*" value={latest?.temperature ?? null} history={history.temperature} />
          </ReadoutRow>
        </div>

        <div className="lab__panel">
          <div className="lab__block">
            <p className="lab__label">Group</p>
            <div className="lab__picker" role="group" aria-label="Plane group">
              {LATTICE_FAMILIES.map((fam) => (
                <div key={fam.name} className="lab__family">
                  <span className="lab__family-name">{fam.name.toLowerCase()}</span>
                  {fam.groups.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className="lab__chip"
                      aria-pressed={source === "table" && groupName === name}
                      onClick={() => pickGroup(name)}
                    >
                      <HM name={name} />
                    </button>
                  ))}
                </div>
              ))}
              <div className="lab__family">
                <span className="lab__family-name">yours</span>
                <button
                  type="button"
                  className="lab__chip lab__chip--custom"
                  aria-pressed={source === "custom"}
                  onClick={() => {
                    setSource("custom");
                    setParams((p) => ({ ...p, released: false }));
                  }}
                >
                  generators…
                </button>
              </div>
            </div>
          </div>

          {source === "table" && group ? (
            <div className="lab__block">
              <p className="lab__label">
                Wyckoff occupancy · {occupancyLabel(group, occupancy)} · {cellCount(group, occupancy)} per cell
              </p>
              <WyckoffEditor group={group} value={occupancy} onChange={setOccupancy} summary={false} />
            </div>
          ) : (
            <div className="lab__block">
              <label className="lab__label" htmlFor="lab-gens">
                Generators · one operation per line, xyz notation
              </label>
              <textarea
                id="lab-gens"
                className="lab__gens"
                value={genText}
                spellCheck={false}
                rows={3}
                onChange={(e) => setGenText(e.target.value)}
              />
              <div className="lab__presets">
                {PRESETS.map((p) => (
                  <button key={p.name} type="button" className="lab__preset" onClick={() => setGenText(p.gens)}>
                    {p.name}
                  </button>
                ))}
              </div>
              {custom.group ? (
                <>
                  <p className="lab__status" data-ok>
                    |<i>G</i>| = {custom.group.order} · {custom.group.lattice.toLowerCase()} lattice
                  </p>
                  {custom.note && <p className="lab__note">{custom.note}</p>}
                  <ol className="lab__ops">
                    {custom.group.ops.map((op, i) => (
                      <li key={i}>
                        <span className="lab__op-num">{i + 1}</span>
                        <code>{formatOp(op).replace(/-/g, "−").replace(/,/g, ", ")}</code>
                      </li>
                    ))}
                  </ol>
                  <Slider label="Independent particles" symbol="n" value={nCustomEff} min={1} max={nCustomMax} step={1} format={(v) => String(v)} onChange={setNCustom} />
                </>
              ) : (
                <p className="lab__status" role="alert">
                  {custom.error}
                </p>
              )}
            </div>
          )}

          <div className="lab__sliders">
            <Slider label="Temperature" symbol="T*" value={params.temperature} min={0.02} max={2} step={0.01} onChange={(v) => set("temperature", v)} />
            <Slider label="Pressure" symbol="P*" value={params.pressure} min={0.2} max={10} step={0.1} format={(v) => v.toFixed(1)} onChange={(v) => set("pressure", v)} />
            <Slider label="Zoom" symbol="px/σ" value={scale} min={8} max={60} step={1} format={(v) => String(v)} onChange={setScale} />
          </div>

          <SegmentedControl label="Potential" options={POTENTIALS} value={params.potential} onChange={(v) => set("potential", v)} />
          <SegmentedControl label="Colour by" options={COLORS} value={colorMode} onChange={setColorMode} />

          <div className="lab__actions">
            <Button variant="primary" icon={<RegrowIcon />} onClick={regrow}>
              Regrow
            </Button>
            <Button icon={<FlameIcon />} onClick={() => set("temperature", 1.6)}>
              Melt
            </Button>
            <Button icon={<SnowIcon />} onClick={() => set("temperature", 0.05)}>
              Quench
            </Button>
            <Button tone="alarm" icon={params.released ? <UnlockIcon /> : <LockIcon />} pressed={params.released} onClick={() => set("released", !params.released)}>
              {params.released ? "Released" : "Release"}
            </Button>
          </div>

          <div className="lab__export">
            <p className="lab__label">Export the unit cell</p>
            <div className="lab__actions">
              <Button size="s" variant="secondary" disabled={!api} onClick={() => exportAs("json")}>
                JSON
              </Button>
              <Button size="s" variant="secondary" disabled={!api} onClick={() => exportAs("xyz")}>
                extended XYZ
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
