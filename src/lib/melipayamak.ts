import { normalizeDigits } from "@/lib/registration";

export type MelipayamakConfig = {
  username: string;
  password: string;
  registrationBodyId: string;
};

export type SmsResult =
  | { status: "accepted"; providerId: string }
  | {
      status: "rejected";
      reason: "invalid_recipient" | "invalid_parameters" | "provider_rejected";
    }
  | {
      status: "unknown";
      reason: "http_error" | "invalid_response" | "network_error";
    };

// Fixed provider origin prevents credentials being redirected to a configured URL.
export const melipayamakEndpoint =
  "https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber";

/** Read server-only bindings; an explicit switch and approved template are required. */
export function getMelipayamakConfig(): MelipayamakConfig | null {
  const username = process.env.MELIPAYAMAK_USERNAME;
  const password = process.env.MELIPAYAMAK_PASSWORD;
  const registrationBodyId = process.env.MELIPAYAMAK_REGISTRATION_BODY_ID;
  if (
    process.env.ENABLE_MELIPAYAMAK !== "true" ||
    !username ||
    !password ||
    !registrationBodyId ||
    !/^[1-9]\d{0,8}$/.test(registrationBodyId)
  )
    return null;
  return { username, password, registrationBodyId };
}

/** Send one approved transactional template; never retry an ambiguous provider call. */
export async function sendRegistrationSms(
  config: MelipayamakConfig,
  message: { to: string; firstName: string; reference: string },
  fetcher: typeof fetch = fetch,
): Promise<SmsResult> {
  const to = normalizeDigits(message.to)
    .replace(/[\s()-]/g, "")
    .replace(/^(?:\+98|0098)/, "0");
  if (!/^09\d{9}$/.test(to))
    return { status: "rejected", reason: "invalid_recipient" };
  // Semicolon separates template variables in BaseServiceNumber; never allow a
  // supplied name to inject another variable, line or arbitrary SMS content.
  if (
    !message.firstName.trim() ||
    message.firstName.length > 80 ||
    /[;\u0000-\u001f\u007f]/.test(message.firstName) ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(message.reference)
  )
    return { status: "rejected", reason: "invalid_parameters" };
  try {
    const response = await fetcher(melipayamakEndpoint, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: new URLSearchParams({
        username: config.username,
        password: config.password,
        to,
        bodyId: config.registrationBodyId,
        text: `${message.firstName.trim()};${message.reference}`,
      }).toString(),
    });
    // A gateway error or timeout can happen after acceptance. Unknown is not a
    // confirmed failure and must not trigger an automatic duplicate send.
    if (!response.ok) return { status: "unknown", reason: "http_error" };
    const body: unknown = await response.json();
    if (!body || typeof body !== "object")
      return { status: "unknown", reason: "invalid_response" };
    const { RetStatus, Value } = body as Record<string, unknown>;
    if (typeof RetStatus !== "number" || !Number.isInteger(RetStatus))
      return { status: "unknown", reason: "invalid_response" };
    if (RetStatus !== 1)
      return { status: "rejected", reason: "provider_rejected" };
    // Preserve decimal RecIds as strings; large numeric JSON values lose precision.
    const providerId =
      typeof Value === "string"
        ? Value
        : typeof Value === "number" && Number.isSafeInteger(Value)
          ? String(Value)
          : "";
    if (/^-[1-9]\d*$/.test(providerId) || providerId === "0")
      return { status: "rejected", reason: "provider_rejected" };
    if (!/^[1-9]\d{0,31}$/.test(providerId))
      return { status: "unknown", reason: "invalid_response" };
    return { status: "accepted", providerId };
  } catch {
    // Never expose response bodies, credentials or recipient information in logs.
    return { status: "unknown", reason: "network_error" };
  }
}
