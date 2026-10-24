import "server-only";
import { hasStaffAccess, type StaffAccess } from "./backoffice-permissions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchPattern, type OperationsSection } from "./operations-model";
import { normalizeDigits } from "./registration";

export const operationTables = {
  customers: "crm_customers",
  cases: "crm_cases",
  payments: "crm_payments",
  support: "crm_tickets",
} as const;
export type OperationEntity = keyof typeof operationTables;
export const isOperationEntity = (value: string): value is OperationEntity =>
  Object.hasOwn(operationTables, value);
const selects = {
  customers: "*",
  cases: "*, customer:crm_customers!inner(*)",
  payments: "*, case:crm_cases!inner(*, customer:crm_customers(*))",
  support: "*, customer:crm_customers!inner(*)",
};

/** Bound every list and return its exact count; no sensitive records enter public caches. */
export async function loadOperations(
  client: SupabaseClient,
  section: OperationsSection,
  q = "",
  page = 1,
  status = "",
  customerId = "",
) {
  if (section === "overview") {
    const [summary, cases, activity] = await Promise.all([
      client.rpc("crm_summary"),
      client
        .from("crm_cases")
        .select(selects.cases)
        .order("updated_at", { ascending: false })
        .limit(6),
      client
        .from("crm_activity")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);
    if (summary.error || cases.error || activity.error)
      throw new Error("دریافت نمای عملیاتی انجام نشد.");
    return {
      summary: summary.data,
      rows: cases.data,
      activity: activity.data,
      total: 0,
      page: 1,
    };
  }
  let query = client
    .from(operationTables[section])
    .select(selects[section], { count: "exact" });
  if (q) {
    const field =
      section === "customers"
        ? "search_text"
        : section === "cases"
          ? "customer.search_text"
          : section === "payments"
            ? "reference"
            : "subject";
    const number = normalizeDigits(q).replace(/^(?:YG|TK)-/i, "");
    if ((section === "cases" || section === "support") && /^\d+$/.test(number))
      query = query.eq(
        section === "cases" ? "case_number" : "ticket_number",
        number,
      );
    else query = query.ilike(field, searchPattern(q));
  }
  if (status && section !== "customers")
    query = query.eq(section === "cases" ? "service_status" : "status", status);
  if (customerId && (section === "cases" || section === "support"))
    query = query.eq("customer_id", customerId);
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * 20, page * 20 - 1);
  if (error) throw new Error("دریافت اطلاعات انجام نشد. دوباره تلاش کنید.");
  return { rows: data, activity: [], summary: null, total: count ?? 0, page };
}

/** Detail joins are private and bounded, including immutable timeline and support notes. */
export async function loadOperationDetail(
  client: SupabaseClient,
  entity: OperationEntity,
  id: string,
  access: StaffAccess,
) {
  const { data: record, error } = await client
    .from(operationTables[entity])
    .select(selects[entity])
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("دریافت جزئیات انجام نشد.");
  if (!record) return null;
  const activityField =
    entity === "customers"
      ? "customer_id"
      : entity === "cases"
        ? "case_id"
        : entity === "support"
          ? "ticket_id"
          : null;
  const [events, cases, payments, tickets, messages, financials] =
    await Promise.all([
      activityField
        ? client
            .from("crm_activity")
            .select("*")
            .eq(activityField, id)
            .order("created_at", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [], error: null }),
      entity === "customers"
        ? client
            .from("crm_cases")
            .select(selects.cases)
            .eq("customer_id", id)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [], error: null }),
      entity === "cases"
        ? client
            .from("crm_payments")
            .select("*")
            .eq("case_id", id)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [], error: null }),
      ["customers", "cases"].includes(entity)
        ? client
            .from("crm_tickets")
            .select(selects.support)
            .eq(entity === "cases" ? "case_id" : "customer_id", id)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [], error: null }),
      entity === "support"
        ? client
            .from("crm_ticket_messages")
            .select("*")
            .eq("ticket_id", id)
            .order("created_at", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [], error: null }),
      entity === "cases" && hasStaffAccess(access, "payments")
        ? client.rpc("crm_case_financials", { p_case_id: id })
        : Promise.resolve({ data: null, error: null }),
    ]);
  if (
    [events, cases, payments, tickets, messages, financials].some(
      (result) => result.error,
    )
  )
    throw new Error("دریافت سوابق کامل نشد.");
  return {
    record,
    activity: events.data,
    cases: cases.data,
    payments: payments.data,
    tickets: tickets.data,
    messages: messages.data,
    financials: financials.data,
  };
}
