import { expect, test } from "@playwright/test";

test("WebGPU engine matches the CPU reference", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && errors.push(`[${m.type()}] ${m.text()}`));
  await page.goto("/parity.html");
  await page.waitForFunction(() => document.getElementById("out")!.textContent !== "running", null, { timeout: 100_000 });
  const text = (await page.textContent("#out"))!;
  console.log(text);
  console.log(errors.join("\n"));
  expect(text.startsWith("DONE")).toBe(true);
  const { results } = JSON.parse(text.slice(5));
  for (const r of results) {
    expect(r.ds, `${r.name} positions`).toBeLessThan(2e-3);
    expect(r.dv / Math.max(1, r.vmax), `${r.name} velocities`).toBeLessThan(2e-2);
    expect(r.dp, `${r.name} lattice`).toBeLessThan(1e-3);
  }
});
