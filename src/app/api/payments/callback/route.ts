import { growthClient } from "@/lib/growth/server";
import {
  gatewaySettings,
  isAuthority,
  verifyGateway,
} from "@/lib/growth/zarinpal";
import { isUuid } from "@/lib/operations-model";

/** External callbacks need no guest cookie; viewing the result still requires the owning cookie. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("order");
  const authority = url.searchParams.get("Authority");
  if (!isUuid(id) || !isAuthority(authority))
    return new Response("Invalid callback", { status: 400 });
  let result = "pending";
  try {
    const db = growthClient();
    const { data: order, error } = await db
      .from("growth_orders")
      .select("id,mode,authority,status,total_amount")
      .eq("id", id)
      .eq("authority", authority)
      .maybeSingle();
    if (error || !order) return new Response("Not found", { status: 404 });
    if (order.status === "completed") result = "complete";
    else {
      const gateway = gatewaySettings(order.mode);
      if (!gateway) throw new Error();
      const reference = await verifyGateway(
        gateway,
        authority,
        order.total_amount,
      );
      const completion = await db.rpc("growth_complete", {
        p_id: id,
        p_kind: "zarinpal",
        p_reference: reference,
      });
      if (completion.error) throw new Error();
      result = "complete";
    }
  } catch {
    /* Uncertain payments stay reserved for reconciliation; redirects never prove success. */
  }
  const target = new URL(`/checkout/${id}`, process.env.SITE_URL || url.origin);
  target.searchParams.set("verification", result);
  return new Response(null, {
    status: 303,
    headers: {
      Location: target.href,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
