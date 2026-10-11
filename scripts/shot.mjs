// Screenshot a dev page in headless Chrome with WebGPU.
// Usage: node scripts/shot.mjs <url> <out.png> [waitMs] [width] [height]
import { chromium } from "playwright";
const [url, out, wait = "4000", width = "1400", height = "1400"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-unsafe-webgpu"] });
const page = await browser.newPage({ viewport: { width: +width, height: +height } });
page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && console.log(`[${m.type()}]`, m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(url);
await page.waitForTimeout(+wait);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
