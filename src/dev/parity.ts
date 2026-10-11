// Runs identical systems on the CPU reference engine and the WebGPU engine
// and reports trajectory differences. Driven by tests/e2e/gpu.spec.ts.

import { CpuSim } from "../engine/cpu/engine";
import { GpuEngine } from "../engine/gpu/engine";
import { planeGroup } from "../engine/groups/library";
import type { SimParams, SystemState } from "../engine/core/system";

const out = document.getElementById("out")!;
const clone = (s: SystemState): SystemState => ({ u: s.u.slice(), v: s.v.slice(), p: s.p.slice(), step: s.step });

interface Case {
  name: string;
  occ: Record<string, number>;
  steps: number;
  params: Partial<SimParams>;
}

const LJ = { kind: "lj" as const, epsilon: 1, sigma: 1, rc: 2.5 };
const cases: Case[] = [
  { name: "p1", occ: { a: 6 }, steps: 1, params: { gamma: 0 } },
  { name: "p4m", occ: { g: 3, e: 1, a: 1 }, steps: 10, params: { gamma: 0 } },
  { name: "p6m", occ: { f: 2, e: 1, d: 1, b: 1 }, steps: 10, params: { gamma: 1, T: 2 } },
  { name: "cmm", occ: { f: 3, d: 1, c: 1 }, steps: 50, params: { gamma: 1, T: 1 } },
  { name: "pgg", occ: { c: 5 }, steps: 100, params: { gamma: 0.5, T: 0.5 } },
  { name: "p31m", occ: { d: 3, c: 1 }, steps: 40, params: { gamma: 1, T: 1, P: 1, nptEvery: 2 } },
  { name: "p2", occ: { e: 4, a: 1 }, steps: 40, params: { gamma: 1, T: 0.5, P: 1, nptEvery: 2 } },
  { name: "p6", occ: { d: 3, c: 1 }, steps: 120, params: { gamma: 1, T: 0.5, P: 2, nptEvery: 1 } },
];

async function main() {
  const engine = await GpuEngine.create();
  const results: Record<string, unknown>[] = [];
  for (const c of cases) {
    const group = planeGroup(c.name);
    const cpu = new CpuSim({
      group,
      occupancy: c.occ,
      density: 0.45,
      seed: 17,
      params: { potential: { kind: "soft", epsilon: 30, sigma: 1, rc: 1.1 }, gamma: 5, T: 0.5 },
    });
    cpu.step(800);
    cpu.setParams({ potential: LJ, forceCap: Infinity, mcAdapt: true, dt: 0.003, ...c.params });
    cpu.step(200); // LJ equilibration so both start from a sane configuration
    // the GPU slot starts with fresh MC step-size state; match it
    cpu.mc = { delta: 0.004, attempts: 0, accepts: 0, winAtt: 0, winAcc: 0, rate: 0 };
    const start = clone(cpu.state);
    const gsys = engine.add({ group, occupancy: c.occ, density: 0.45, seed: 17, params: cpu.params }, start);
    const t0 = performance.now();
    engine.step([{ sys: gsys, steps: c.steps }]);
    cpu.step(c.steps);
    const g = await engine.downloadState(gsys);
    const ms = performance.now() - t0;
    const D = 2;
    let ds = 0;
    let dv = 0;
    let vmax = 0;
    for (let i = 0; i < cpu.data.n * D; i++) {
      let d = g.s[i] - cpu.s[i];
      d -= Math.round(d);
      ds = Math.max(ds, Math.abs(d));
      dv = Math.max(dv, Math.abs(g.state.v[i] - cpu.state.v[i]));
      vmax = Math.max(vmax, Math.abs(cpu.state.v[i]));
    }
    let dp = 0;
    for (let i = 0; i < cpu.state.p.length; i++) dp = Math.max(dp, Math.abs(g.state.p[i] - cpu.state.p[i]) / Math.abs(cpu.state.p[i] || 1));
    results.push({ name: c.name, steps: c.steps, n: cpu.data.n, nCell: cpu.data.nCell, ds, dv, vmax, dp, ms: +ms.toFixed(1) });
    gsys.dispose();
  }

  // throughput: many systems at once
  const bench: Record<string, unknown>[] = [];
  for (const nsys of [1, 8, 24]) {
    const systems = [];
    for (let k = 0; k < nsys; k++) {
      const group = planeGroup(["p4m", "p6m", "pgg", "cmm", "p31m", "p2"][k % 6]);
      const occ: Record<string, number> = { [group.sites[group.sites.length - 1].letter]: 4 };
      systems.push(engine.add({ group, occupancy: occ, density: 0.6, seed: k, params: { potential: LJ, T: 1, gamma: 1, P: 1, nptEvery: 4 } }));
    }
    const steps = 200;
    engine.step(systems.map((sys) => ({ sys, steps: 10 })));
    await engine.device.queue.onSubmittedWorkDone();
    const t0 = performance.now();
    const reps = 10;
    for (let r = 0; r < reps; r++) engine.step(systems.map((sys) => ({ sys, steps })));
    await engine.device.queue.onSubmittedWorkDone();
    const ms = (performance.now() - t0) / reps;
    bench.push({ systems: nsys, stepsPerDispatch: steps, msPerDispatch: +ms.toFixed(2), stepsPerSecPerSystem: Math.round((steps / ms) * 1000) });
    systems.forEach((s) => s.dispose());
  }
  out.textContent = "DONE " + JSON.stringify({ results, bench });
}

const post = () => {
  if (new URLSearchParams(location.search).has("post"))
    fetch("http://localhost:5199/log", { method: "POST", body: out.textContent ?? "" }).catch(() => {});
};
main()
  .catch((e) => (out.textContent = "ERROR " + (e?.stack ?? e)))
  .finally(post);
