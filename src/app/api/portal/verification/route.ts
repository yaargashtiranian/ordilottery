import {
  backofficeJson as json,
  isBackofficeOrigin,
  readBackofficeBody,
} from "@/lib/backoffice-request";
import {
  customerProfile,
  testOtpAllowed,
  testCodeMatches,
} from "@/lib/customer-verification";
import { finishEmailCheck } from "@/lib/customer-verification-server";
import { createBackofficeClient } from "@/lib/backoffice-auth";
import {
  guestSession,
  growthClient,
  limit,
  GrowthError,
  databaseError,
} from "@/lib/growth/server";
import { isUuid } from "@/lib/operations-model";
export const dynamic = "force-dynamic";

/** Same-browser recovery after a real email link contains no password and cannot expose another person's profile. */
export async function GET(request: Request) {
  try {
    const testPhone = testOtpAllowed(
      process.env.SITE_URL || `http://${request.headers.get("host")}`,
    );
    const guest = await guestSession();
    if (!guest) return json({ check: null, testPhone });
    await limit(`identity-read:${guest}`, 30);
    await finishEmailCheck();
    const result = await growthClient().rpc("growth_identity_current", {
      p_guest: guest,
    });
    if (result.error) databaseError();
    return json({ check: result.data, testPhone });
  } catch {
    return json({ error: "دریافت وضعیت تأیید انجام نشد." }, 503);
  }
}

/** Fixed phone verification never confirms an email or returns an Auth token. */
export async function POST(request: Request) {
  if (!isBackofficeOrigin(request))
    return json({ error: "مبدأ نامعتبر است." }, 403);
  const input = await readBackofficeBody(request, 5000);
  if (!input) return json({ error: "اطلاعات نامعتبر است." }, 422);
  try {
    const guest = (await guestSession(true))!;
    await limit(`identity-write:${guest}`, 20);
    const db = growthClient();
    if (input.action === "confirm") {
      if (
        !testOtpAllowed(request.headers.get("origin")!) ||
        !isUuid(input.challenge)
      )
        return json({ error: "تأیید آزمایشی در دسترس نیست." }, 403);
      const result = await db.rpc("growth_identity_attempt", {
        p_guest: guest,
        p_id: input.challenge,
        p_valid: testCodeMatches(input.code),
        p_method: "test_phone",
      });
      if (result.error) databaseError();
      return result.data
        ? json({ verified: true, method: "test_phone" })
        : json({ error: "کد نادرست یا منقضی شده است." }, 422);
    }
    const profile = customerProfile(input.profile);
    if (!profile) return json({ error: "اطلاعات تماس را کامل کنید." }, 422);
    if (input.action === "status") {
      const result = await db.rpc("growth_identity_status", {
        p_guest: guest,
        p_email: profile.email,
        p_phone: profile.phone,
      });
      if (result.error) databaseError();
      return json({ ready: result.data.known || result.data.verified });
    }
    if (
      input.action !== "start" ||
      !["email", "test_phone"].includes(String(input.channel))
    )
      return json({ error: "روش تأیید نامعتبر است." }, 422);
    if (
      input.channel === "test_phone" &&
      !testOtpAllowed(request.headers.get("origin")!)
    )
      return json({ error: "تأیید آزمایشی در دسترس نیست." }, 403);
    await limit(`identity-start:${guest}`, 5, 600);
    const result = await db.rpc("growth_identity_start", {
      p_guest: guest,
      p_profile: profile,
      p_channel: input.channel,
    });
    if (result.error) databaseError();
    if (input.channel === "email") {
      const client = await createBackofficeClient();
      const sent = await client.auth.signInWithOtp({
        email: profile.email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: new URL(
            "/auth/callback?next=registration",
            process.env.SITE_URL || request.headers.get("origin")!,
          ).href,
        },
      });
      if (sent.error)
        return json(
          { error: "ارسال ایمیل انجام نشد؛ کمی بعد تلاش کنید." },
          503,
        );
    }
    return json({ challenge: result.data, channel: input.channel });
  } catch (error) {
    return json(
      {
        error:
          error instanceof GrowthError ? error.message : "ارتباط برقرار نشد.",
      },
      error instanceof GrowthError ? error.status : 503,
    );
  }
}
