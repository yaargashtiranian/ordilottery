import { plans } from "@/lib/site";
import { validateRegistration } from "@/lib/registration";
import type { CheckoutConfig } from "@/lib/checkout-config";

const MAX_BODY_BYTES = 8192;
const unavailable =
  "در حال حاضر دریافت درخواست فعال نیست. اطلاعات شما ذخیره نشده و پرداختی انجام نمی‌شود.";

/** Every API response is private, including validation and provider errors. */
function response(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Read incrementally: a forged/missing Content-Length cannot bypass the body cap. */
async function readSmallJson(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES)
    throw new Error("TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_JSON");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error("TOO_LARGE");
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

/** Injectable provider contract for isolated tests; the public route always supplies null. */
export async function handleRegistration(
  request: Request,
  config: CheckoutConfig | null,
  fetcher: typeof fetch = fetch,
  publicSiteUrl?: string,
  onRegistered?: (requestId: string) => void,
) {
  // Next may reconstruct request.url using its bind address (0.0.0.0). Prefer
  // the configured public origin; locally, Host is browser-controlled by URL.
  // Never trust arbitrary forwarded-host/proto headers to authorize a request.
  let expectedOrigin: string;
  try {
    const publicUrl = new URL(publicSiteUrl || request.url);
    if (!publicSiteUrl && request.headers.get("host"))
      publicUrl.host = request.headers.get("host")!;
    expectedOrigin = publicUrl.origin;
  } catch {
    return response({ message: "مبدأ درخواست معتبر نیست." }, 403);
  }
  if (request.headers.get("origin") !== expectedOrigin)
    return response({ message: "مبدأ درخواست معتبر نیست." }, 403);
  // Match the media type, not a prefix such as application/jsonp; permit charset.
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (mediaType !== "application/json")
    return response({ message: "نوع درخواست معتبر نیست." }, 415);
  let raw: unknown;
  try {
    raw = await readSmallJson(request);
  } catch (error) {
    return response(
      { message: "حجم یا ساختار درخواست معتبر نیست." },
      error instanceof Error && error.message === "TOO_LARGE" ? 413 : 400,
    );
  }
  const result = validateRegistration(raw);
  if (!result.valid)
    return response({ message: result.message, fields: result.fields }, 422);
  if (!config)
    return response({ message: unavailable, code: "NOT_CONFIGURED" }, 503);
  const { plan, idempotencyKey, ...applicant } = result.data;
  try {
    // The bridge must persist the request and reuse this key before issuing checkout.
    const upstream = await fetcher(`${config.apiUrl}/requests`, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        applicant,
        plan,
        amount: plans[plan].price,
        currency: "IRT",
        idempotencyKey,
      }),
    });
    if (!upstream.ok)
      return response(
        {
          message:
            "پاسخ سرویس ثبت درخواست دریافت نشد. با همین فرم دوباره تلاش کنید؛ پرداختی از این صفحه انجام نشده است.",
        },
        502,
      );
    const body: unknown = await upstream.json();
    if (!body || typeof body !== "object")
      throw new Error("Invalid bridge response");
    const { requestId, checkoutUrl } = body as Record<string, unknown>;
    if (
      typeof requestId !== "string" ||
      requestId.length < 1 ||
      requestId.length > 128 ||
      typeof checkoutUrl !== "string"
    )
      throw new Error("Invalid bridge response");
    const destination = new URL(checkoutUrl);
    if (
      destination.protocol !== "https:" ||
      destination.username ||
      destination.password ||
      !config.allowedOrigins.includes(destination.origin)
    )
      throw new Error("Unsafe checkout destination");
    // The route schedules notifications after the response; scheduling failure
    // must not invalidate an already persisted request or a valid checkout URL.
    try {
      onRegistered?.(requestId);
    } catch {
      /* Notification failure is independent of checkout. */
    }
    return response({ checkoutUrl: destination.href }, 201);
  } catch {
    // Never return raw provider error bodies, credentials or applicant data to the client.
    return response(
      {
        message:
          "ارتباط کامل نشد. با همین فرم دوباره تلاش کنید. در صورت تداوم، از طریق پشتیبانی پیگیری کنید.",
      },
      502,
    );
  }
}
