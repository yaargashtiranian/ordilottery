import { validateRegistration, normalizeDigits } from "./registration";
import { plans } from "./site";

export const sections = {
  overview: "نمای عملیاتی",
  cases: "پرونده‌ها",
  customers: "مشتریان",
  payments: "سوابق پرداخت",
  support: "پشتیبانی",
} as const;
export type OperationsSection = keyof typeof sections;
export const serviceStatuses = {
  new: "جدید",
  in_progress: "در حال انجام",
  ready: "آماده تکمیل",
  completed: "خدمت تکمیل‌شده",
  cancelled: "لغوشده",
} as const;
export const reviewStatuses = {
  not_received: "مدارک دریافت نشده",
  in_review: "در حال بررسی",
  needs_correction: "نیازمند اصلاح",
  approved: "بررسی تأییدشده",
} as const;
export const priorities = { low: "کم", normal: "عادی", high: "بالا" } as const;
export const ticketStatuses = {
  open: "باز",
  in_progress: "در حال رسیدگی",
  waiting_customer: "منتظر مشتری",
  resolved: "بسته‌شده",
} as const;
export const paymentStatuses = {
  recorded: "رسید ثبت‌شده",
  pending: "در انتظار تطبیق",
  failed: "ناموفق گزارش‌شده",
  refunded: "بازپرداخت ثبت‌شده",
} as const;
export const channels = {
  phone: "تلفن",
  messenger: "پیام‌رسان",
  email: "ایمیل",
  internal: "داخلی",
} as const;
export type Customer = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  notes: string;
  revision: number;
  created_at: string;
  updated_at: string;
};
export type CaseRecord = {
  id: string;
  case_number: number;
  customer_id: string;
  customer?: Customer;
  plan: keyof typeof plans;
  cycle: string | null;
  quoted_amount: number;
  currency: "IRT";
  service_status: keyof typeof serviceStatuses;
  review_status: keyof typeof reviewStatuses;
  priority: keyof typeof priorities;
  assigned_to: string;
  follow_up_on: string | null;
  last_note: string;
  revision: number;
  created_at: string;
  updated_at: string;
};
export type PaymentRecord = {
  id: string;
  case_id: string;
  case?: CaseRecord;
  amount: number;
  reference: string;
  status: keyof typeof paymentStatuses;
  source: "manual";
  gateway_verified: false;
  notes: string;
  created_at: string;
};
export type TicketRecord = {
  id: string;
  ticket_number: number;
  customer_id: string;
  case_id: string | null;
  customer?: Customer;
  subject: string;
  channel: keyof typeof channels;
  priority: keyof typeof priorities;
  status: keyof typeof ticketStatuses;
  revision: number;
  created_at: string;
  updated_at: string;
};
export type Activity = {
  id: number;
  customer_id: string;
  case_id: string | null;
  ticket_id: string | null;
  kind: string;
  label: string;
  details: Record<string, unknown>;
  created_at: string;
};
export type TicketMessage = {
  id: string;
  ticket_id: string;
  body: string;
  created_at: string;
};
export type Summary = {
  customers: number;
  cases: number;
  active_cases: number;
  needs_review: number;
  open_tickets: number;
  recorded_amount: number;
};
export type OperationRecord =
  Customer | CaseRecord | PaymentRecord | TicketRecord;
export type OperationDetail = {
  financials: { net_recorded: number; receipt_count: number } | null;
  record: OperationRecord;
  activity: Activity[];
  cases: CaseRecord[];
  payments: PaymentRecord[];
  tickets: TicketRecord[];
  messages: TicketMessage[];
};
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
const inSet = (value: unknown, set: object): value is string =>
  typeof value === "string" && Object.hasOwn(set, value);
const text = (
  input: Record<string, unknown>,
  key: string,
  max: number,
  required = false,
) => {
  const value = input[key] === undefined ? "" : input[key];
  if (
    typeof value !== "string" ||
    value.trim().length > max ||
    (required && !value.trim())
  )
    throw new Error(
      "اطلاعات فرم معتبر نیست؛ فیلدهای الزامی و طول متن را بررسی کنید.",
    );
  return value.trim();
};

