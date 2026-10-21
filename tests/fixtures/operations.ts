import type {
  Customer,
  CaseRecord,
  PaymentRecord,
  TicketRecord,
  Activity,
  TicketMessage,
  OperationsSection,
} from "../../src/lib/operations-model";

// Synthetic browser fixtures stay outside Supabase and never represent actual applicants.
const stamp = "2026-10-21T10:00:00Z";
export const fixtureCustomers: Customer[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    first_name: "مشتری",
    last_name: "آزمایشی",
    email: "customer@example.invalid",
    phone: "09000000000",
    notes: "نمونه آزمایشی رابط کاربری",
    revision: 1,
    created_at: stamp,
    updated_at: stamp,
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    first_name: "مخاطب",
    last_name: "نمونه",
    email: "another@example.invalid",
    phone: "09000000001",
    notes: "",
    revision: 1,
    created_at: stamp,
    updated_at: stamp,
  },
];
export const fixtureCases: CaseRecord[] = [
  {
    id: "20000000-0000-4000-8000-000000000001",
    case_number: 1042,
    customer_id: fixtureCustomers[0].id,
    customer: fixtureCustomers[0],
    plan: "online",
    cycle: null,
    quoted_amount: 1499000,
    currency: "IRT",
    service_status: "in_progress",
    review_status: "needs_correction",
    priority: "high",
    assigned_to: "تیم بررسی",
    follow_up_on: "2026-10-22",
    last_note: "نیاز به اصلاح اطلاعات برای ادامه بررسی.",
    revision: 1,
    created_at: stamp,
    updated_at: stamp,
  },
  {
    id: "20000000-0000-4000-8000-000000000002",
    case_number: 1043,
    customer_id: fixtureCustomers[1].id,
    customer: fixtureCustomers[1],
    plan: "inperson",
    cycle: null,
    quoted_amount: 2999000,
    currency: "IRT",
    service_status: "new",
    review_status: "not_received",
    priority: "normal",
    assigned_to: "",
    follow_up_on: null,
    last_note: "",
    revision: 1,
    created_at: stamp,
    updated_at: stamp,
  },
];
export const fixturePayments: PaymentRecord[] = [
  {
    id: "50000000-0000-4000-8000-000000000001",
    case_id: fixtureCases[0].id,
    case: fixtureCases[0],
    amount: 1000000,
    reference: "TEST-RECEIPT-1042",
    status: "recorded",
    source: "manual",
    gateway_verified: false,
    notes: "رسید ساختگی برای بررسی رابط؛ تراکنشی انجام نشده است.",
    created_at: stamp,
  },
];
export const fixtureTickets: TicketRecord[] = [
  {
    id: "30000000-0000-4000-8000-000000000001",
    ticket_number: 52,
    customer_id: fixtureCustomers[0].id,
    customer: fixtureCustomers[0],
    case_id: fixtureCases[0].id,
    subject: "پیگیری اصلاح اطلاعات پرونده",
    channel: "phone",
    priority: "normal",
    status: "in_progress",
    revision: 1,
    created_at: stamp,
    updated_at: stamp,
  },
];
export const fixtureMessages: TicketMessage[] = [
  {
    id: "60000000-0000-4000-8000-000000000001",
    ticket_id: fixtureTickets[0].id,
    body: "مشتری درباره قدم بعدی و اصلاح اطلاعات سؤال داشت. پیگیری در تماس بعدی انجام شود.",
    created_at: stamp,
  },
];
export const fixtureActivity: Activity[] = [
  {
    id: 1,
    customer_id: fixtureCustomers[0].id,
    case_id: fixtureCases[0].id,
    ticket_id: null,
    kind: "crm_cases",
    label: "وضعیت پرونده به‌روز شد",
    details: {
      service_status: "in_progress",
      review_status: "needs_correction",
      note: "راهنمای اصلاح اطلاعات به کارشناس ارجاع شد.",
    },
    created_at: stamp,
  },
  {
    id: 2,
    customer_id: fixtureCustomers[0].id,
    case_id: fixtureCases[0].id,
    ticket_id: fixtureTickets[0].id,
    kind: "crm_tickets",
    label: "درخواست پشتیبانی ایجاد شد",
    details: {},
    created_at: stamp,
  },
];
export function fixturePayload(section: OperationsSection) {
  const rows =
    section === "customers"
      ? fixtureCustomers
      : section === "payments"
        ? fixturePayments
        : section === "support"
          ? fixtureTickets
          : fixtureCases;
  return {
    rows,
    activity: fixtureActivity,
    total: rows.length,
    page: 1,
    summary: {
      customers: fixtureCustomers.length,
      cases: fixtureCases.length,
      active_cases: fixtureCases.length,
      needs_review: fixtureCases.length,
      open_tickets: fixtureTickets.length,
      recorded_amount: fixturePayments.reduce(
        (sum, payment) => sum + payment.amount,
        0,
      ),
    },
  };
}
