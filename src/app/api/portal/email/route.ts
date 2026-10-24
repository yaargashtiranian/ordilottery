import { createBackofficeClient } from "@/lib/backoffice-auth";
import {
  isBackofficeOrigin,
  readBackofficeBody,
  backofficeJson as json,
} from "@/lib/backoffice-request";
import { guestSession, limit } from "@/lib/growth/server";
import { isTestLoginEmail } from "@/lib/customer-verification";

/** A real magic link establishes a separate email-proven identity; no alias credential is transferred to it. */
export async function POST(request: Request) {
  if (!isBackofficeOrigin(request))
    return json({ error: "مبدأ نامعتبر است." }, 403);
  const input = await readBackofficeBody(request, 2000);
  const email =
    typeof input?.email === "string" ? input.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return json({ error: "ایمیل معتبر وارد کنید." }, 422);
  try {
    const client = await createBackofficeClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (
      error ||
      !user ||
      !isTestLoginEmail(user.email) ||
      user.app_metadata.identity_assurance !== "test_phone"
    )
      return json({ error: "ابتدا وارد حساب شوید." }, 401);
    const guest = (await guestSession(true))!;
    await limit(`portal-email:${guest}`, 3, 600);
    const result = await client.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: new URL(
          "/auth/callback",
          process.env.SITE_URL || request.headers.get("origin")!,
        ).href,
      },
    });
    return result.error
      ? json({ error: "ارسال تأیید ایمیل انجام نشد." }, 503)
      : json({ ok: true });
  } catch {
    return json({ error: "ارتباط برقرار نشد." }, 503);
  }
}
