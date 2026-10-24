import "server-only";
import {
  otpConfig,
  otpDigest,
  otpPhoneKey,
  normalizeOtp,
  sendMelipayamakOtp,
} from "./melipayamak-otp";
import {
  growthClient,
  databaseError,
  GrowthError,
  limit,
} from "./growth/server";
import { type customerProfile } from "./customer-verification";

/** Claim first, send once, persist only a digest. Provider failures never leak its URL, token, code or raw status. */
export async function startMobileCheck(
  guest: string,
  profile: NonNullable<ReturnType<typeof customerProfile>>,
) {
  const config = otpConfig();
  if (!config) throw new GrowthError("تأیید پیامکی در دسترس نیست.", 503);
  await limit("otp-send-global", 200, 3600);
  const db = growthClient();
  const claim = await db.rpc("growth_mobile_start", {
    p_guest: guest,
    p_profile: profile,
    p_phone_key: otpPhoneKey(config, profile.phone),
  });
  if (claim.error) {
    if (claim.error.message.includes("OTP_COOLDOWN"))
      throw new GrowthError("برای ارسال دوباره یک دقیقه صبر کنید.", 429);
    if (claim.error.message.includes("OTP_LIMIT"))
      throw new GrowthError(
        "تعداد درخواست‌های کد بیش از حد مجاز است؛ بعداً تلاش کنید.",
        429,
      );
    databaseError();
  }
  const sent = await sendMelipayamakOtp(config, profile.phone);
  const result = await db.rpc("growth_mobile_finish", {
    p_guest: guest,
    p_id: claim.data,
    p_state: sent.status,
    p_hash:
      sent.status === "accepted"
        ? otpDigest(config, guest, claim.data, sent.code)
        : null,
  });
  if (result.error || !result.data)
    throw new GrowthError(
      "ثبت ارسال تأیید نشد؛ پس از یک دقیقه دوباره کد بگیرید.",
      503,
    );
  if (sent.status !== "accepted")
    throw new GrowthError(
      sent.status === "unknown"
        ? "وضعیت ارسال مشخص نشد؛ پس از یک دقیقه دوباره کد بگیرید."
        : "ارسال کد انجام نشد؛ بعداً تلاش کنید.",
      503,
    );
  return claim.data as string;
}

/** SQL consumes codes and counts wrong attempts atomically; an invalid format still counts as an attempt. */
export async function confirmMobileCheck(
  guest: string,
  challenge: string,
  value: unknown,
) {
  const config = otpConfig();
  if (!config) throw new GrowthError("تأیید پیامکی در دسترس نیست.", 503);
  const code = normalizeOtp(value);
  const result = await growthClient().rpc("growth_mobile_verify", {
    p_guest: guest,
    p_id: challenge,
    p_hash: code ? otpDigest(config, guest, challenge, code) : null,
  });
  if (result.error) databaseError();
  return result.data === true;
}
