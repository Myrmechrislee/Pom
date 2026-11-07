import { defineConfig, devices } from "@playwright/test";
const port = Number(process.env.POM_E2E_PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid POM_E2E_PORT");
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL,
    ...devices["Desktop Chrome"],
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: baseURL,
    env: { APP_BASE_URL: `http://localhost:${port}` },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
