// Run the crystal-growth protocol on the CPU engine and write SVG snapshots.
// Usage: npx tsx scripts/grow.ts <group> '<occupancy json>' [outdir] [speed]

import { mkdirSync, writeFileSync } from "node:fs";
import { planeGroup } from "../src/engine/groups/library";
import { CpuSim } from "../src/engine/cpu/engine";
import { growProtocol, ProtocolRunner } from "../src/engine/core/protocol";
import { occupancyLabel } from "../src/engine/core/system";

const palette = ["#f94144", "#f3722c", "#f8961e", "#f9844a", "#f9c74f", "#90be6d", "#43aa8b", "#4d908e", "#577590", "#277da1"];

const [name = "p4m", occJson = '{"g":2,"e":1}', outdir = "/tmp/symdjs-grow", speedArg = "1", seedArg = "1"] = process.argv.slice(2);
const group = planeGroup(name);
const occupancy = JSON.parse(occJson) as Record<string, number>;
const sim = new CpuSim({ group, occupancy, density: 0.35, seed: Number(seedArg) });
const runner = new ProtocolRunner(growProtocol({ speed: Number(speedArg) }), sim.data.nCell / sim.data.n);
mkdirSync(outdir, { recursive: true });

function svg(title: string): string {
  const { D, nCell, imageRep } = sim.data;
  const q = sim.cellCartesian();
  const B = sim.box.B;
  const view = 16;
  const parts: string[] = [];
  const reps = 8;
  for (let a = -reps; a <= reps; a++)
    for (let b = -reps; b <= reps; b++)
      for (let e = 0; e < nCell; e++) {
        const x = q[e * D] + B[0] * a + B[1] * b;
        const y = q[e * D + 1] + B[2] * a + B[3] * b;
        if (Math.abs(x) > view || Math.abs(y) > view) continue;
        parts.push(`<circle cx="${x.toFixed(3)}" cy="${(-y).toFixed(3)}" r="0.48" fill="${palette[imageRep[e] % palette.length]}"/>`);
      }
  const cell = [
    [0, 0],
    [B[0], B[2]],
    [B[0] + B[1], B[2] + B[3]],
    [B[1], B[3]],
  ]
    .map((p) => `${p[0].toFixed(3)},${(-p[1]).toFixed(3)}`)
    .join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-view} ${-view} ${2 * view} ${2 * view}" width="600" height="600" style="background:#f5f4e9">
${parts.join("\n")}
<polygon points="${cell}" fill="none" stroke="#1f2430" stroke-width="0.06"/>
<text x="${-view + 0.5}" y="${-view + 1.2}" font-size="1" font-family="monospace" fill="#1f2430">${title}</text>
</svg>`;
}

const t0 = Date.now();
let frame = 0;
const chunk = 200;
while (runner.stage < runner.protocol.stages.length - 1 || runner.stepInStage < runner.current.steps) {
  sim.setParams(runner.params(chunk));
  sim.step(chunk);
  const changed = runner.advance(chunk);
  if (changed || runner.stepInStage % 4000 === 0) {
    const st = sim.stats();
    console.log(
      `${runner.current.name.padEnd(12)} step ${st.step} T=${st.T.toFixed(3)} (T*=${(st.T / runner.phi).toFixed(3)}) pe=${st.pe.toFixed(3)} rho=${st.rho.toFixed(3)} acc=${st.accept.toFixed(2)}`,
    );
  }
  if (changed) writeFileSync(`${outdir}/${name}-${String(frame++).padStart(2, "0")}.svg`, svg(`${name} ${occupancyLabel(group, occupancy)} ${runner.current.name}`));
}
const st = sim.stats();
writeFileSync(`${outdir}/${name}-final.svg`, svg(`${name} ${occupancyLabel(group, occupancy)} ρ=${st.rho.toFixed(3)} pe=${st.pe.toFixed(3)}`));
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${st.step} steps, rho=${st.rho.toFixed(3)} pe=${st.pe.toFixed(3)} n=${sim.data.n} nCell=${sim.data.nCell}`);
