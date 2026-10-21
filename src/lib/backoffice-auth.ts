import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Tokens live in HTTP-only cookies; authenticated RLS remains the write authority. */
export async function createBackofficeClient() {
  const jar = await cookies();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured");
  return createServerClient(url, key, {
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure:
        process.env.NODE_ENV === "production" &&
        process.env.BACKOFFICE_LOCAL_HTTP !== "true",
      path: "/",
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        }),
    },
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) =>
            jar.set(name, value, options),
          );
        } catch {
          // Read-only Server Components use the session refreshed by the proxy.
        }
      },
    },
  });
}

/** Verify the identity remotely, then check a server-managed editor allowlist. */
export async function getBackofficeSession() {
  const client = await createBackofficeClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user?.email || !user.email_confirmed_at) return null;
  const { data: editor, error: editorError } = await client
    .from("cms_editors")
    .select("email")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();
  if (editorError || !editor) return null;
  return { client, user };
}
