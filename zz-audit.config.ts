import base from "./playwright.config";
import { devices } from "@playwright/test";
export default {
  ...base,
  projects: [
    { name: "chromium", use: { viewport: { width: 1280, height: 800 } } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
};
