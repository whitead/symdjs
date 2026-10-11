import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  use: {
    channel: "chrome",
    headless: true,
    launchOptions: { args: ["--enable-unsafe-webgpu"] },
    baseURL: "http://localhost:5190",
  },
  webServer: {
    command: "npx vite --port 5190 --strictPort",
    url: "http://localhost:5190/parity.html",
    reuseExistingServer: true,
  },
});
