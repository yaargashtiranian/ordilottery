import {
  backofficeJson as json,
  isBackofficeOrigin,
  readBackofficeBody,
} from "@/lib/backoffice-request";
import { validateRegistration, validateContact } from "@/lib/registration";
import { isUuid } from "@/lib/operations-model";
import { couponCode, type Order } from "@/lib/growth/model";
import {
  commerceMode,
  databaseError,
  guestSession,
  growthClient,
  GrowthError,
  hash,
  limit,
} from "@/lib/growth/server";
import { gatewaySettings, requestGateway } from "@/lib/growth/zarinpal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const orderFields =
  "id,plan,mode,base_amount,discount_amount,total_amount,currency,status,payment_kind,case_id,created_at,expires_at,authority";

/** Guest capability is always resolved server-side; identifiers alone authorize nothing. */
export async function GET(request: Request) {
  try {
    const guest = await guestSession();
    if (!guest) {
      if (new URL(request.url).searchParams.get("notifications") === "1")
        return json({ unread_count: 0, conversation: null });
      // A first visit has nothing to resume; this optional check is not a failed login.
      if (new URL(request.url).searchParams.get("resume") === "1")
        return json({ order: null });
      return json({ messages: [], conversation: null }, 401);
    }
    await limit(`read:${guest}`, 90);
    const db = growthClient();
    const url = new URL(request.url);
    // Recover an ambiguous/closed-tab checkout using only the owning HttpOnly capability.
    if (url.searchParams.get("resume") === "1") {
      const { data, error } = await db
        .from("growth_orders")
        .select(orderFields)
        .eq("guest_hash", guest)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) databaseError();
      return json({ order: data });
    }
    const orderId = url.searchParams.get("order");
    if (orderId) {
      if (!isUuid(orderId)) return json({ error: "شناسه نامعتبر است." }, 422);
      const { data, error } = await db
        .from("growth_orders")
        .select(orderFields)
        .eq("id", orderId)
        .eq("guest_hash", guest)
        .maybeSingle();
      if (error) databaseError();
      return data
        ? json({ order: data })
        : json({ error: "این سفارش در این مرورگر در دسترس نیست." }, 404);
    }
    const { data, error } = await db.rpc("growth_visitor_chat", {
      p_guest: guest,
      p_messages: url.searchParams.get("notifications") !== "1",
    });
    if (error) databaseError();
    return json(data);
  } catch (error) {
    return failure(error);
  }
}

