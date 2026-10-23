/** Same-origin JSON boundary with a bounded wait; messages never enter analytics or persistent browser storage. */
export async function experience(input: Record<string, unknown>) {
  const response = await fetch("/api/experience", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "ارتباط کامل نشد؛ دوباره تلاش کنید.");
  return data;
}

/** Defense in depth against a compromised response: only our result routes and fixed provider hosts. */
export function followCheckout(next: string) {
  if (/^\/checkout\/[a-f0-9-]{36}$/.test(next)) {
    window.location.assign(next);
    return;
  }
  const url = new URL(next);
  if (
    url.protocol !== "https:" ||
    !["www.zarinpal.com", "sandbox.zarinpal.com"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    !/^\/pg\/StartPay\/[AS][A-Za-z0-9]{35}$/.test(url.pathname)
  )
    throw new Error("آدرس درگاه معتبر نیست.");
  window.location.assign(url.href);
}

/** Optional analytics integration receives only an enumerated step, never personal data or coupon text. */
export function journeyEvent(step: "plan" | "contact" | "review" | "complete") {
  window.dispatchEvent(
    new CustomEvent(step === "complete" ? "journey_complete" : "journey_step", {
      detail: { step },
    }),
  );
}
