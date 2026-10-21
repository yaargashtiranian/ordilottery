import { createBackofficeClient } from "@/lib/backoffice-auth";
import {
  isBackofficeOrigin,
  readBackofficeBody,
  backofficeJson,
} from "@/lib/backoffice-request";
export { DELETE } from "@/app/api/backoffice/session/route";

/** Native Supabase email/password accounts never grant staff membership or create a CRM case. */
export async function POST(request: Request) {
  if (!isBackofficeOrigin(request))
    return backofficeJson({ error: "مبدأ درخواست معتبر نیست." }, 403);
  const input = await readBackofficeBody(request, 5000);
  if (
    !input ||
    typeof input.email !== "string" ||
    typeof input.password !== "string" ||
    input.email.length > 254 ||
    input.password.length < 8 ||
    input.password.length > 128
  )
    return backofficeJson({ error: "ایمیل و رمز عبور معتبر وارد کنید." }, 422);
  try {
    const client = await createBackofficeClient();
    if (input.action === "register") {
      const { error } = await client.auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: {
          emailRedirectTo: new URL("/portal", request.headers.get("origin")!)
            .href,
        },
      });
      await client.auth.signOut({ scope: "local" });
      return error
        ? backofficeJson(
            {
              error: "ساخت حساب انجام نشد؛ محدودیت سرویس ایمیل را بررسی کنید.",
            },
            400,
          )
        : backofficeJson({ confirmationRequired: true });
    }
    const { error, data } = await client.auth.signInWithPassword({
      email: input.email.trim(),
      password: input.password,
    });
    if (error || !data.user?.email_confirmed_at) {
      await client.auth.signOut({ scope: "local" });
      return backofficeJson(
        { error: "ورود انجام نشد؛ ایمیل، رمز و تأیید ایمیل را بررسی کنید." },
        401,
      );
    }
    return backofficeJson({ ok: true });
  } catch {
    return backofficeJson({ error: "ارتباط با سرویس ورود برقرار نشد." }, 503);
  }
}
