import { checkSupabaseConnection } from "../src/lib/supabase";

/** Exercise the same client as the application without creating test records. */
async function main() {
  const connected = await checkSupabaseConnection();
  console.log(connected ? "Supabase: connected" : "Supabase: unavailable");
  if (!connected) process.exitCode = 1;
}

void main();
