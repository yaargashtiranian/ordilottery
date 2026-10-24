import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { type CommerceMode } from "./model";

export class GrowthError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** No secret is serialized into public components. A privileged client never accepts a browser JWT. */
export function growthClient() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new GrowthError(
      "ارتباط با سرویس هنوز آماده نیست؛ کمی بعد دوباره تلاش کنید.",
      503,
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        }),
    },
  });
}

/** Order intake and bank charging are independent; only the gateway boundary enables money movement. */
export function commerceMode(): CommerceMode {
  const mode = process.env.COMMERCE_MODE;
  if (
    !process.env.SUPABASE_URL ||
    !(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
  )
    return "disabled";
  if (mode === "simulation" || mode === "sandbox") return mode;
  if (mode === "live") return "live";
  return "disabled";
}
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/** A 256-bit HttpOnly capability scopes anonymous orders/chat to this browser, never to documents. */
export async function guestSession(create = false) {
  const jar = await cookies();
  let token = jar.get("yg_guest")?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    if (!create) return null;
    await limit("session-global", 200, 60);
    token = randomBytes(32).toString("hex");
    jar.set("yg_guest", token, {
      httpOnly: true,
      sameSite: "lax",
      secure:
        process.env.NODE_ENV === "production" &&
        process.env.BACKOFFICE_LOCAL_HTTP !== "true",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return hash(token);
}

/** Database-backed limits survive serverless cold starts; IP/header claims are never trusted as identity. */
export async function limit(key: string, max: number, seconds = 60) {
  const { data, error } = await growthClient().rpc("growth_limit", {
    p_key: hash(key),
    p_max: max,
    p_seconds: seconds,
  });
  if (error) throw new GrowthError("سرویس موقتاً در دسترس نیست.", 503);
  if (!data)
    throw new GrowthError(
      "تعداد درخواست‌ها زیاد است؛ یک دقیقه دیگر تلاش کنید.",
      429,
    );
}

/** Database internals and applicant values never escape in public errors. */
export function databaseError(message?: string): never {
  if (message?.includes("PRICE_CHANGED"))
    throw new GrowthError(
      "قیمت تغییر کرده؛ دوباره خلاصه سفارش را بررسی کنید.",
      409,
    );
  if (message?.includes("COUPON_ALREADY_USED"))
    throw new GrowthError(
      "این کد برای این ایمیل قبلاً استفاده یا رزرو شده است.",
      409,
    );
  if (message?.includes("COUPON_UNAVAILABLE"))
    throw new GrowthError(
      "این کد برای خدمت انتخابی فعال نیست یا ظرفیت آن تکمیل شده است.",
      409,
    );
  if (message?.includes("CONFLICT"))
    throw new GrowthError(
      "اطلاعات این تلاش تغییر کرده است؛ یک سفارش تازه بسازید.",
      409,
    );
  if (message?.includes("EXPIRED"))
    throw new GrowthError(
      "زمان این سفارش آزمایشی تمام شده؛ دوباره شروع کنید.",
      409,
    );
  if (message?.includes("TOO_MANY"))
    throw new GrowthError(
      "چند درخواست باز دارید؛ ابتدا همان درخواست را ادامه دهید.",
      429,
    );
  throw new GrowthError("ثبت اطلاعات کامل نشد؛ دوباره تلاش کنید.", 503);
}
