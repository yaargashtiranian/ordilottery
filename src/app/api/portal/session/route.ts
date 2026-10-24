import { createBackofficeClient } from "@/lib/backoffice-auth";
import {
  customerIdentifier,
  customerProfile,
  iranPhone,
  testOtpAllowed,
  isTestLoginEmail,
  isInternalPhoneEmail,
} from "@/lib/customer-verification";
import {
  guestSession,
  growthClient,
  limit,
  databaseError,
  GrowthError,
} from "@/lib/growth/server";
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
    typeof input.password !== "string" ||
    input.password.length < 8 ||
    input.password.length > 128
  )
    return backofficeJson({ error: "ایمیل و رمز عبور معتبر وارد کنید." }, 422);
  try {
    const guest = (await guestSession(true))!;
    await limit(`portal-login:${guest}`, 15);
    const client = await createBackofficeClient();
    if (input.action === "register") {
      const profile = customerProfile(input);
      if (!profile)
        return backofficeJson({ error: "اطلاعات تماس را کامل کنید." }, 422);
      if (input.method === "test_phone" || input.method === "mobile") {
        const realPhone = input.method === "mobile";
        if (!realPhone && !testOtpAllowed(request.headers.get("origin")!))
          return backofficeJson({ error: "تأیید آزمایشی در دسترس نیست." }, 403);
        const db = growthClient();
        const check = await db.rpc("growth_identity_current", {
          p_guest: guest,
        });
        if (check.error) databaseError();
        if (
          !check.data?.verified ||
          check.data.method !== input.method ||
          check.data.profile.email !== profile.email ||
          check.data.profile.phone !== profile.phone
        )
          return backofficeJson(
            { error: "ابتدا کد موبایل را وارد کنید." },
            422,
          );
        const existing = await db.rpc("growth_identity_status", {
          p_guest: guest,
          p_email: profile.email,
          p_phone: profile.phone,
          p_auth_only: true,
        });
        if (existing.error) databaseError();
        if (existing.data.known)
          return backofficeJson(
            { error: "این حساب قبلاً ساخته شده است؛ وارد شوید." },
            409,
          );
        if (realPhone) {
          const claim = await db.rpc("growth_mobile_registration_claim", {
            p_guest: guest,
            p_email: profile.email,
            p_phone: profile.phone,
          });
          if (claim.error) databaseError();
          if (!claim.data)
            return backofficeJson(
              { error: "برای ساخت حساب، دوباره موبایل را تأیید کنید." },
              422,
            );
        }
        // Hosted Phone Auth is disabled; a reserved login preserves native Supabase passwords/sessions.
        // The claimed customer email is never attached or confirmed; restrictive document RLS rejects the alias.
        const loginEmail = realPhone
          ? `phone-${crypto.randomUUID()}@phone-login.invalid`
          : `mock-${crypto.randomUUID()}@local-otp.invalid`;
        const created = await db.auth.admin.createUser({
          email: loginEmail,
          email_confirm: true,
          phone: iranPhone(profile.phone),
          password: input.password,
          phone_confirm: realPhone,
          app_metadata: {
            identity_assurance: realPhone ? "phone" : "test_phone",
          },
          user_metadata: {
            first_name: profile.firstName,
            last_name: profile.lastName,
            claimed_email: profile.email,
          },
        });
        if (created.error)
          return backofficeJson(
            { error: "ساخت حساب انجام نشد؛ اطلاعات را بررسی کنید." },
            409,
          );
        const signed = await client.auth.signInWithPassword({
          email: loginEmail,
          password: input.password,
        });
        if (signed.error)
          return backofficeJson(
            { error: "حساب ساخته شد؛ با موبایل و رمز وارد شوید." },
            503,
          );
        return backofficeJson({
          ok: true,
          testAccount: !realPhone,
          userId: created.data.user.id,
        });
      }
      if (input.method !== "email")
        return backofficeJson({ error: "روش تأیید را انتخاب کنید." }, 422);
      const { error, data } = await client.auth.signUp({
        email: profile.email,
        password: input.password,
        options: {
          data: {
            first_name: profile.firstName,
            last_name: profile.lastName,
            phone: profile.phone,
          },
          emailRedirectTo: new URL(
            "/auth/callback",
            process.env.SITE_URL || request.headers.get("origin")!,
          ).href,
        },
      });
      // Preserve the PKCE verifier until the confirmation link returns.
      if (data.session) await client.auth.signOut({ scope: "local" });
      return error
        ? backofficeJson(
            {
              error: "ساخت حساب انجام نشد؛ محدودیت سرویس ایمیل را بررسی کنید.",
            },
            400,
          )
        : backofficeJson({ confirmationRequired: true });
    }
    const identifier = customerIdentifier(input.identifier ?? input.email);
    if (!identifier)
      return backofficeJson({ error: "ایمیل یا موبایل معتبر وارد کنید." }, 422);
    let credentials = identifier;
    if (identifier.phone) {
      const lookup = await growthClient().rpc("growth_test_login", {
        p_phone: identifier.phone,
      });
      if (lookup.error) databaseError();
      if (lookup.data) credentials = { email: lookup.data };
    }
    const { error, data } = await client.auth.signInWithPassword({
      ...credentials,
      password: input.password,
    });
    const testAccount =
      data.user?.app_metadata.identity_assurance === "test_phone" &&
      isTestLoginEmail(data.user.email);
    const phoneAccount =
      data.user?.app_metadata.identity_assurance === "phone" &&
      isInternalPhoneEmail(data.user.email) &&
      Boolean(data.user.phone_confirmed_at);
    if (
      error ||
      (!data.user?.email_confirmed_at && !testAccount && !phoneAccount) ||
      (isInternalPhoneEmail(data.user?.email) && !testAccount && !phoneAccount)
    ) {
      await client.auth.signOut({ scope: "local" });
      return backofficeJson(
        { error: "ورود انجام نشد؛ ایمیل، رمز و تأیید ایمیل را بررسی کنید." },
        401,
      );
    }
    return backofficeJson({ ok: true });
  } catch (error) {
    if (error instanceof GrowthError)
      return backofficeJson({ error: error.message }, error.status);
    return backofficeJson({ error: "ارتباط با سرویس ورود برقرار نشد." }, 503);
  }
}
