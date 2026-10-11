// Cross-browser WebGPU diagnostics: compile every shader with error scopes,
// run one dispatch and one render, and POST the results to a log server.

import { simShaderSource } from "../engine/gpu/wgsl";
import { discShader, lineShader } from "../engine/render/shaders";
import { GpuEngine } from "../engine/gpu/engine";
import { Renderer, SimView } from "../engine/render/renderer";
import { planeGroup } from "../engine/groups/library";

const out = document.getElementById("out")!;
const lines: string[] = [];
const log = (s: string) => {
  lines.push(s);
  out.textContent = lines.join("\n");
};
const send = () => fetch("http://localhost:5199/log", { method: "POST", body: lines.join("\n") }).catch(() => {});

async function main() {
  log(`UA ${navigator.userAgent}`);
  if (!navigator.gpu) return log("NO navigator.gpu");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return log("NO adapter");
  log(`features ${[...adapter.features].join(",")}`);
  log(`limits wgStorage=${adapter.limits.maxComputeWorkgroupStorageSize} storageBuffers/stage=${adapter.limits.maxStorageBuffersPerShaderStage} invocations=${adapter.limits.maxComputeInvocationsPerWorkgroup}`);
  const device = await adapter.requestDevice();
  device.addEventListener("uncapturederror", (e) => log(`UNCAPTURED ${(e as GPUUncapturedErrorEvent).error.message}`));
  for (const [name, code] of [["sim", simShaderSource(2)], ["disc", discShader()], ["line", lineShader()]] as const) {
    device.pushErrorScope("validation");
    const m = device.createShaderModule({ code, label: name });
    const info = await m.getCompilationInfo();
    for (const msg of info.messages) log(`${name} ${msg.type} ${msg.lineNum}:${msg.linePos} ${msg.message}`);
    const err = await device.popErrorScope();
    log(`${name} module: ${err ? "ERROR " + err.message : "ok"}`);
  }
  // full engine path
  device.destroy();
  const engine = await GpuEngine.create();
  engine.device.addEventListener("uncapturederror", (e) => log(`ENGINE UNCAPTURED ${(e as GPUUncapturedErrorEvent).error.message}`));
  engine.device.pushErrorScope("validation");
  const sys = engine.add({ group: planeGroup("p4m"), occupancy: { g: 2, e: 1, a: 1 }, density: 0.4, seed: 1 });
  engine.step([{ sys, steps: 50 }]);
  const e1 = await engine.device.popErrorScope();
  log(`dispatch: ${e1 ? "ERROR " + e1.message : "ok"}`);
  const st = await engine.downloadState(sys);
  log(`state s[0..3]=${Array.from(st.s.slice(0, 4)).map((v) => v.toFixed(3))} B=${Array.from(st.B).map((v) => v.toFixed(2))}`);
  engine.device.pushErrorScope("validation");
  const renderer = new Renderer(engine);
  const view = new SimView(renderer, document.getElementById("c") as HTMLCanvasElement, sys, { span: 10 });
  const enc = engine.device.createCommandEncoder();
  view.render(enc);
  engine.device.queue.submit([enc.finish()]);
  const e2 = await engine.device.popErrorScope();
  log(`render: ${e2 ? "ERROR " + e2.message : "ok"}`);
  await new Promise((r) => setTimeout(r, 300));
  // read back canvas pixels via a 2D copy
  const c2 = document.createElement("canvas");
  c2.width = 300;
  c2.height = 300;
  const ctx = c2.getContext("2d")!;
  ctx.drawImage(document.getElementById("c") as HTMLCanvasElement, 0, 0);
  const px = ctx.getImageData(0, 0, 300, 300).data;
  let nonzero = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] > 0) nonzero++;
  log(`canvas non-transparent pixels: ${nonzero}`);
}
main()
  .catch((e) => log(`EXCEPTION ${e?.stack ?? e}`))
  .finally(() => {
    log("DONE");
    send();
  });
