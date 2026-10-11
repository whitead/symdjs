// Dev-only page self-test (?selftest): after a few seconds, report which
// simulation canvases have drawn particles, plus any errors, to a local log
// server (scripts/browser-check). Used to check browsers Playwright can't drive.

export function runSelftest() {
  const errors: string[] = [];
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" ").slice(0, 400));
    origError(...args);
  };
  window.addEventListener("error", (e) => errors.push(`error: ${e.message}`));
  window.addEventListener("unhandledrejection", (e) => errors.push(`rejection: ${String(e.reason)}`));
  const at = new URLSearchParams(location.search).get("at");
  if (at) setTimeout(() => document.querySelector(at)?.scrollIntoView({ block: "start" }), 800);
  let hubFrames = 0;
  import("../sim/hub").then(({ SimHub }) => SimHub.get().then((hub) => hub.onFrame(() => hubFrames++)));
  let frames = 0;
  const count = () => {
    frames++;
    requestAnimationFrame(count);
  };
  requestAnimationFrame(count);
  const t0 = performance.now();
  setTimeout(() => {
    const secs = (performance.now() - t0) / 1000;
    const report: string[] = [`UA ${navigator.userAgent}`, `display fps ${(frames / secs).toFixed(1)} · simulation fps ${(hubFrames / secs).toFixed(1)}`];
    const canvases = [...document.querySelectorAll<HTMLCanvasElement>("canvas.sim-slot__canvas")];
    const c2 = document.createElement("canvas");
    const ctx = c2.getContext("2d")!;
    canvases.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      c2.width = c.width;
      c2.height = c.height;
      ctx.clearRect(0, 0, c2.width, c2.height);
      ctx.drawImage(c, 0, 0);
      const px = ctx.getImageData(0, 0, c2.width, c2.height).data;
      let n = 0;
      for (let k = 3; k < px.length; k += 16) if (px[k] > 0) n++;
      report.push(`canvas ${i} (${c.getAttribute("aria-label")?.slice(0, 40)}): ${c.width}x${c.height} drawn≈${((100 * n * 4) / (px.length / 4)).toFixed(1)}%`);
    });
    report.push(`errors: ${errors.length ? errors.join(" | ") : "none"}`);
    report.push("DONE");
    fetch("http://localhost:5199/log", { method: "POST", body: report.join("\n") }).catch(() => {});
  }, Number(new URLSearchParams(location.search).get("selftest")) || 6000);
}
