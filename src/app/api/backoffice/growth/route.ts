import { getBackofficeSession } from "@/lib/backoffice-auth";
import {
  backofficeJson as json,
  isBackofficeOrigin,
  readBackofficeBody,
} from "@/lib/backoffice-request";
import { validateCampaign } from "@/lib/growth/model";
import { isUuid } from "@/lib/operations-model";

/** Staff-only bounded lists reuse authenticated RLS; no service-role key is used in backoffice. */
export async function GET(request: Request) {
  try {
    const session = await getBackofficeSession();
    if (!session) return json({ error: "ورود مدیریت لازم است." }, 401);
    const { client } = session;
    const url = new URL(request.url);
    const section = url.searchParams.get("section");
    const id = url.searchParams.get("id");
    if (section === "notifications") {
      const result = await client.rpc("growth_staff_notifications");
      if (result.error) throw new Error();
      return json(result.data);
    }
    const page = Math.floor(
      Math.min(10000, Math.max(1, Number(url.searchParams.get("page")) || 1)),
    );
    if (section === "chat" && id) {
      if (!isUuid(id)) return json({ error: "شناسه نامعتبر است." }, 422);
      const result = await client.rpc("growth_staff_chat", {
        p_conversation: id,
      });
      if (result.error) throw new Error();
      return json(result.data);
    }
    const table =
      section === "campaigns"
        ? "growth_campaigns"
        : section === "orders"
          ? "growth_orders"
          : section === "chat"
            ? "growth_chat_inbox"
            : null;
    if (!table) return json({ error: "بخش نامعتبر است." }, 422);
    const fields =
      section === "orders"
        ? "id,plan,mode,campaign_id,base_amount,discount_amount,total_amount,status,payment_kind,provider_ref,case_id,created_at,applicant"
        : section === "chat"
          ? "id,status,created_at,updated_at,first_name,last_name,phone,unread_count"
          : "*";
    const result = await client
      .from(table)
      .select(fields, { count: "exact" })
      .order(section === "chat" ? "updated_at" : "created_at", {
        ascending: false,
      })
      .order("id")
      .range((page - 1) * 25, page * 25 - 1);
    if (result.error) throw new Error();
    const stats =
      section === "campaigns"
        ? await client.rpc("growth_campaign_stats", {
            p_ids: result.data.map(
              (row) => (row as unknown as { id: string }).id,
            ),
          })
        : null;
    if (stats?.error) throw new Error();
    return json({
      rows: result.data,
      total: result.count,
      stats: stats?.data || [],
    });
  } catch {
    return json(
      { error: "دریافت اطلاعات انجام نشد؛ اتصال و migration را بررسی کنید." },
      503,
    );
  }
}

/** Immutable campaign terms and idempotent replies make retries safe for staff. */
export async function POST(request: Request) {
  if (!isBackofficeOrigin(request))
    return json({ error: "مبدأ نامعتبر است." }, 403);
  const input = await readBackofficeBody(request, 8000);
  if (!input) return json({ error: "فرم معتبر نیست." }, 422);
  try {
    const session = await getBackofficeSession();
    if (!session) return json({ error: "ورود مدیریت لازم است." }, 401);
    let result;
    if (
      input.action === "chat_read" ||
      input.action === "notifications_read_all"
    ) {
      if (
        input.action === "chat_read" &&
        (!Array.isArray(input.ids) ||
          input.ids.length > 100 ||
          !input.ids.every(isUuid))
      )
        return json({ error: "شناسه اعلان معتبر نیست." }, 422);
      result = await session.client.rpc("growth_staff_read", {
        p_ids: input.action === "notifications_read_all" ? null : input.ids,
      });
    } else if (input.action === "campaign") {
      let data;
      try {
        data = validateCampaign(input);
      } catch (error) {
        return json(
          { error: error instanceof Error ? error.message : "فرم معتبر نیست." },
          422,
        );
      }
      if (!isUuid(input.id)) return json({ error: "شناسه معتبر نیست." }, 422);
      // Explicit identity preserves ambiguous retries; a changed body with the same id never overwrites economics.
      result = await session.client
        .from("growth_campaigns")
        .insert({ ...data, id: input.id })
        .select("id")
        .single();
      if (result.error?.code === "23505") {
        const previous = await session.client
          .from("growth_campaigns")
          .select("*")
          .eq("id", input.id)
          .maybeSingle();
        if (
          !previous.error &&
          previous.data &&
          Object.entries(data).every(([key, value]) =>
            key.endsWith("_at")
              ? Date.parse(previous.data[key]) === Date.parse(String(value))
              : previous.data[key] === value,
          )
        )
          return json({ ok: true });
        return json(
          {
            error:
              "این کد قبلاً ثبت شده؛ برای کمپین جدید کد دیگری انتخاب کنید.",
          },
          409,
        );
      }
    } else if (
      input.action === "toggle" &&
      isUuid(input.id) &&
      typeof input.active === "boolean"
    ) {
      result = await session.client
        .from("growth_campaigns")
        .update({ active: input.active })
        .eq("id", input.id)
        .select("id")
        .single();
    } else if (
      input.action === "reply" &&
      isUuid(input.id) &&
      isUuid(input.conversation) &&
      typeof input.body === "string" &&
      input.body.trim().length <= 2000 &&
      (input.body.trim() || input.close === true)
    ) {
      result = await session.client.rpc("growth_staff_reply", {
        p_conversation: input.conversation,
        p_id: input.id,
        p_body: input.body.trim(),
        p_close: input.close === true,
      });
    } else return json({ error: "اطلاعات معتبر نیست." }, 422);
    if (result.error) throw new Error();
    return json({ ok: true });
  } catch {
    return json({ error: "ذخیره انجام نشد؛ دوباره تلاش کنید." }, 503);
  }
}
