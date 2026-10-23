import type { CommerceMode } from "./model";
import { brand } from "@/lib/site";

/** Provider endpoints are fixed; no callback, URL or amount is taken from browser input. */
export function gatewaySettings(
  mode: CommerceMode,
  env: Record<string, string | undefined> = process.env,
) {
  if (
    !["live", "sandbox"].includes(mode) ||
    !env.ZARINPAL_MERCHANT_ID ||
    !env.SITE_URL
  )
    return null;
  const site = new URL(env.SITE_URL);
  if (site.protocol !== "https:" || site.username || site.password) return null;
  const host =
    mode === "sandbox" ? "sandbox.zarinpal.com" : "payment.zarinpal.com";
  return {
    merchant: env.ZARINPAL_MERCHANT_ID,
    api: `https://${host}/pg/v4/payment`,
    start: `https://${mode === "sandbox" ? "sandbox" : "www"}.zarinpal.com/pg/StartPay/`,
    site: site.origin,
  };
}

/** Integer tomans are converted once at the provider boundary; no floating-point money. */
export function rials(tomans: number) {
  if (
    !Number.isSafeInteger(tomans) ||
    tomans <= 0 ||
    !Number.isSafeInteger(tomans * 10)
  )
    throw new Error("Invalid amount");
  return tomans * 10;
}
export function isAuthority(value: unknown): value is string {
  return typeof value === "string" && /^[AS][A-Za-z0-9]{35}$/.test(value);
}

/** No automatic retry: a timeout after the provider accepts can represent an unknown payment attempt. */
export async function requestGateway(
  settings: NonNullable<ReturnType<typeof gatewaySettings>>,
  id: string,
  amount: number,
  fetcher = fetch,
) {
  const response = await fetcher(`${settings.api}/request.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      merchant_id: settings.merchant,
      amount: rials(amount),
      currency: "IRR",
      callback_url: `${settings.site}/api/payments/callback?order=${encodeURIComponent(id)}`,
      description: `هزینه خدمات ${brand.name}`,
    }),
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  const body = await response.json();
  if (
    !response.ok ||
    body.data?.code !== 100 ||
    !isAuthority(body.data.authority)
  )
    throw new Error("Gateway request uncertain");
  return body.data.authority as string;
}

/** Callback status is only a hint; amount and authority are verified server-to-server. */
export async function verifyGateway(
  settings: NonNullable<ReturnType<typeof gatewaySettings>>,
  authority: string,
  amount: number,
  fetcher = fetch,
) {
  if (!isAuthority(authority)) throw new Error("Invalid authority");
  const response = await fetcher(`${settings.api}/verify.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      merchant_id: settings.merchant,
      amount: rials(amount),
      authority,
    }),
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  const body = await response.json();
  const reference = body.data?.ref_id;
  if (
    !response.ok ||
    ![100, 101].includes(body.data?.code) ||
    !["number", "string"].includes(typeof reference) ||
    (typeof reference === "number" && !Number.isSafeInteger(reference)) ||
    !/^\d{1,30}$/.test(String(reference))
  )
    throw new Error("Payment not verified");
  return String(reference);
}
