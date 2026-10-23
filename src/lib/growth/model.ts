import { normalizeDigits } from "@/lib/registration";
import { type PlanId } from "@/lib/site";

export type CommerceMode = "disabled" | "simulation" | "sandbox" | "live";
export type Quote = {
  base_amount: number;
  discount_amount: number;
  total_amount: number;
  currency: "IRT";
  percent: number;
  mode: CommerceMode;
};
export type Order = Quote & {
  id: string;
  plan: PlanId;
  status: "pending" | "initiating" | "redirected" | "completed" | "cancelled";
  payment_kind: string | null;
  authority: string | null;
  case_id: string | null;
  created_at: string;
  expires_at: string;
};
export type Campaign = {
  id: string;
  code: string;
  name: string;
  channel: string;
  notes: string;
  percent: number;
  max_uses: number;
  starts_at: string;
  ends_at: string;
  plan: "all" | PlanId;
  mode: Exclude<CommerceMode, "disabled">;
  active: boolean;
};
export type ChatMessage = {
  id: string;
  sender: "visitor" | "staff";
  body: string;
  created_at: string;
};
export type Conversation = {
  id: string;
  status: "waiting" | "replied" | "closed";
  updated_at: string;
  created_at: string;
};

/** Coupon codes are ASCII, normalized once on both sides; no customer identity is encoded. */
export function couponCode(value: unknown) {
  if (typeof value !== "string") throw new Error("کد تخفیف معتبر نیست.");
  const code = normalizeDigits(value).trim().toUpperCase();
  if (code && !/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code))
    throw new Error("کد تخفیف باید ۳ تا ۳۲ حرف یا عدد انگلیسی باشد.");
  return code;
}

/** Immutable campaign economics make past orders auditable; edits are limited to activation. */
export function validateCampaign(input: Record<string, unknown>) {
  const code = couponCode(input.code);
  const text = (key: string, max: number, min = 0) => {
    const value = typeof input[key] === "string" ? input[key].trim() : "";
    if (value.length < min || value.length > max)
      throw new Error("نام و مشخصات کمپین را بررسی کنید.");
    return value;
  };
  const percent = Number(normalizeDigits(String(input.percent)));
  const max_uses = Number(normalizeDigits(String(input.max_uses)));
  const starts_at = text("starts_at", 40, 1);
  const ends_at = text("ends_at", 40, 1);
  if (
    !code ||
    !Number.isInteger(percent) ||
    percent < 1 ||
    percent > 100 ||
    !Number.isInteger(max_uses) ||
    max_uses < 1 ||
    max_uses > 1_000_000 ||
    !Number.isFinite(Date.parse(starts_at)) ||
    !Number.isFinite(Date.parse(ends_at)) ||
    Date.parse(ends_at) <= Date.parse(starts_at) ||
    !["all", "online", "inperson"].includes(String(input.plan)) ||
    !["simulation", "sandbox", "live"].includes(String(input.mode))
  )
    throw new Error("درصد، سقف استفاده، بازه زمانی و نوع کمپین را بررسی کنید.");
  return {
    code,
    name: text("name", 100, 2),
    channel: text("channel", 100),
    notes: text("notes", 1000),
    percent,
    max_uses,
    starts_at: new Date(starts_at).toISOString(),
    ends_at: new Date(ends_at).toISOString(),
    plan: input.plan,
    mode: input.mode,
  };
}

/** This assistant offers bounded product guidance, not eligibility or immigration advice. */
export const assistantTopics = [
  {
    question: "از کجا شروع کنم؟",
    answer:
      "از «مسیر من را بساز» شروع کن؛ روش همراهی را انتخاب می‌کنی، چهار اطلاعات تماس می‌دهی و قبل از هر پرداخت، قیمت نهایی را می‌بینی.",
  },
  {
    question: "آنلاین یا حضوری؟",
    answer:
      "آنلاین برای پیگیری تلفنی و پیام‌رسان است. در خدمت حضوری، اسکن مدارک هم با کمک متخصص انجام می‌شود. هماهنگی و هزینه عکاسی جداگانه است.",
  },
  {
    question: "ثبت‌نام رسمی شروع شده؟",
    answer:
      "تاریخ این دوره هنوز در سایت تأیید نشده است. درخواست خدمات ما به معنی ثبت در سامانه رسمی DV نیست. خبر قطعی باید از منبع رسمی بررسی شود.",
  },
  {
    question: "کد تخفیف چطور کار می‌کند؟",
    answer:
      "در مرحله مرور سفارش کدت را وارد کن. اعتبار و ظرفیت آن همان لحظه بررسی می‌شود. با تخفیف ۱۰۰٪ نیازی به درگاه نیست؛ برای باقی مبلغ به مرحله پرداخت می‌روی.",
  },
  {
    question: "مدارکم را کجا بفرستم؟",
    answer:
      "مدارک هویتی را در چت نفرست. پس از فعال‌سازی پرونده توسط کارشناس، با ایمیل تأییدشده وارد پرتال می‌شوی و از بخش خصوصی مدارک استفاده می‌کنی.",
  },
] as const;
