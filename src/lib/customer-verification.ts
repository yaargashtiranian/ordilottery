import { normalizeDigits, validateRegistration } from "./registration";

/** Reuse the four-field contract without manufacturing an account password or accepting price fields. */
export function customerProfile(value: unknown) {
  const result = validateRegistration({
    ...(value && typeof value === "object" ? value : {}),
    plan: "online",
    idempotencyKey: "00000000-0000-4000-8000-000000000001",
  });
  if (!result.valid) return null;
  const { firstName, lastName, email, phone } = result.data;
  return { firstName, lastName, email: email.toLowerCase(), phone };
}
export function iranPhone(value: string) {
  return "+98" + value.slice(1);
}
/** Reserved internal identities authenticate local mock accounts; they are never customer email proof. */
export function isTestLoginEmail(value: unknown) {
  return typeof value === "string" && value.endsWith("@local-otp.invalid");
}
/** A phone-proven internal login is never proof of the customer's claimed email. */
export function isInternalPhoneEmail(value: unknown) {
  return (
    isTestLoginEmail(value) ||
    (typeof value === "string" && value.endsWith("@phone-login.invalid"))
  );
}
/** Phone logins use the same normalization as intake; an address is never interpreted as a phone. */
export function customerIdentifier(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  if (text.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))
    return { email: text };
  const phone = normalizeDigits(text)
    .replace(/[\s()-]/g, "")
    .replace(/^(?:\+98|0098)/, "0");
  return /^09\d{9}$/.test(phone) ? { phone: iranPhone(phone) } : null;
}

/** The fixed code exists only behind an explicit local-test switch, never on a public production origin. */
export function testOtpAllowed(
  origin: string,
  env: Record<string, string | undefined> = process.env,
) {
  try {
    const url = new URL(origin);
    return (
      env.ENABLE_TEST_OTP === "true" &&
      env.ENABLE_MELIPAYAMAK_OTP !== "true" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      (env.NODE_ENV !== "production" || env.BACKOFFICE_LOCAL_HTTP === "true")
    );
  } catch {
    return false;
  }
}
export function testCodeMatches(value: unknown) {
  return (
    typeof value === "string" && normalizeDigits(value.trim()) === "123456"
  );
}
