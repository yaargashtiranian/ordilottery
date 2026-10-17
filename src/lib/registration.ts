import { plans, type PlanId } from "@/lib/site";

export type Applicant = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};
export type FieldErrors = Partial<Record<keyof Applicant, string>>;
export type Registration = Applicant & { plan: PlanId; idempotencyKey: string };
export type ValidationResult =
  | { valid: true; data: Registration }
  | { valid: false; fields: FieldErrors; message: string };

/** Iranian keyboards can emit two digit sets; normalize before phone validation. */
export function normalizeDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
}

/** This four-field contract is shared by the browser and the authoritative API. */
export function validateRegistration(value: unknown): ValidationResult {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { valid: false, fields: {}, message: "اطلاعات فرم معتبر نیست." };
  const input = value as Record<string, unknown>;
  const string = (key: string) =>
    typeof input[key] === "string" ? (input[key] as string).trim() : "";
  const data = {
    firstName: string("firstName").replace(/\s+/g, " "),
    lastName: string("lastName").replace(/\s+/g, " "),
    email: string("email"),
    phone: normalizeDigits(string("phone"))
      .replace(/[\s()-]/g, "")
      .replace(/^(?:\+98|0098)/, "0"),
    plan: string("plan") as PlanId,
    idempotencyKey: string("idempotencyKey"),
  };
  const fields: FieldErrors = {};
  // Unicode letters accommodate Persian and international names without accepting markup.
  const namePattern = /^[\p{L}\p{M}\s\u200c'’.-]+$/u;
  for (const field of ["firstName", "lastName"] as const) {
    if (
      data[field].length < 2 ||
      data[field].length > 80 ||
      !namePattern.test(data[field]) ||
      // Separators and combining marks are allowed only alongside a real letter.
      !/\p{L}/u.test(data[field])
    )
      fields[field] =
        field === "firstName"
          ? "نام را با ۲ تا ۸۰ حرف وارد کنید."
          : "نام خانوادگی را با ۲ تا ۸۰ حرف وارد کنید.";
  }
  if (data.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
    fields.email = "یک آدرس ایمیل معتبر وارد کنید.";
  if (!/^09\d{9}$/.test(data.phone))
    fields.phone = "شماره موبایل ایران را با ۱۱ رقم وارد کنید.";
  if (Object.keys(fields).length)
    return {
      valid: false,
      fields,
      message: "لطفاً موارد مشخص‌شده را اصلاح کنید.",
    };
  if (
    !Object.hasOwn(plans, data.plan) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      data.idempotencyKey,
    )
  )
    return {
      valid: false,
      fields: {},
      message: "درخواست معتبر نیست؛ صفحه را تازه کنید و دوباره تلاش کنید.",
    };
  return { valid: true, data };
}
