import base from "./playwright.config";
import { defineConfig } from "@playwright/test";
/** Separate suite runs real Next routes against local SQL fixtures; never reads .env.local or external services. */
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: /growth\.spec\.ts/,
  webServer: [
    {
      command: "node --import tsx scripts/growth-test-server.ts",
      url: "http://127.0.0.1:3301/health",
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: "npm run start -- --port 3100",
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        SUPABASE_URL: "http://127.0.0.1:3301",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_test_only",
        SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-role-key",
        SUPABASE_SECRET_KEY: "",
        ENABLE_MELIPAYAMAK_OTP: "false",
        MELIPAYAMAK_OTP_TOKEN: "",
        OTP_HASH_SECRET: "",
        ENABLE_TEST_OTP: "true",
        COMMERCE_MODE: "simulation",
        ENABLE_CHECKOUT: "false",
        ENABLE_MELIPAYAMAK: "false",
        SITE_URL: "",
        ALLOW_INDEXING: "false",
        BACKOFFICE_LOCAL_HTTP: "true",
      },
    },
  ],
});
