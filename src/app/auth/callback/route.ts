import { createBackofficeClient } from "@/lib/backoffice-auth";
/** Supabase PKCE binds the email link to its initiating browser; redirect destinations stay fixed. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  let ok = false;
  if (code && code.length <= 2000) {
    try {
      const client = await createBackofficeClient();
      const { error } = await client.auth.exchangeCodeForSession(code);
      ok = !error;
    } catch {
      /* The portal provides a safe retry/login path without exposing provider diagnostics. */
    }
  }
  return Response.redirect(
    new URL(
      ok ? "/portal" : "/portal?confirmation=retry",
      process.env.SITE_URL || url.origin,
    ),
    303,
  );
}
