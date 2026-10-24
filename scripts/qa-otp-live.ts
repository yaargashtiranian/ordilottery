import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import {
  otpConfig,
  otpPhoneKey,
  otpDigest,
  sendMelipayamakOtp,
} from "../src/lib/melipayamak-otp";

/** Explicitly opt-in smoke test: exactly one SMS to the owner-supplied phone, no Auth account or order creation. */
async function main() {
  const phone = process.env.QA_OTP_PHONE;
  assert.ok(
    phone && /^09\d{9}$/.test(phone),
    "Set QA_OTP_PHONE to the explicitly authorized test phone",
  );
  const config = otpConfig();
  assert.ok(config, "OTP bindings unavailable");
  const db = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const guest = randomBytes(32).toString("hex");
  let id: string | undefined;
  try {
    const claim = await db.rpc("growth_mobile_start", {
      p_guest: guest,
      p_profile: {
        firstName: "آزمون",
        lastName: "پیامک",
        email: `qa-otp-${guest.slice(0, 12)}@example.invalid`,
        phone,
      },
      p_phone_key: otpPhoneKey(config, phone),
    });
    if (claim.error) throw new Error("Durable OTP claim failed");
    id = claim.data;
    const sent = await sendMelipayamakOtp(config, phone);
    console.log(`OTP provider outcome: ${sent.status}`);
    const saved = await db.rpc("growth_mobile_finish", {
      p_guest: guest,
      p_id: id,
      p_state: sent.status,
      p_hash:
        sent.status === "accepted"
          ? otpDigest(config, guest, id!, sent.code)
          : null,
    });
    if (saved.error || !saved.data)
      throw new Error(
        "OTP send-result persistence failed; no automatic resend",
      );
    assert.equal(
      sent.status,
      "accepted",
      "Provider did not accept the test send; no automatic resend",
    );
    if (sent.status !== "accepted") return;
    const other = await db.rpc("growth_mobile_verify", {
      p_guest: randomBytes(32).toString("hex"),
      p_id: id,
      p_hash: otpDigest(config, guest, id!, sent.code),
    });
    assert.equal(other.error, null);
    assert.equal(other.data, false);
    const valid = await db.rpc("growth_mobile_verify", {
      p_guest: guest,
      p_id: id,
      p_hash: otpDigest(config, guest, id!, sent.code),
    });
    assert.equal(valid.error, null);
    assert.equal(valid.data, true);
    const replay = await db.rpc("growth_mobile_verify", {
      p_guest: guest,
      p_id: id,
      p_hash: otpDigest(config, guest, id!, sent.code),
    });
    assert.equal(replay.error, null);
    assert.equal(replay.data, false);
    console.log(
      "PASS one real provider send accepted, durable hash verification, cross-browser denial and one-time consumption; handset delivery is separate",
    );
  } finally {
    if (id) {
      const result = await db
        .from("growth_phone_otps")
        .delete()
        .eq("challenge_id", id);
      if (result.error) throw new Error("OTP fixture cleanup failed");
    }
    const check = await db
      .from("growth_identity_checks")
      .delete()
      .eq("guest_hash", guest);
    if (check.error) throw new Error("Identity fixture cleanup failed");
    console.log(
      "Synthetic OTP verification fixtures removed; no account/order was created",
    );
  }
}
main().catch(() => {
  console.error(
    "Live OTP smoke test failed; no automatic retry or extra SMS was sent",
  );
  process.exitCode = 1;
});
