import {
  createBackofficeClient,
  getBackofficeSession,
} from "@/lib/backoffice-auth";
import {
  backofficeJson,
  isBackofficeOrigin,
  readBackofficeBody,
} from "@/lib/backoffice-request";

/** Login and first-account registration always delegate password handling to Supabase. */
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
  ) {
    return backofficeJson(
      { error: "ایمیل و رمز عبور معتبر وارد کنید؛ رمز حداقل ۸ نویسه است." },
      400,
    );
  }
  try {
    const client = await createBackofficeClient();
    if (input.action === "register") {
      // Only the configured owner may create the first editorial account through this UI.
      if (
        !process.env.BACKOFFICE_ADMIN_EMAIL ||
        input.email.trim().toLowerCase() !==
          process.env.BACKOFFICE_ADMIN_EMAIL.toLowerCase()
      ) {
        return backofficeJson(
          { error: "این ایمیل برای ساخت حساب مدیریت مجاز نیست." },
          403,
        );
      }
      const { error } = await client.auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: {
          emailRedirectTo: new URL(
            "/backoffice/login",
            request.headers.get("origin")!,
          ).href,
        },
      });
      if (error)
        return backofficeJson(
          {
            error:
              "ساخت حساب انجام نشد. تنظیمات ایمیل یا محدودیت سرویس را بررسی کنید.",
          },
          400,
        );
      await client.auth.signOut({ scope: "local" });
      return backofficeJson({ confirmationRequired: true });
    }
    const { error } = await client.auth.signInWithPassword({
      email: input.email.trim(),
      password: input.password,
    });
    if (error)
      return backofficeJson(
        { error: "ورود انجام نشد. ایمیل، رمز و تأیید ایمیل را بررسی کنید." },
        401,
      );
    const session = await getBackofficeSession();
    if (!session) {
      await client.auth.signOut({ scope: "local" });
      return backofficeJson({ error: "این حساب دسترسی مدیریت ندارد." }, 403);
    }
    return backofficeJson({ ok: true });
  } catch {
    return backofficeJson({ error: "ارتباط با سرویس ورود برقرار نشد." }, 503);
  }
}

/** Sign-out removes the local session; other devices retain their own sessions. */
export async function DELETE(request: Request) {
  if (!isBackofficeOrigin(request))
    return backofficeJson({ error: "مبدأ درخواست معتبر نیست." }, 403);
  try {
    const { error } = await (
      await createBackofficeClient()
    ).auth.signOut({ scope: "local" });
    return error
      ? backofficeJson({ error: "خروج انجام نشد." }, 503)
      : backofficeJson({ ok: true });
  } catch {
    return backofficeJson({ error: "خروج انجام نشد." }, 503);
  }
}
