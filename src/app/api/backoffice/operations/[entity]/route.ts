import { getBackofficeSession } from "@/lib/backoffice-auth";
import {
  backofficeJson,
  isBackofficeOrigin,
  readBackofficeBody,
} from "@/lib/backoffice-request";
import {
  isOperationEntity,
  loadOperations,
  operationTables,
} from "@/lib/operations-data";
import {
  validateOperation,
  isUuid,
  serviceStatuses,
  ticketStatuses,
  paymentStatuses,
} from "@/lib/operations-model";

/** Lists/counts require verified administrator membership; query size is always bounded. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ entity: string }> },
) {
  const { entity } = await params;
  if (entity !== "overview" && !isOperationEntity(entity))
    return backofficeJson({ error: "بخش پیدا نشد." }, 404);
  try {
    const session = await getBackofficeSession(entity);
    if (!session)
      return backofficeJson({ error: "دسترسی مدیریت لازم است." }, 401);
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") || 1);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const status = url.searchParams.get("status") ?? "";
    const customerId = url.searchParams.get("customer_id") ?? "";
    const states =
      entity === "cases"
        ? serviceStatuses
        : entity === "support"
          ? ticketStatuses
          : paymentStatuses;
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 100000 ||
      q.length > 100 ||
      (status && !Object.hasOwn(states, status)) ||
      (customerId && !isUuid(customerId))
    )
      return backofficeJson({ error: "فیلتر معتبر نیست." }, 400);
    return backofficeJson(
      await loadOperations(session.client, entity, q, page, status, customerId),
    );
  } catch {
    return backofficeJson(
      { error: "ارتباط با اطلاعات عملیاتی برقرار نشد." },
      503,
    );
  }
}

/** Stable client IDs make unknown-network-result retries idempotent rather than duplicating records. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ entity: string }> },
) {
  if (!isBackofficeOrigin(request))
    return backofficeJson({ error: "مبدأ درخواست معتبر نیست." }, 403);
  const { entity } = await params;
  if (!isOperationEntity(entity) && entity !== "notes")
    return backofficeJson({ error: "بخش پیدا نشد." }, 404);
  try {
    const session = await getBackofficeSession(
      entity === "notes" ? "support" : entity,
    );
    if (!session)
      return backofficeJson({ error: "دسترسی مدیریت لازم است." }, 401);
    const input = await readBackofficeBody(request, 24000);
    if (!input)
      return backofficeJson({ error: "ساختار یا حجم فرم معتبر نیست." }, 400);
    let payload: Record<string, unknown>;
    try {
      payload = validateOperation(entity, input);
    } catch (error) {
      return backofficeJson(
        {
          error: error instanceof Error ? error.message : "اطلاعات معتبر نیست.",
        },
        422,
      );
    }
    if (entity === "support" || entity === "notes") {
      const { data, error } = await session.client.rpc(
        entity === "support" ? "crm_create_ticket" : "crm_add_ticket_note",
        payload,
      );
      if (error)
        return backofficeJson(
          {
            error:
              error.code === "23505"
                ? "شناسه قبلاً با محتوای دیگری ثبت شده است."
                : "ثبت انجام نشد؛ ارتباط مشتری و پرونده را هم بررسی کنید.",
          },
          error.code === "23505" ? 409 : 422,
        );
      return backofficeJson({ record: data }, 201);
    }
    const table = operationTables[entity];
    const { data, error } = await session.client
      .from(table)
      .insert(payload)
      .select("*")
      .single();
    if (error?.code === "23505") {
      const { data: previous } = await session.client
        .from(table)
        .select("*")
        .eq("id", payload.id)
        .maybeSingle();
      if (
        previous &&
        Object.entries(payload).every(([key, value]) => previous[key] === value)
      )
        return backofficeJson({ record: previous });
      return backofficeJson(
        {
          error: "شناسه رسید یا درخواست تکراری است؛ رکورد قبلی را بررسی کنید.",
        },
        409,
      );
    }
    if (error)
      return backofficeJson(
        { error: "ثبت انجام نشد؛ اطلاعات و ارتباط رکوردها را بررسی کنید." },
        422,
      );
    return backofficeJson({ record: data }, 201);
  } catch {
    return backofficeJson(
      {
        error:
          "ثبت تأیید نشد؛ فرم را نگه دارید و دوباره با همین درخواست تلاش کنید.",
      },
      503,
    );
  }
}
