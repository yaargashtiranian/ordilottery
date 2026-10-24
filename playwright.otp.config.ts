import { defineConfig } from "@playwright/test";
import growth from "./playwright.growth.config";
if (!Array.isArray(growth.webServer) || growth.webServer.length !== 2)
  throw new Error("OTP tests require the isolated growth backend and app");
const servers = growth.webServer;
/** Real Next APIs/RLS, synthetic Auth/provider; no production key, phone number or external SMS is used. */
export default defineConfig({
  ...growth,
  testMatch: /otp\.spec\.ts/,
  webServer: [
    servers[0],
    {
      ...servers[1],
      command:
        "node --import ./scripts/otp-test-fetch.mjs node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100",
      env: {
        ...servers[1].env,
        ENABLE_MELIPAYAMAK_OTP: "true",
        MELIPAYAMAK_OTP_TOKEN: "a".repeat(32),
        OTP_HASH_SECRET: "b".repeat(64),
        ENABLE_TEST_OTP: "true",
      },
    },
  ],
});
