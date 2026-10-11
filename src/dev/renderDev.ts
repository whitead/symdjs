import { SimHub } from "../sim/hub";
import { randomConfigs } from "../sim/random";
import { growProtocol } from "../engine/core/protocol";
import { occupancyLabel } from "../engine/core/system";
import { planeGroup } from "../engine/groups/library";

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
    hub.attach(canvas, sys, { span: 14, colorMode: "rep", showCell: true, markReps: true }, 200);
    cards.push({ sys, label });
  }
  const status = document.getElementById("status")!;
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
