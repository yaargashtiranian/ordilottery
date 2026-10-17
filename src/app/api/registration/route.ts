import { getCheckoutConfig } from "@/lib/checkout-config";
import { handleRegistration } from "@/lib/checkout";
import { after } from "next/server";
import { getMelipayamakConfig } from "@/lib/melipayamak";
import { notifyRegistration } from "@/lib/registration-notification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Bound the post-response provider/bridge calls on hosts supporting Next after().
export const maxDuration = 30;

/** Keep server-only bindings at the route boundary; never serialize them into JSX. */
export async function POST(request: Request) {
  const wordpress = getCheckoutConfig();
  const sms = getMelipayamakConfig();
  return handleRegistration(
    request,
    wordpress,
    fetch,
    process.env.SITE_URL,
    wordpress && sms
      ? (requestId) => {
          // Next's lifecycle hook keeps work alive after returning the checkout URL.
          after(async () => {
            const outcome = await notifyRegistration(wordpress, sms, requestId);
            // A sanitized operational signal: no recipient, message, ID or credential.
            if (
              outcome.status === "claim_failed" ||
              outcome.status === "record_failed"
            ) {
              console.error("registration_sms_bridge_error", {
                status: outcome.status,
              });
            }
          });
        }
      : undefined,
  );
}
