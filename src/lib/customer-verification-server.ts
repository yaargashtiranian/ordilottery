import "server-only";
import { createBackofficeClient } from "./backoffice-auth";
import { isInternalPhoneEmail } from "./customer-verification";
import { guestSession, growthClient, databaseError } from "./growth/server";

/** Only a genuine Supabase-confirmed email can finish an email challenge; phone test checks never call this. */
export async function finishEmailCheck() {
  const guest = await guestSession();
  if (!guest) return false;
  const db = growthClient();
  const current = await db.rpc("growth_identity_current", { p_guest: guest });
  if (current.error) databaseError();
  const check = current.data;
  if (!check || check.channel !== "email") return false;
  const client = await createBackofficeClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (
    error ||
    !user?.email_confirmed_at ||
    isInternalPhoneEmail(user.email) ||
    user.email?.toLowerCase() !== check.profile.email
  )
    return false;
  const result = await db.rpc("growth_identity_attempt", {
    p_guest: guest,
    p_id: check.challenge,
    p_valid: true,
    p_method: "email",
  });
  if (result.error) databaseError();
  return result.data === true;
}
