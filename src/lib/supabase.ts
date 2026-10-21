import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Use the public role and RLS; this connection never grants administrator access. */
export function createSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !key.startsWith("sb_publishable_")) {
    throw new Error("Supabase URL and publishable key must be configured.");
  }
  const endpoint = new URL(url);
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.pathname !== "/" ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new Error("Supabase URL must be an HTTPS origin.");
  }

  return createClient(endpoint.origin, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      // Bound upstream calls and avoid caching private data in Next.js.
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
          signal: init?.signal
            ? AbortSignal.any([init.signal, AbortSignal.timeout(5000)])
            : AbortSignal.timeout(5000),
        }),
    },
  });
}

/** Verify Data API access to the actual public CMS table without reading drafts. */
export async function checkSupabaseConnection(): Promise<boolean> {
  try {
    const { data, error } = await createSupabaseClient()
      .from("cms_pages")
      .select("slug")
      .limit(1);
    return !error && Array.isArray(data);
  } catch {
    return false;
  }
}
