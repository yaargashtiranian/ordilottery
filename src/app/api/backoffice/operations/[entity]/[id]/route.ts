import { getBackofficeSession } from "@/lib/backoffice-auth";
import {
  backofficeJson,
  isBackofficeOrigin,
  readBackofficeBody,
} from "@/lib/backoffice-request";
import {
  isOperationEntity,
  loadOperationDetail,
  operationTables,
} from "@/lib/operations-data";
import { isUuid, validateOperation } from "@/lib/operations-model";

/** Record IDs are locators only; membership and RLS still authorize each detail read. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  const { entity, id } = await params;
  if (!isOperationEntity(entity) || !isUuid(id))
    return backofficeJson({ error: "رکورد پیدا نشد." }, 404);
  try {
    const session = await getBackofficeSession(entity);
    if (!session)
      return backofficeJson({ error: "دسترسی مدیریت لازم است." }, 401);
    const data = await loadOperationDetail(
      session.client,
      entity,
      id,
      session.access,
    );
    return data
      ? backofficeJson(data)
      : backofficeJson({ error: "رکورد پیدا نشد." }, 404);
  } catch {
    return backofficeJson({ error: "دریافت جزئیات انجام نشد." }, 503);
  }
}

/** Accounting receipts/history are immutable; only contacts, case states and tickets can change. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  if (!isBackofficeOrigin(request))
    return backofficeJson({ error: "مبدأ درخواست معتبر نیست." }, 403);
  const { entity, id } = await params;
  if (!isOperationEntity(entity) || entity === "payments" || !isUuid(id))
    return backofficeJson({ error: "ویرایش این رکورد مجاز نیست." }, 404);
  try {
    const session = await getBackofficeSession(entity);
    if (!session)
      return backofficeJson({ error: "دسترسی مدیریت لازم است." }, 401);
    const input = await readBackofficeBody(request, 24000);
    if (!input) return backofficeJson({ error: "ساختار فرم معتبر نیست." }, 400);
    let payload: Record<string, unknown>;
    try {
      payload = validateOperation(entity, input, true);
    } catch (error) {
      return backofficeJson(
        {
          error: error instanceof Error ? error.message : "اطلاعات معتبر نیست.",
        },
        422,
      );
    }
    const { data, error } = await session.client
      .from(operationTables[entity])
      .update(payload)
      .eq("id", id)
      .eq("revision", input.revision)
      .select("*")
      .maybeSingle();
    if (error)
      return backofficeJson(
        { error: "ذخیره انجام نشد؛ دوباره تلاش کنید." },
        503,
      );
    if (!data)
      return backofficeJson(
        {
          error:
            "نسخه جدیدتری ثبت شده است؛ جزئیات را دوباره بارگذاری کنید. متن شما حفظ شده است.",
        },
        409,
      );
    return backofficeJson({ record: data });
  } catch {
    return backofficeJson(
      { error: "ارتباط برقرار نشد؛ ذخیره تأیید نشده است." },
      503,
    );
  }
}