/** Same-origin bounded writes use durable rate limits, idempotency and authoritative DB pricing. */
export async function POST(request: Request) {
  if (!isBackofficeOrigin(request))
    return json({ error: "مبدأ درخواست معتبر نیست." }, 403);
  const input = await readBackofficeBody(request, 8000);
  if (!input || input.website)
    return json({ error: "اطلاعات معتبر نیست." }, 422);
  try {
    const guest = (await guestSession(true))!;
    await limit(`write:${guest}`, 25);
    const db = growthClient();
    if (input.action === "chat_lead") {
      const result = validateContact(input.lead);
      if (!result.valid)
        return json(
          { error: "اطلاعات تماس را کامل کنید.", fields: result.fields },
          422,
        );
      if (input.consent !== true)
        return json(
          { error: "برای شروع، ذخیره اطلاعات تماس را بپذیرید." },
          422,
        );
      const { data, error } = await db.rpc("growth_set_chat_lead", {
        p_guest: guest,
        p_first_name: result.data.firstName,
        p_last_name: result.data.lastName,
        p_phone: result.data.phone,
      });
      if (error) databaseError(error.message);
      return json({ lead: data });
    }
    if (input.action === "chat_read" || input.action === "chat_read_all") {
      if (
        !Array.isArray(input.ids) ||
        input.ids.length > 100 ||
        !input.ids.every(isUuid)
      )
        return json({ error: "شناسه اعلان معتبر نیست." }, 422);
      const { data, error } = await db.rpc("growth_visitor_read", {
        p_guest: guest,
        p_ids: input.ids,
        p_all: input.action === "chat_read_all",
      });
      if (error) databaseError(error.message);
      return json({ unread_count: data });
    }
    if (input.action === "message") {
      if (
        !isUuid(input.id) ||
        typeof input.body !== "string" ||
        !input.body.trim() ||
        input.body.trim().length > 2000
      )
        throw new GrowthError("متن پیام باید بین ۱ تا ۲۰۰۰ نویسه باشد.", 422);
      const { error } = await db.rpc("growth_send_message", {
        p_guest: guest,
        p_id: input.id,
        p_body: input.body.trim(),
      });
      if (error) databaseError(error.message);
      return json({ ok: true });
    }
    const mode = commerceMode();
    if (mode === "disabled")
      throw new GrowthError(
        "ثبت سفارش هنوز فعال نشده است؛ اطلاعات شما ثبت نشده.",
        503,
      );
    if (input.action === "quote" || input.action === "order") {
      const reserve = input.action === "order";
      let code: string;
      try {
        code = couponCode(input.code ?? "");
      } catch {
        throw new GrowthError("کد تخفیف معتبر نیست.", 422);
      }
      const validation = reserve ? validateRegistration(input) : null;
      if (validation && !validation.valid)
        return json(
          { error: validation.message, fields: validation.fields },
          422,
        );
      if (
        !["online", "inperson"].includes(String(input.plan)) ||
        (reserve && input.consent !== true)
      )
        throw new GrowthError("خدمت و پذیرش شرایط را بررسی کنید.", 422);
      const applicant = validation?.valid
        ? {
            firstName: validation.data.firstName,
            lastName: validation.data.lastName,
            email: validation.data.email.toLowerCase(),
            phone: validation.data.phone,
          }
        : {};
      const { data, error } = await db.rpc("growth_checkout", {
        p_id: reserve ? input.idempotencyKey : crypto.randomUUID(),
        p_guest: guest,
        p_hash: hash(
          JSON.stringify({ applicant, plan: input.plan, code, mode }),
        ),
        p_applicant: applicant,
        p_plan: input.plan,
        p_code: code,
        p_mode: mode,
        p_reserve: reserve,
        p_expected: reserve ? input.expectedTotal : null,
      });
      if (error) databaseError(error.message);
      if (!reserve) return json({ quote: data });
      let order = data as Order;
      if (order.total_amount === 0 && order.status !== "completed") {
        const completion = await db.rpc("growth_complete", {
          p_id: order.id,
          p_kind: "discount",
        });
        if (completion.error) databaseError(completion.error.message);
        order = completion.data;
      }
      return json({ order, next: `/checkout/${order.id}` });
    }
    if (input.action === "pay" || input.action === "simulate") {
      if (!isUuid(input.id)) throw new GrowthError("سفارش معتبر نیست.", 422);
      const { data: order, error } = await db
        .from("growth_orders")
        .select(orderFields)
        .eq("id", input.id)
        .eq("guest_hash", guest)
        .maybeSingle();
      if (error) databaseError();
      if (!order) throw new GrowthError("سفارش پیدا نشد.", 404);
      if (order.mode !== mode)
        throw new GrowthError(
          "حالت سرویس تغییر کرده؛ با پشتیبانی تماس بگیرید.",
          409,
        );
      if (order.status === "completed")
        return json({ next: `/checkout/${order.id}` });
      if (input.action === "simulate") {
        if (order.mode !== "simulation")
          throw new GrowthError("این عملیات فقط در شبیه‌ساز مجاز است.", 403);
        if (input.outcome === "cancel") {
          const result = await db
            .from("growth_orders")
            .update({ status: "cancelled" })
            .eq("id", order.id)
            .eq("status", "pending");
          if (result.error) databaseError();
        } else if (input.outcome === "success") {
          const result = await db.rpc("growth_complete", {
            p_id: order.id,
            p_kind: "simulation",
          });
          if (result.error) databaseError(result.error.message);
        } else throw new GrowthError("نتیجه نامعتبر است.", 422);
        return json({ next: `/checkout/${order.id}` });
      }
      const gateway = gatewaySettings(mode);
      if (!gateway)
        throw new GrowthError(
          "درگاه هنوز آماده نیست. سفارش حفظ شده و پرداختی انجام نشده است.",
          503,
        );
      if (order.authority)
        return json({ next: `${gateway.start}${order.authority}` });
      // Compare-and-set prevents duplicate gateway creation across simultaneous button clicks.
      const claimed = await db
        .from("growth_orders")
        .update({ status: "initiating" })
        .eq("id", order.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (claimed.error) databaseError();
      if (!claimed.data)
        throw new GrowthError(
          "وضعیت ارتباط قبلی با درگاه در حال بررسی است؛ با پشتیبانی تماس بگیرید.",
          409,
        );
      try {
        const authority = await requestGateway(
          gateway,
          order.id,
          order.total_amount,
        );
        const saved = await db
          .from("growth_orders")
          .update({ authority, status: "redirected" })
          .eq("id", order.id)
          .eq("status", "initiating")
          .select("id")
          .single();
        if (saved.error) throw new Error();
        return json({ next: `${gateway.start}${authority}` });
      } catch {
        throw new GrowthError(
          "نتیجه ارتباط با درگاه مشخص نیست؛ سفارش محفوظ است. برای بررسی با پشتیبانی تماس بگیرید.",
          503,
        );
      }
    }
    throw new GrowthError("عملیات پشتیبانی نمی‌شود.", 422);
  } catch (error) {
    return failure(error);
  }
}

/** Keep validation messages useful while suppressing credentials and raw provider responses. */
function failure(error: unknown) {
  return json(
    {
      error:
        error instanceof GrowthError
          ? error.message
          : "ارتباط کامل نشد؛ دوباره تلاش کنید.",
    },
    error instanceof GrowthError ? error.status : 503,
  );
}
