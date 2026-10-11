import { SimHub } from "../sim/hub";
import { randomConfigs } from "../sim/random";
import { liveProtocol } from "../engine/core/protocol";
import { occupancyLabel } from "../engine/core/system";
import { planeGroup } from "../engine/groups/library";
import { attachProbe, releaseSymmetry } from "../sim/interact";

const params = new URLSearchParams(location.search);
const seed = Number(params.get("seed") ?? 42);
const density = Number(params.get("rho") ?? 0.3);
const Tstar = Number(params.get("T") ?? 0.3);
const gamma = Number(params.get("gamma") ?? 0.1);
const span = Number(params.get("span") ?? 14);

async function main() {
  const hub = await SimHub.get();
  const heroSys = hub.engine.add({ group: planeGroup("p6m"), occupancy: { f: 3, e: 1, a: 1 }, density, seed: 3 });
  heroSys.setProtocol(liveProtocol({ Tstar, gamma }));
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
    const sys = hub.engine.add({ group: cfg.group, occupancy: cfg.occupancy, density, seed: cfg.seed });
    sys.setProtocol(liveProtocol({ Tstar, gamma }));
    sys.label = `${cfg.group.name}  ${occupancyLabel(cfg.group, cfg.occupancy)}`;
    const hv = hub.attach(canvas, sys, { span, colorMode: "rep", showCell: true, markReps: false }, 200);
    attachProbe(hv.view);
    cards.push({ sys, label, hv } as never);
  }
  const status = document.getElementById("status")!;
  // motion probe: mean displacement (σ) of reps over 400 ms, per system
  (window as any).motion = async () => {
    const systems = [heroSys, ...cards.map((c) => (c as any).sys)];
    const a = await Promise.all(systems.map((sy) => hub.engine.downloadState(sy)));
    await new Promise((r) => setTimeout(r, 400));
    const b = await Promise.all(systems.map((sy) => hub.engine.downloadState(sy)));
    return systems.map((sy, k) => {
      const B = b[k].B;
      let sum = 0;
      for (let i = 0; i < sy.data.n; i++) {
        let dx = b[k].s[2 * i] - a[k].s[2 * i];
        let dy = b[k].s[2 * i + 1] - a[k].s[2 * i + 1];
        dx -= Math.round(dx);
        dy -= Math.round(dy);
        sum += Math.hypot(B[0] * dx + B[1] * dy, B[2] * dx + B[3] * dy);
      }
      return +(sum / sy.data.n).toFixed(2);
    });
  };

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
