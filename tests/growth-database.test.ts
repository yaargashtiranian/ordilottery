import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { growthDatabase } from "./helpers/growth-db";
let db: Awaited<ReturnType<typeof growthDatabase>>;
before(async () => {
  db = await growthDatabase();
});
after(async () => {
  await db?.close();
});
const guest = "a".repeat(64);
const otherGuest = "b".repeat(64);
const applicant = {
  firstName: "سارا",
  lastName: "ایرانی",
  email: "sara@example.invalid",
  phone: "09000000000",
};

/** Helpers invoke the actual migration RPCs; assertions focus on business invariants and grants. */
async function campaign(
  code: string,
  percent = 100,
  max = 1,
  mode = "simulation",
) {
  const result = await db.query<{ id: string }>(
    `insert into growth_campaigns(code,name,percent,max_uses,starts_at,ends_at,plan,mode) values($1,'کمپین تست',$2,$3,now()-interval '1 hour',now()+interval '1 day','all',$4) returning id`,
    [code, percent, max, mode],
  );
  return result.rows[0].id;
}
async function order(
  code: string,
  opts: {
    id?: string;
    guest?: string;
    email?: string;
    hash?: string;
    mode?: string;
    expected?: number;
    reserve?: boolean;
  } = {},
) {
  const result = await db.query<{
    result: {
      id: string;
      status: string;
      total_amount: number;
      discount_amount: number;
      case_id: string | null;
    };
  }>(`select growth_checkout($1,$2,$3,$4,'online',$5,$6,$7,$8) as result`, [
    opts.id || randomUUID(),
    opts.guest || guest,
    opts.hash || "unchanged",
    { ...applicant, email: opts.email || applicant.email },
    code,
    opts.mode || "simulation",
    opts.reserve !== false,
    opts.expected ?? 0,
  ]);
  return result.rows[0].result;
}
const complete = (id: string, kind = "discount") =>
  db.query(`select growth_complete($1,$2,null)`, [id, kind]);

