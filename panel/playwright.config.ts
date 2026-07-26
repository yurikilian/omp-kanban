import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  // Exercises the real production entry point, not `next dev` - e2e proves
  // what actually ships, matching the spec's "no dev server in production"
  // requirement (E1-S4-AC2).
  webServer: {
    command: "npm run build && npm run start",
    url: baseURL,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
