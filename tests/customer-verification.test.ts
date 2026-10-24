import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { growthDatabase } from "./helpers/growth-db";
import {
  customerProfile,
  customerIdentifier,
  testCodeMatches,
  testOtpAllowed,
} from "../src/lib/customer-verification";
let db: Awaited<ReturnType<typeof growthDatabase>>;
before(async () => {
  db = await growthDatabase();
});
after(async () => {
  await db?.close();
});
const profile = {
  firstName: "مشتری",
  lastName: "آزمایشی",
  email: "new@example.invalid",
  phone: "09000000000",
};
const guest = "e".repeat(64),
  other = "f".repeat(64);
async function start(owner = guest, channel = "test_phone") {
  return (
    await db.query<{ id: string }>(
      "select growth_identity_start($1,$2,$3) id",
      [owner, profile, channel],
    )
  ).rows[0].id;
}
async function confirm(
  id: string,
  valid: boolean | null,
  owner = guest,
  method = "test_phone",
) {
  return (
    await db.query<{ ok: boolean }>(
      "select growth_identity_attempt($1,$2,$3,$4) ok",
      [owner, id, valid, method],
    )
  ).rows[0].ok;
}
async function checkout(
  owner = guest,
  email = profile.email,
  phone = profile.phone,
) {
  return db.query(
    "select growth_checkout($1,$2,'test',$3,'online','','simulation',true,1499000)",
    [randomUUID(), owner, { ...profile, email, phone }],
  );
}

test("fixed code is confined to explicit local testing, including Persian digits", () => {
  assert.equal(testCodeMatches("۱۲۳۴۵۶"), true);
  assert.equal(testCodeMatches("000000"), false);
  assert.equal(testCodeMatches(123456), false);
  assert.equal(
    testOtpAllowed("http://localhost:3000", {
      ENABLE_TEST_OTP: "true",
      NODE_ENV: "development",
    }),
    true,
  );
  assert.equal(
    testOtpAllowed("http://127.0.0.1:3200", {
      ENABLE_TEST_OTP: "true",
      NODE_ENV: "production",
      BACKOFFICE_LOCAL_HTTP: "true",
    }),
    true,
  );
  for (const origin of [
    "https://example.com",
    "https://localhost.evil.test",
    "invalid",
  ])
    assert.equal(
      testOtpAllowed(origin, {
        ENABLE_TEST_OTP: "true",
        NODE_ENV: "development",
      }),
      false,
    );
  assert.equal(
    testOtpAllowed("http://localhost:3000", {
      ENABLE_TEST_OTP: "true",
      NODE_ENV: "production",
    }),
    false,
  );
  assert.equal(testOtpAllowed("http://localhost:3000", {}), false);
  assert.deepEqual(customerIdentifier("+۹۸ (۹۰۰) ۰۰۰-۰۰۰۰"), {
    phone: "+989000000000",
  });
  assert.deepEqual(customerIdentifier(" New@Example.invalid "), {
    email: "new@example.invalid",
  });
  assert.equal(customerProfile({ ...profile, email: "bad" }), null);
});
test("new-contact checkout cannot bypass the atomic verification guard", async () => {
  await assert.rejects(checkout(), /CONTACT_VERIFICATION_REQUIRED/);
  const challenge = await start();
  assert.equal(await confirm(challenge, false), false);
  assert.equal(await confirm(challenge, true, other), false);
  assert.equal(await confirm(challenge, true, guest, "email"), false);
  assert.equal(await confirm(challenge, true), true);
  await assert.rejects(checkout(other), /CONTACT_VERIFICATION_REQUIRED/);
  await assert.rejects(
    checkout(guest, "different@example.invalid", "09000000001"),
    /CONTACT_VERIFICATION_REQUIRED/,
  );
  await checkout();
  assert.equal(
    (
      await db.query<{ method: string }>(
        "select contact_check method from growth_orders",
      )
    ).rows[0].method,
    "test_phone",
  );
  // Matching either existing contact is a submission shortcut, never an account/record-access credential.
  await checkout(other, "different@example.invalid");
  assert.equal(
    (
      await db.query<{ method: string }>(
        "select contact_check method from growth_orders where guest_hash=$1",
        [other],
      )
    ).rows[0].method,
    "existing",
  );
});
test("five failed attempts, expiry, and replaced challenges cannot be reused", async () => {
  const challenge = await start();
  for (let i = 0; i < 5; i++)
    assert.equal(await confirm(challenge, false), false);
  assert.equal(await confirm(challenge, true), false);
  let next = await start();
  assert.equal(await confirm(challenge, true), false);
  assert.equal(await confirm(next, null), false);
  await db.query(
    "update growth_identity_checks set expires_at=now()-interval '1 second' where guest_hash=$1",
    [guest],
  );
  assert.equal(await confirm(next, true), false);
  next = await start();
  assert.equal(await confirm(next, true), true);
  assert.equal(await confirm(next, true), true);
});
test("an unconfirmed Auth email cannot turn a new contact into a verified registration", async () => {
  const email = "pending@example.invalid",
    phone = "09000000002";
  const uid = randomUUID();
  await db.query("insert into auth.users(id,email) values($1,$2)", [
    uid,
    email,
  ]);
  await assert.rejects(
    checkout(other, email, phone),
    /CONTACT_VERIFICATION_REQUIRED/,
  );
  await db.query("update auth.users set email_confirmed_at=now() where id=$1", [
    uid,
  ]);
  await checkout(other, email, phone);
});
test("checks and private presence lookup have no public/customer access", async () => {
  try {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(
        db.query("select * from growth_identity_checks"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select growth_identity_start($1,$2,'test_phone')", [
          guest,
          profile,
        ]),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select growth_identity_attempt($1,$2,true,'email')", [
          guest,
          randomUUID(),
        ]),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select growth_private.customer_known($1,$2)", [
          profile.email,
          profile.phone,
        ]),
        /permission denied/,
      );
      await db.exec("reset role");
    }
  } finally {
    await db.exec("reset role");
  }
});

test("reserved test identities cannot read even an invitation addressed to their internal login", async () => {
  const uid = randomUUID(),
    alias = `mock-${randomUUID()}@local-otp.invalid`;
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,$2,now(),$3)",
    [uid, alias, { identity_assurance: "test_phone" }],
  );
  const customer = (
    await db.query<{ id: string }>(
      "insert into crm_customers(first_name,last_name,email,phone) values('مشتری','آزمایشی',$1,'09000000003') returning id",
      [alias],
    )
  ).rows[0].id;
  await db.query(
    "insert into crm_cases(customer_id,plan,quoted_amount) values($1,'online',1499000)",
    [customer],
  );
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: uid,
      email: alias,
      role: "authenticated",
      app_metadata: { identity_assurance: "test_phone" },
    }),
  ]);
  try {
    await db.exec("set role authenticated");
    assert.equal(
      (await db.query("select * from crm_document_access")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select growth_test_login('+989000000003')"),
      /permission denied/,
    );
  } finally {
    await db.exec("reset role");
  }
});