test("100% discount bypasses payment, completes exactly once and simulation creates no CRM records", async () => {
  await campaign("FREE100");
  const created = await order("FREE100");
  assert.equal(Number(created.total_amount), 0);
  await complete(created.id);
  await complete(created.id);
  assert.equal((await db.query(`select * from crm_cases`)).rows.length, 0);
  assert.equal(
    (
      await db.query(
        `select * from growth_orders where id=$1 and payment_kind='discount' and status='completed'`,
        [created.id],
      )
    ).rows.length,
    1,
  );
  await assert.rejects(
    order("FREE100", { guest: otherGuest, email: "different@example.invalid" }),
    /COUPON_UNAVAILABLE/,
  );
});
test("partial discount preserves exact integer price and cannot be completed as free", async () => {
  await campaign("HALF50", 50, 10);
  const created = await order("HALF50", { expected: 749500 });
  assert.equal(Number(created.total_amount), 749500);
  assert.equal(Number(created.discount_amount), 749500);
  await assert.rejects(complete(created.id), /INVALID/);
  await complete(created.id, "simulation");
});
test("idempotency returns same snapshot, rejects owner and input conflicts", async () => {
  await campaign("RETRY100", 100, 10);
  const id = randomUUID();
  const one = await order("RETRY100", { id });
  const two = await order("RETRY100", { id });
  assert.deepEqual(one, two);
  await assert.rejects(
    order("RETRY100", { id, guest: otherGuest }),
    /CONFLICT/,
  );
  await assert.rejects(
    order("RETRY100", { id, hash: "different" }),
    /CONFLICT/,
  );
  await complete(id);
});
test("one normalized email cannot redeem again through another browser", async () => {
  await campaign("EMAIL100", 100, 10);
  const one = await order("EMAIL100");
  await complete(one.id);
  await assert.rejects(
    order("EMAIL100", {
      guest: otherGuest,
      email: applicant.email.toUpperCase(),
    }),
    /COUPON_ALREADY_USED/,
  );
});
test("reserved last slot is unavailable, simulation expiry releases it and late completion fails", async () => {
  await campaign("LAST100");
  const one = await order("LAST100");
  await assert.rejects(
    order("LAST100", { guest: otherGuest, email: "other@example.invalid" }),
    /COUPON_UNAVAILABLE/,
  );
  await db.query(
    `update growth_orders set expires_at=now()-interval '1 second' where id=$1`,
    [one.id],
  );
  const two = await order("LAST100", {
    guest: otherGuest,
    email: "other@example.invalid",
  });
  await assert.rejects(complete(one.id), /EXPIRED/);
  await complete(two.id);
});
test("gateway reservations never expire merely because the browser went away", async () => {
  await campaign("BANK50", 50, 1, "sandbox");
  const one = await order("BANK50", { mode: "sandbox", expected: 749500 });
  await db.query(
    `update growth_orders set expires_at=now()-interval '1 day' where id=$1`,
    [one.id],
  );
  await assert.rejects(
    order("BANK50", { mode: "sandbox", expected: 749500, guest: otherGuest }),
    /COUPON_UNAVAILABLE/,
  );
  await assert.rejects(complete(one.id, "simulation"), /INVALID/);
});
test("quote does not consume capacity; expired, paused, plan and mode mismatches are rejected", async () => {
  const id = await campaign("QUOTE10", 10);
  const quote = await order("QUOTE10", { reserve: false });
  assert.equal(Number(quote.total_amount), 1349100);
  assert.equal(
    (await db.query(`select * from growth_orders where campaign_id=$1`, [id]))
      .rows.length,
    0,
  );
  await db.query(`update growth_campaigns set plan='inperson' where id=$1`, [
    id,
  ]);
  await assert.rejects(
    order("QUOTE10", { reserve: false }),
    /COUPON_UNAVAILABLE/,
  );
  await db.query(
    `update growth_campaigns set plan='all',active=false where id=$1`,
    [id],
  );
  await assert.rejects(
    order("QUOTE10", { reserve: false }),
    /COUPON_UNAVAILABLE/,
  );
  await db.query(
    `update growth_campaigns set active=true,starts_at=now()-interval '2 days',ends_at=now()-interval '1 day' where id=$1`,
    [id],
  );
  await assert.rejects(
    order("QUOTE10", { reserve: false }),
    /COUPON_UNAVAILABLE/,
  );
  await assert.rejects(
    order("BANK50", { reserve: false }),
    /COUPON_UNAVAILABLE/,
  );
});
test("stale price consent rolls back before reserving capacity", async () => {
  const id = await campaign("PRICE25", 25, 5);
  await assert.rejects(order("PRICE25", { expected: 1 }), /PRICE_CHANGED/);
  assert.equal(
    (await db.query(`select * from growth_orders where campaign_id=$1`, [id]))
      .rows.length,
    0,
  );
});
test("live free order creates one new case with intake closed, never a forged bank receipt", async () => {
  await campaign("REAL100", 100, 5, "live");
  const one = await order("REAL100", { mode: "live" });
  await complete(one.id);
  await complete(one.id);
  const rows = (
    await db.query<{ enabled: boolean }>(
      `select a.enabled from crm_document_access a join growth_orders o on o.case_id=a.case_id where o.id=$1`,
      [one.id],
    )
  ).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].enabled, false);
  const financial = (
    await db.query<{
      result: { discount_amount: number; gateway_amount: number };
    }>(
      `select crm_case_financials(case_id) result from growth_orders where id=$1`,
      [one.id],
    )
  ).rows[0].result;
  assert.equal(Number(financial.discount_amount), 1499000);
  assert.equal(Number(financial.gateway_amount), 0);
  assert.equal((await db.query(`select * from crm_payments`)).rows.length, 0);
});
test("visitor chat retries are idempotent and cross-conversation message ids conflict", async () => {
  const id = randomUUID();
  const send = (owner: string, body = "سلام") =>
    db.query("select growth_send_message($1,$2,$3)", [owner, id, body]);
  await send(guest);
  await send(guest);
  assert.equal(
    (await db.query("select * from growth_messages where id=$1", [id])).rows
      .length,
    1,
  );
  await assert.rejects(send(otherGuest), /CONFLICT/);
  await assert.rejects(send(guest, "متفاوت"), /CONFLICT/);
});
test("durable rate limiting rejects overflow and resets expired windows", async () => {
  assert.equal(
    (await db.query<{ ok: boolean }>(`select growth_limit('test',1,60) ok`))
      .rows[0].ok,
    true,
  );
  assert.equal(
    (await db.query<{ ok: boolean }>(`select growth_limit('test',1,60) ok`))
      .rows[0].ok,
    false,
  );
  await db.exec(
    `update growth_rate_limits set expires_at=now()-interval '1 second' where key='test'`,
  );
  assert.equal(
    (await db.query<{ ok: boolean }>(`select growth_limit('test',1,60) ok`))
      .rows[0].ok,
    true,
  );
});
test("RLS rejects anonymous and customer access, and staff cannot mutate order/payment economics", async () => {
  await db.exec(`set role anon`);
  await assert.rejects(
    db.query("select * from growth_orders"),
    /permission denied/,
  );
  await assert.rejects(
    order("FREE100", { reserve: false }),
    /permission denied/,
  );
  await db.exec(`reset role; set role authenticated`);
  assert.equal((await db.query("select * from growth_orders")).rows.length, 0);
  await assert.rejects(
    db.query(`update growth_orders set total_amount=0`),
    /permission denied/,
  );
  await assert.rejects(
    db.query(`select growth_staff_reply($1,$2,'spoof',false)`, [
      randomUUID(),
      randomUUID(),
    ]),
    /FORBIDDEN/,
  );
  await db.exec("reset role");
});
test("verified allowlisted staff can reply and close; unverified staff cannot", async () => {
  const uid = randomUUID();
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
    [uid, "staff@example.invalid"],
  );
  await db.query("insert into cms_editors(email) values($1)", [
    "staff@example.invalid",
  ]);
  const cid = (
    await db.query<{ id: string }>(
      "select id from growth_conversations where guest_hash=$1",
      [guest],
    )
  ).rows[0].id;
  await db.query(`select set_config('request.jwt.claims',$1,false)`, [
    JSON.stringify({
      sub: uid,
      email: "staff@example.invalid",
      role: "authenticated",
    }),
  ]);
  await db.exec("set role authenticated");
  assert.ok((await db.query("select * from growth_orders")).rows.length > 0);
  const mid = randomUUID();
  await db.query(`select growth_staff_reply($1,$2,'پاسخ تیم',true)`, [
    cid,
    mid,
  ]);
  await db.query(`select growth_staff_reply($1,$2,'پاسخ تیم',true)`, [
    cid,
    mid,
  ]);
  assert.equal(
    (await db.query("select * from growth_messages where id=$1", [mid])).rows
      .length,
    1,
  );
  assert.equal(
    (
      await db.query<{ status: string }>(
        "select status from growth_conversations where id=$1",
        [cid],
      )
    ).rows[0].status,
    "closed",
  );
  await assert.rejects(
    db.query(`update growth_campaigns set percent=99`),
    /permission denied/,
  );
  await db.exec("reset role");
  await db.query("update auth.users set email_confirmed_at=null where id=$1", [
    uid,
  ]);
  await db.exec("set role authenticated");
  assert.equal((await db.query("select * from growth_orders")).rows.length, 0);
  await db.exec("reset role");
});
