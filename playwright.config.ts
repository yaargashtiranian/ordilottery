import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

/** Use the cloud browser when present; standard Playwright installs work elsewhere. */
export default defineConfig({
  testDir: "tests/browser",
  testIgnore: /(?:growth|otp)\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
      args: ["--no-sandbox"],
    },
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://127.0.0.1:3100",
    // Always test the current build, never a process left behind by another run.
    reuseExistingServer: false,
    env: {
      SUPABASE_SECRET_KEY: "",
      ENABLE_MELIPAYAMAK_OTP: "false",
      MELIPAYAMAK_OTP_TOKEN: "",
      OTP_HASH_SECRET: "",
      ENABLE_TEST_OTP: "false",
      SUPABASE_URL: "http://127.0.0.1:9",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_test_only",
      SUPABASE_SERVICE_ROLE_KEY: "",
      COMMERCE_MODE: "disabled",
      BACKOFFICE_LOCAL_HTTP: "true",
      ENABLE_CHECKOUT: "false",
      ENABLE_MELIPAYAMAK: "false",
      SITE_URL: "",
      ALLOW_INDEXING: "false",
    },
    timeout: 60000,
  },
});
