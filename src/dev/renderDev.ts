import { SimHub } from "../sim/hub";
import { randomConfigs } from "../sim/random";
import { growProtocol } from "../engine/core/protocol";
import { occupancyLabel } from "../engine/core/system";
import { planeGroup } from "../engine/groups/library";
import { attachDrag, releaseSymmetry, pick, dragTo } from "../sim/interact";

const params = new URLSearchParams(location.search);
const seed = Number(params.get("seed") ?? 42);

async function main() {
  const hub = await SimHub.get();
  const heroSys = hub.engine.add({ group: planeGroup("p6m"), occupancy: { f: 3, e: 1, a: 1 }, density: 0.35, seed: 3 });
  heroSys.setProtocol(growProtocol());
  hub.attach(document.getElementById("hero") as HTMLCanvasElement, heroSys, { span: 34, colorMode: "op", showCell: false }, 200);

  const grid = document.getElementById("grid")!;
  const cards: { sys: ReturnType<typeof hub.engine.add>; label: HTMLDivElement }[] = [];
  for (const cfg of randomConfigs(8, seed)) {
    const card = document.createElement("div");
    card.className = "card";
    const canvas = document.createElement("canvas");
    const label = document.createElement("div");
    card.append(canvas, label);
    grid.append(card);
    const sys = hub.engine.add({ group: cfg.group, occupancy: cfg.occupancy, density: 0.35, seed: cfg.seed });
    sys.setProtocol(growProtocol());
    sys.label = `${cfg.group.name}  ${occupancyLabel(cfg.group, cfg.occupancy)}`;
    const hv = hub.attach(canvas, sys, { span: 14, colorMode: "rep", showCell: true, markReps: true }, 200);
    attachDrag(hub.engine, hv.view);
    cards.push({ sys, label, hv } as never);
  }
  const status = document.getElementById("status")!;
  // test hooks
  (window as any).testRelease = async (i: number) => {
    const c = (cards as any)[i];
    const rel = await releaseSymmetry(hub.engine, c.sys);
    c.sys.dispose();
    c.sys = rel;
    rel.label = c.sys.label + " (released)";
    c.hv.view.setSystem(rel);
    return { n: rel.data.n };
  };
  (window as any).testDrag = async (i: number) => {
    const c = (cards as any)[i];
    const g = await pick(hub.engine, c.sys, [0.0, 0.0], 3);
    if (!g) return null;
    c.hv.view.setOptions({ highlightRep: g.rep });
    dragTo(c.sys, g, [3, 2], c.hv.view.B);
    return g;
  };
  hub.onFrame((frame) => {
    if (frame % 10) return;
    for (const { sys, label } of cards) {
      const st = sys.stats;
      label.textContent = `${sys.label} · ${sys.runner?.current.name} · ρ=${st?.rho.toFixed(2)} u=${st?.pe.toFixed(2)} T=${st?.T.toFixed(2)}`;
    }
    status.textContent = `frame ${frame} hero step ${heroSys.step} ${heroSys.runner?.current.name}`;
  });
}
main().catch((e) => (document.getElementById("status")!.textContent = "ERROR " + (e?.stack ?? e)));
