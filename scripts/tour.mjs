// Scroll through the site in headless Chrome (WebGPU) and screenshot viewports.
// Usage: node scripts/tour.mjs <url> <outdir> [width] [height] [selectors...]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const [url, outdir, width = "1440", height = "900", ...targets] = process.argv.slice(2);
mkdirSync(outdir, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-unsafe-webgpu"] });
const page = await browser.newPage({ viewport: { width: +width, height: +height } });
const logs = [];
page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && !m.text().includes("favicon") && logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push("[pageerror] " + e.message));
await page.goto(url, { waitUntil: "networkidle" });
const shots = targets.length ? targets : ["#top@4000"];
let i = 0;
for (const t of shots) {
  const [sel, wait = "2500"] = t.split("@");
  if (sel.startsWith("y=")) await page.evaluate((y) => window.scrollTo(0, y), +sel.slice(2));
  else await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: "start" }), sel);
  await page.waitForTimeout(+wait);
  const name = `${outdir}/${String(i++).padStart(2, "0")}-${sel.replace(/[^a-z0-9]+/gi, "_")}.png`;
  await page.screenshot({ path: name });
  console.log(name);
}
console.log(logs.slice(0, 20).join("\n"));
await browser.close();
