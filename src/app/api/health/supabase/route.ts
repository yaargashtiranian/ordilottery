import { checkSupabaseConnection } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Expose availability only; never return credentials, schema or upstream errors. */
export async function GET() {
  const connected = await checkSupabaseConnection();
  return Response.json(
    { supabase: connected ? "connected" : "unavailable" },
    {
      status: connected ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
