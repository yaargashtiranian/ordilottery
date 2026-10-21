import type { CheckoutConfig } from "@/lib/checkout-config";
import {
  sendRegistrationSms,
  type MelipayamakConfig,
  type SmsResult,
} from "@/lib/melipayamak";

export type NotificationOutcome =
  | { status: "skipped" | "claim_failed" }
  | { status: "record_failed"; sendStatus: SmsResult["status"] }
  | { status: SmsResult["status"] };

/** Use the adapter’s durable, atomic claim; process memory/files are not a deduplication store. */
export async function notifyRegistration(
  provider: CheckoutConfig,
  sms: MelipayamakConfig,
  requestId: string,
  fetcher: typeof fetch = fetch,
): Promise<NotificationOutcome> {
  const endpoint = `${provider.apiUrl}/requests/${encodeURIComponent(requestId)}/notifications/registration`;
  const headers = {
    Authorization: `Bearer ${provider.token}`,
    "Content-Type": "application/json",
  };
  let notificationId: string;
  let message: { to: string; firstName: string; reference: string };
  try {
    const claim = await fetcher(`${endpoint}/claim`, {
      method: "POST",
      headers,
      body: "{}",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (claim.status === 204) return { status: "skipped" };
    // Only a newly acquired durable claim authorizes a send. A missing endpoint,
    // unsupported bridge or replay response cannot cause a paid SMS call.
    if (claim.status !== 201) return { status: "claim_failed" };
    const body: unknown = await claim.json();
    if (!body || typeof body !== "object") return { status: "claim_failed" };
    const event = body as Record<string, unknown>;
    if (
      typeof event.notificationId !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(event.notificationId) ||
      typeof event.to !== "string" ||
      typeof event.firstName !== "string" ||
      typeof event.reference !== "string"
    )
      return { status: "claim_failed" };
    notificationId = event.notificationId;
    // Recipient/parameters come from the persisted request, not a browser SMS API.
    message = {
      to: event.to,
      firstName: event.firstName,
      reference: event.reference,
    };
  } catch {
    return { status: "claim_failed" };
  }

  const result = await sendRegistrationSms(sms, message, fetcher);
  try {
    const recorded = await fetcher(`${endpoint}/result`, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      headers: {
        ...headers,
        "Idempotency-Key": `sms-result:${notificationId}`,
      },
      body: JSON.stringify({ notificationId, ...result }),
    });
    if (!recorded.ok)
      return { status: "record_failed", sendStatus: result.status };
  } catch {
    return { status: "record_failed", sendStatus: result.status };
  }
  return { status: result.status };
}
