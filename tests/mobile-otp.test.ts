import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  otpConfig,
  otpDigest,
  normalizeOtp,
  otpPhoneKey,
  sendMelipayamakOtp,
} from "../src/lib/melipayamak-otp";
import {
  testOtpAllowed,
  isInternalPhoneEmail,
} from "../src/lib/customer-verification";
import { growthDatabase } from "./helpers/growth-db";
const config = { token: "a".repeat(32), hashSecret: "b".repeat(64) };
const profile = {
  firstName: "مشتری",
  lastName: "آزمایشی",
  phone: "09000000000",
  email: "otp@example.invalid",
};
let db: Awaited<ReturnType<typeof growthDatabase>>;
before(async () => {
  db = await growthDatabase();
});
after(async () => {
  await db?.close();
});
function start(guest: string, phone = profile.phone) {
  return db
    .query<{ id: string }>("select growth_mobile_start($1,$2,$3) id", [
      guest,
      { ...profile, phone },
      otpPhoneKey(config, phone),
    ])
    .then((r) => r.rows[0].id);
}
function finish(guest: string, id: string, code = "0741437414") {
  return db
    .query<{ ok: boolean }>(
      "select growth_mobile_finish($1,$2,'accepted',$3) ok",
      [guest, id, otpDigest(config, guest, id, code)],
    )
    .then((r) => r.rows[0].ok);
}
function verify(guest: string, id: string, code: string) {
  return db
    .query<{ ok: boolean }>("select growth_mobile_verify($1,$2,$3) ok", [
      guest,
      id,
      otpDigest(config, guest, id, code),
    ])
    .then((r) => r.rows[0].ok);
}
test("real OTP configuration disables fixed-code fallback and binds digest to browser and challenge", () => {
  assert.equal(otpConfig({}), null);
  assert.deepEqual(
    otpConfig({
      ENABLE_MELIPAYAMAK_OTP: "true",
      MELIPAYAMAK_OTP_TOKEN: config.token,
      OTP_HASH_SECRET: config.hashSecret,
    }),
    config,
  );
  assert.equal(
    testOtpAllowed("http://localhost:3000", {
      ENABLE_TEST_OTP: "true",
      ENABLE_MELIPAYAMAK_OTP: "true",
    }),
    false,
  );
  assert.equal(normalizeOtp("۰۷۴۱۴۳۷۴۱۴"), "0741437414");
  assert.notEqual(
    otpDigest(config, "x", "y", "123456"),
    otpDigest(config, "z", "y", "123456"),
  );
  assert.ok(isInternalPhoneEmail("phone-random@phone-login.invalid"));
});
test("Console API sends only the normalized recipient and preserves ten-digit codes/leading zeroes", async () => {
  let calls = 0;
  const result = await sendMelipayamakOtp(
    config,
    profile.phone,
    async (url, init) => {
      calls++;
      assert.equal(
        String(url),
        `https://console.melipayamak.com/api/send/otp/${config.token}`,
      );
      assert.equal(init?.redirect, "error");
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), { to: profile.phone });
      return Response.json({ code: "0741437414", status: "" });
    },
  );
  assert.deepEqual(result, { status: "accepted", code: "0741437414" });
  assert.equal(calls, 1);
});
test("provider errors, malformed responses and uncertain sends never retry or leak diagnostics", async () => {
  assert.deepEqual(
    await sendMelipayamakOtp(config, profile.phone, async () =>
      Response.json({ status: "requires provider approval" }, { status: 400 }),
    ),
    { status: "rejected" },
  );
  const responses = [
    Response.json({ code: "123456", status: "private provider error" }),
    Response.json({ code: 0 }),
    Response.json({ code: Number.MAX_SAFE_INTEGER + 1 }),
    new Response("<html>private</html>"),
    new Response("x".repeat(5000)),
    new Response("private", { status: 500 }),
  ];
  for (const response of responses) {
    let calls = 0;
    const result = await sendMelipayamakOtp(config, profile.phone, async () => {
      calls++;
      return response;
    });
    assert.notEqual(result.status, "accepted");
    assert.equal(calls, 1);
    assert.ok(!JSON.stringify(result).includes("private"));
  }
  let called = false;
  assert.deepEqual(
    await sendMelipayamakOtp(config, "invalid", async () => {
      called = true;
      throw new Error();
    }),
    { status: "rejected" },
  );
  assert.equal(called, false);
  assert.deepEqual(
    await sendMelipayamakOtp(config, profile.phone, async () => {
      throw new Error(config.token);
    }),
    { status: "unknown" },
  );
});
test("durable phone cooldown is shared across browsers; provider acceptance alone cannot verify", async () => {
  const guest = "1".repeat(64),
    id = await start(guest);
  await assert.rejects(start("2".repeat(64)), /OTP_COOLDOWN/);
  assert.equal(await verify(guest, id, "0741437414"), false);
  assert.equal(await finish(guest, id), true);
  assert.equal(await finish(guest, id), false);
  const bypass = await db.query<{ ok: boolean }>(
    "select growth_identity_attempt($1,$2,true,'mobile') ok",
    [guest, id],
  );
  assert.equal(bypass.rows[0].ok, false);
  assert.equal(await verify("2".repeat(64), id, "0741437414"), false);
  assert.equal(await verify(guest, id, "123456"), false);
  assert.equal(await verify(guest, id, "0741437414"), true);
  assert.equal(await verify(guest, id, "0741437414"), false);
  const row = (
    await db.query<{ code_hash: string | null; attempts: number }>(
      "select * from growth_phone_otps where challenge_id=$1",
      [id],
    )
  ).rows[0];
  assert.equal(row.code_hash, null);
  assert.equal(row.attempts, 2);
  const claim = (email: string) =>
    db
      .query<{ ok: boolean }>(
        "select growth_mobile_registration_claim($1,$2,$3) ok",
        [guest, email, profile.phone],
      )
      .then((r) => r.rows[0].ok);
  assert.equal(await claim("other@example.invalid"), false);
  assert.equal(await claim(profile.email), true);
  assert.equal(await claim(profile.email), false);
});
test("five wrong attempts, expiry and replacement invalidate codes permanently", async () => {
  const guest = "3".repeat(64),
    id = await start(guest, "09000000001");
  await finish(guest, id);
  for (let i = 0; i < 5; i++)
    assert.equal(await verify(guest, id, "000000"), false);
  assert.equal(await verify(guest, id, "0741437414"), false);
  const expiredGuest = "4".repeat(64),
    expired = await start(expiredGuest, "09000000002");
  await finish(expiredGuest, expired);
  await db.query(
    "update growth_phone_otps set expires_at=now()-interval '1 second' where challenge_id=$1",
    [expired],
  );
  assert.equal(await verify(expiredGuest, expired, "0741437414"), false);
  const replacedGuest = "5".repeat(64),
    old = await start(replacedGuest, "09000000003");
  await finish(replacedGuest, old);
  await db.query("select growth_identity_start($1,$2,'email')", [
    replacedGuest,
    profile,
  ]);
  assert.equal(await verify(replacedGuest, old, "0741437414"), false);
});
test("unknown sends retain cooldown, and codes plus verification RPCs remain service-only", async () => {
  const guest = "6".repeat(64),
    id = await start(guest, "09000000004");
  await db.query("select growth_mobile_finish($1,$2,'unknown',null)", [
    guest,
    id,
  ]);
  await assert.rejects(start("7".repeat(64), "09000000004"), /OTP_COOLDOWN/);
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(
      db.query("select * from growth_phone_otps"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select growth_mobile_verify($1,$2,$3)", [
        guest,
        id,
        "a".repeat(64),
      ]),
      /permission denied/,
    );
    await db.exec("reset role");
  }
});
test("real phone aliases resolve only after phone confirmation, never grant document or staff access", async () => {
  const uid = randomUUID(),
    email = `phone-${uid}@phone-login.invalid`;
  await db.query(
    "insert into auth.users(id,email,phone,email_confirmed_at) values($1,$2,'989000000005',now())",
    [uid, email],
  );
  assert.equal(
    (
      await db.query<{ value: string | null }>(
        "select growth_test_login('+989000000005') value",
      )
    ).rows[0].value,
    null,
  );
  await db.query("update auth.users set phone_confirmed_at=now() where id=$1", [
    uid,
  ]);
  assert.equal(
    (
      await db.query<{ value: string }>(
        "select growth_test_login('+989000000005') value",
      )
    ).rows[0].value,
    email,
  );
  await assert.rejects(
    db.query(
      "insert into cms_editors(email,permissions) values($1,array['users'])",
      [email],
    ),
    /staff_no_phone_alias/,
  );
  const customer = randomUUID(),
    cid = randomUUID();
  await db.query(
    "insert into crm_customers(id,first_name,last_name,email,phone) values($1,'Test','Customer',$2,'09000000005')",
    [customer, email],
  );
  await db.query(
    "insert into crm_cases(id,customer_id,plan,quoted_amount) values($1,$2,'online',100)",
    [cid, customer],
  );
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: uid, email, role: "authenticated" }),
  ]);
  await db.exec("set role authenticated");
  assert.equal(
    (await db.query("select * from crm_document_access")).rows.length,
    0,
  );
  await db.exec("reset role");
});
