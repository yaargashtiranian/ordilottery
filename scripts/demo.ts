import { spawn, type ChildProcess } from "node:child_process";

/** Review-only demo: isolated in-memory PostgreSQL and synthetic Auth; no real Supabase, SMS or bank keys. */
const children: ChildProcess[] = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}
const backend = spawn(
  process.execPath,
  ["--import", "tsx", "scripts/growth-test-server.ts"],
  { stdio: ["ignore", "pipe", "inherit"] },
);
children.push(backend);
let started = false;
backend.stdout!.on("data", (data: Buffer) => {
  process.stdout.write(data);
  if (
    started ||
    !data.toString().includes("Isolated growth test backend ready")
  )
    return;
  started = true;
  const web = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3000",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "development",
        SUPABASE_URL: "http://127.0.0.1:3301",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_test_only",
        SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-role-key",
        COMMERCE_MODE: "simulation",
        ENABLE_CHECKOUT: "false",
        ENABLE_MELIPAYAMAK: "false",
        ZARINPAL_MERCHANT_ID: "",
        SITE_URL: "",
        ALLOW_INDEXING: "false",
        BACKOFFICE_LOCAL_HTTP: "true",
      },
    },
  );
  children.push(web);
  web.on("exit", (code) => stop(code || 0));
  console.log(
    "\nReview demo: http://127.0.0.1:3000\nStaff: growth-staff@example.invalid / synthetic-password\nCoupons: TEST100 and TEST50. Data resets on exit. Do not enter real customer data.\n",
  );
});
backend.on("exit", (code) => stop(code || 0));
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
