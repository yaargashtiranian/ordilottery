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
const guest = "c".repeat(64),
  other = "d".repeat(64);
const staffIds = [randomUUID(), randomUUID()];

/** Real migrations enforce ownership and independent receipts even when the UI/API are bypassed. */
test("contact is required atomically; repeated lead capture never merges conversations by phone", async () => {
  await assert.rejects(
    db.query("select growth_send_message($1,$2,'سلام')", [guest, randomUUID()]),
    /CHAT_LEAD_REQUIRED/,
  );
  await assert.rejects(
    db.query("select growth_set_chat_lead($1,null,null,null)", [guest]),
    /INVALID/,
  );
  for (const owner of [guest, guest, other])
    await db.query(
      "select growth_set_chat_lead($1,'مشتری','آزمایشی','09000000000')",
      [owner],
    );
  assert.equal(
    (await db.query("select * from growth_conversations")).rows.length,
    2,
  );
  await db.query("select growth_send_message($1,$2,'سلام')", [
    guest,
    randomUUID(),
  ]);
  for (let i = 0; i < staffIds.length; i++) {
    const email = `staff-${i}@example.invalid`;
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [staffIds[i], email],
    );
    await db.query("insert into cms_editors(email) values($1)", [email]);
  }
});
async function asStaff(index: number) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: staffIds[index],
      email: `staff-${index}@example.invalid`,
      role: "authenticated",
    }),
  ]);
  await db.exec("set role authenticated");
}
async function notice() {
  return (
    await db.query<{ value: { total: number; items: { id: string }[] } }>(
      "select growth_staff_notifications() value",
    )
  ).rows[0].value;
}
test("staff receipts are independent and acknowledge only the selected message IDs", async () => {
  try {
    await asStaff(0);
    const initial = await notice();
    assert.equal(Number(initial.total), 1);
    const first = initial.items[0].id;
    await db.query("select growth_staff_read($1)", [[first]]);
    assert.equal(Number((await notice()).total), 0);
    await asStaff(1);
    assert.equal(Number((await notice()).total), 1);
    await db.exec("reset role");
    const later = randomUUID();
    await db.query("select growth_send_message($1,$2,'پیام جدید')", [
      guest,
      later,
    ]);
    await asStaff(0);
    await db.query("select growth_staff_read($1)", [[first]]);
    assert.equal(Number((await notice()).total), 1);
    await db.query("select growth_staff_read(null)");
    assert.equal(Number((await notice()).total), 0);
    await asStaff(1);
    assert.equal(Number((await notice()).total), 2);
    // Forging a receipt for another staff account must fail RLS.
    await assert.rejects(
      db.query(
        "insert into growth_chat_reads(staff_id,message_id) values($1,$2)",
        [staffIds[0], later],
      ),
      /row-level security/,
    );
  } finally {
    await db.exec("reset role");
  }
});
test("customer receipts cannot read another guest's replies or a later unseen response", async () => {
  const conversations = (
    await db.query<{ id: string; guest_hash: string }>(
      "select id,guest_hash from growth_conversations",
    )
  ).rows;
  const cid = conversations.find((c) => c.guest_hash === guest)!.id;
  const otherId = conversations.find((c) => c.guest_hash === other)!.id;
  const first = randomUUID(),
    later = randomUUID(),
    foreign = randomUUID();
  await asStaff(0);
  try {
    for (const [conversation, id] of [
      [cid, first],
      [cid, later],
      [otherId, foreign],
    ])
      await db.query("select growth_staff_reply($1,$2,'پاسخ',false)", [
        conversation,
        id,
      ]);
  } finally {
    await db.exec("reset role");
  }
  const result = await db.query<{ n: number }>(
    "select growth_visitor_read($1,$2) n",
    [guest, [first, foreign]],
  );
  assert.equal(Number(result.rows[0].n), 1);
  assert.equal(
    (
      await db.query<{ read: null }>(
        "select visitor_read_at as read from growth_messages where id=$1",
        [foreign],
      )
    ).rows[0].read,
    null,
  );
  const closed = (
    await db.query<{ v: { messages: unknown[]; unread_count: number } }>(
      "select growth_visitor_chat($1,false) v",
      [guest],
    )
  ).rows[0].v;
  assert.deepEqual(closed.messages, []);
  assert.equal(Number(closed.unread_count), 1);
  await db.query("select growth_visitor_read($1,'{}',true)", [guest]);
  assert.equal(
    Number(
      (
        await db.query<{ n: number }>("select growth_visitor_read($1,'{}') n", [
          guest,
        ])
      ).rows[0].n,
    ),
    0,
  );
});
test("anonymous and non-staff accounts cannot read leads, notifications or change receipts", async () => {
  try {
    await db.exec("set role anon");
    await assert.rejects(
      db.query("select * from growth_chat_inbox"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select growth_visitor_chat($1)", [guest]),
      /permission denied/,
    );
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims','{}',false)");
    await db.exec("set role authenticated");
    assert.equal(
      (await db.query("select * from growth_chat_inbox")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from growth_chat_reads")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select growth_staff_notifications()"),
      /FORBIDDEN/,
    );
    await assert.rejects(
      db.query("select growth_staff_read(null)"),
      /FORBIDDEN/,
    );
    await assert.rejects(
      db.query(
        "select growth_set_chat_lead($1,'جعلی','آزمایشی','09000000000')",
        [guest],
      ),
      /permission denied/,
    );
  } finally {
    await db.exec("reset role");
  }
});
