import { defineConfig, devices } from "@playwright/test";
import { e2eKeys } from "./e2e/support/keys";
import { e2ePort } from "./e2e/support/port";

const baseURL = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: "bun scripts/e2e-server.ts",
    url: `${baseURL}/api/team`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
      CLERK_JWT_KEY: e2eKeys().publicKey,
      // Live-style keys: a test-instance key makes Clerk redirect page loads to its own host.
      CLERK_SECRET_KEY: "sk_live_seam2",
      CLERK_PUBLISHABLE_KEY: `pk_live_${btoa("clerk.example.test$")}`,
      APP_ORIGIN: baseURL,
      TEAM_NAME: "Haithem Studio",
      TEAM_LOGO_URL: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
      FIRST_OWNER_EMAIL: "first.owner@example.com",
    },
  },
});