/** Only explicit server-owned fields cross the API; prices never come from the browser. */
export function validateOperation(
  entity: string,
  input: Record<string, unknown>,
  update = false,
): Record<string, unknown> {
  if (
    update &&
    (!Number.isSafeInteger(input.revision) || Number(input.revision) < 1)
  )
    throw new Error("نسخه رکورد معتبر نیست.");
  if (!update && !isUuid(input.id))
    throw new Error("شناسه درخواست معتبر نیست.");
  const base = update
    ? { revision: Number(input.revision) + 1 }
    : { id: input.id };
  if (entity === "customers") {
    const result = validateRegistration({
      ...input,
      plan: "online",
      idempotencyKey: update
        ? "00000000-0000-4000-8000-000000000001"
        : input.id,
    });
    if (!result.valid)
      throw new Error(Object.values(result.fields).join(" ") || result.message);
    const { firstName, lastName, email, phone } = result.data;
    return {
      ...base,
      first_name: firstName,
      last_name: lastName,
      email: email.toLowerCase(),
      phone,
      notes: text(input, "notes", 2000),
    };
  }
  if (entity === "cases") {
    if (update) {
      if (
        !inSet(input.service_status, serviceStatuses) ||
        !inSet(input.review_status, reviewStatuses) ||
        !inSet(input.priority, priorities)
      )
        throw new Error("وضعیت پرونده معتبر نیست.");
      if (
        ["ready", "completed"].includes(String(input.service_status)) &&
        input.review_status !== "approved"
      )
        throw new Error(
          "برای آماده یا تکمیل شدن خدمت، بررسی مدارک باید تأیید شده باشد.",
        );
      const date = text(input, "follow_up_on", 10);
      if (
        date &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !Number.isFinite(Date.parse(date)) ||
          new Date(date).toISOString().slice(0, 10) !== date)
      )
        throw new Error("تاریخ پیگیری معتبر نیست.");
      return {
        ...base,
        service_status: input.service_status,
        review_status: input.review_status,
        priority: input.priority,
        assigned_to: text(input, "assigned_to", 80),
        follow_up_on: date || null,
        last_note: text(input, "note", 2000, true),
      };
    }
    if (!isUuid(input.customer_id) || !inSet(input.plan, plans))
      throw new Error("مشتری یا بسته خدمات معتبر نیست.");
    const plan = input.plan as keyof typeof plans;
    return {
      ...base,
      customer_id: input.customer_id,
      plan,
      cycle: text(input, "cycle", 30) || null,
      quoted_amount: plans[plan].price,
      currency: "IRT",
      last_note: text(input, "note", 2000),
    };
  }
  if (entity === "payments" && !update) {
    const amount =
      typeof input.amount === "string"
        ? Number(
            normalizeDigits(input.amount)
              .replaceAll(",", "")
              .replaceAll("٬", ""),
          )
        : input.amount;
    if (
      !isUuid(input.case_id) ||
      !Number.isSafeInteger(amount) ||
      Number(amount) <= 0 ||
      Number(amount) > 10_000_000_000 ||
      !inSet(input.status, paymentStatuses)
    )
      throw new Error(
        "پرونده، مبلغ صحیح به تومان و وضعیت پرداخت را بررسی کنید.",
      );
    const reference = text(input, "reference", 100, true);
    if (reference.length < 3) throw new Error("شناسه رسید حداقل ۳ نویسه است.");
    return {
      ...base,
      case_id: input.case_id,
      amount,
      currency: "IRT",
      reference,
      status: input.status,
      source: "manual",
      gateway_verified: false,
      notes: text(input, "notes", 2000),
    };
  }
  if (entity === "support") {
    if (update) {
      if (
        !inSet(input.status, ticketStatuses) ||
        !inSet(input.priority, priorities)
      )
        throw new Error("وضعیت پشتیبانی معتبر نیست.");
      return { ...base, status: input.status, priority: input.priority };
    }
    if (
      !isUuid(input.customer_id) ||
      (input.case_id && !isUuid(input.case_id)) ||
      !inSet(input.channel, channels) ||
      !inSet(input.priority, priorities)
    )
      throw new Error("مشتری، پرونده یا کانال پشتیبانی معتبر نیست.");
    const subject = text(input, "subject", 160, true);
    if (subject.length < 3) throw new Error("موضوع حداقل ۳ نویسه است.");
    return {
      p_id: input.id,
      p_customer_id: input.customer_id,
      p_case_id: input.case_id || null,
      p_subject: subject,
      p_channel: input.channel,
      p_priority: input.priority,
      p_body: text(input, "body", 4000, true),
    };
  }
  if (entity === "notes" && !update) {
    if (!isUuid(input.ticket_id))
      throw new Error("درخواست پشتیبانی معتبر نیست.");
    return {
      p_id: input.id,
      p_ticket_id: input.ticket_id,
      p_body: text(input, "body", 4000, true),
    };
  }
  throw new Error("عملیات پشتیبانی نمی‌شود.");
}

/** Escape SQL LIKE wildcards while keeping Persian text and punctuation searchable. */
export function searchPattern(value: string) {
  return "%" + normalizeDigits(value.trim()).replace(/[\\%_]/g, "\\$&") + "%";
}
export function fullName(customer?: Customer) {
  return customer
    ? `${customer.first_name} ${customer.last_name}`
    : "مشتری نامشخص";
}
export const money = (value: number) =>
  new Intl.NumberFormat("fa-IR").format(value);
export const recordDate = (value: string) =>
  new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeZone: "Asia/Tehran",
  }).format(new Date(value));
