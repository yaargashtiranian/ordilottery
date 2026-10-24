import { createHmac } from "node:crypto";
import { normalizeDigits } from "./registration";

type Environment = Record<string, string | undefined>;
export type OtpConfig = { token: string; hashSecret: string };
export type OtpSendResult =
  { status: "accepted"; code: string } | { status: "rejected" | "unknown" };

/** A fixed HTTPS origin/path keeps the token out of configurable URLs and redirect destinations. */
export function otpConfig(env: Environment = process.env): OtpConfig | null {
  const token = env.MELIPAYAMAK_OTP_TOKEN,
    hashSecret = env.OTP_HASH_SECRET;
  return env.ENABLE_MELIPAYAMAK_OTP === "true" &&
    token &&
    /^[a-f0-9]{32}$/i.test(token) &&
    hashSecret &&
    /^[a-f0-9]{64}$/i.test(hashSecret)
    ? { token, hashSecret }
    : null;
}
export function normalizeOtp(value: unknown) {
  const code = typeof value === "string" ? normalizeDigits(value.trim()) : "";
  return /^\d{4,10}$/.test(code) ? code : null;
}
/** Bind the hash to its purpose, browser and challenge; low-entropy codes cannot be brute-forced from a DB dump. */
export function otpDigest(
  config: OtpConfig,
  guest: string,
  challenge: string,
  code: string,
) {
  return createHmac("sha256", Buffer.from(config.hashSecret, "hex"))
    .update(JSON.stringify(["otp", guest, challenge, code]))
    .digest("hex");
}
export function otpPhoneKey(config: OtpConfig, phone: string) {
  return createHmac("sha256", Buffer.from(config.hashSecret, "hex"))
    .update(`phone:${phone}`)
    .digest("hex");
}

/** Called once only after a durable claim. Ambiguous failures are never automatically retried. */
export async function sendMelipayamakOtp(
  config: OtpConfig,
  phone: string,
  fetcher: typeof fetch = fetch,
): Promise<OtpSendResult> {
  if (!/^09\d{9}$/.test(phone) || !/^[a-f0-9]{32}$/i.test(config.token))
    return { status: "rejected" };
  try {
    const response = await fetcher(
      `https://console.melipayamak.com/api/send/otp/${config.token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: phone }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      },
    );
    // Bound provider bytes rather than retaining an arbitrary error payload containing credentials or PII.
    const reader = response.body?.getReader();
    if (!reader) return { status: "unknown" };
    let body = "",
      size = 0;
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > 4096) {
        await reader.cancel();
        return { status: "unknown" };
      }
      body += new TextDecoder().decode(item.value);
    }
    const result = JSON.parse(body);
    if (!result || typeof result !== "object" || Array.isArray(result))
      return { status: "unknown" };
    if (typeof result.status === "string" && result.status.trim())
      return { status: "rejected" };
    if (result.status != null && result.status !== "")
      return { status: "unknown" };
    if (!response.ok) return { status: "unknown" };
    const code =
      typeof result.code === "string"
        ? result.code
        : Number.isSafeInteger(result.code)
          ? String(result.code)
          : "";
    return /^\d{4,10}$/.test(code)
      ? { status: "accepted", code }
      : { status: "rejected" };
  } catch {
    return { status: "unknown" };
  }
}
