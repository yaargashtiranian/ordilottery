import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { growthDatabase } from "./helpers/growth-db";
import {
  normalizeStaffPermissions,
  firstStaffPath,
} from "../src/lib/backoffice-permissions";
let db: Awaited<ReturnType<typeof growthDatabase>>;
const owner = randomUUID(),
  staff = randomUUID(),
  outsider = randomUUID();
const email = "limited@example.invalid";
before(async () => {
  db = await growthDatabase();
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'owner@example.invalid',now()),($2,$3,now()),($4,'outsider@example.invalid',now())",
    [owner, staff, email, outsider],
  );
  await db.exec(
    "insert into cms_editors(email,is_owner) values('owner@example.invalid',true)",
  );
});
after(async () => {
  await db?.close();
});
async function asUser(id: string, mail: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: id,
      email: mail,
      role: "authenticated",
      user_metadata: { permissions: ["users"], is_owner: true },
    }),
  ]);
  await db.exec("set role authenticated");
}
async function save(permissions: string[], enabled = true, revision = 0) {
  return db.query("select backoffice_save_staff($1,'Limited staff',$2,$3,$4)", [
    email,
    permissions,
    enabled,
    revision,
  ]);
}
test("section dependencies and first destination are deterministic; unknown permissions fail closed", () => {
  assert.deepEqual(normalizeStaffPermissions(["documents"]), [
    "cases",
    "customers",
    "documents",
  ]);
  assert.deepEqual(normalizeStaffPermissions(["overview"]), [
    "cases",
    "customers",
    "orders",
    "overview",
    "payments",
    "support",
  ]);
  assert.equal(normalizeStaffPermissions(["root"]), null);
  assert.equal(
    firstStaffPath({ enabled: true, is_owner: false, permissions: ["chat"] }),
    "/backoffice/chat",
  );
});
test("only an authorized manager can create staff, with atomic audit and dependency normalization", async () => {
  await asUser(outsider, "outsider@example.invalid");
  await assert.rejects(save(["chat"]), /FORBIDDEN/);
  await asUser(owner, "owner@example.invalid");
  await save(["chat"]);
  assert.equal(
    (await db.query("select * from backoffice_access_log")).rows.length,
    1,
  );
  await assert.rejects(save(["users"], true, 0), /REVISION_CONFLICT/);
});
test("limited staff cannot self-escalate, read other memberships, or reach unrelated tables/RPCs", async () => {
  await asUser(staff, email);
  assert.equal((await db.query("select * from cms_editors")).rows.length, 1);
  assert.equal(
    (await db.query("select * from backoffice_access_log")).rows.length,
    0,
  );
  for (const table of [
    "cms_pages",
    "crm_customers",
    "crm_cases",
    "crm_payments",
    "growth_orders",
    "growth_campaigns",
    "crm_documents",
    "crm_document_access",
  ])
    assert.equal(
      (await db.query(`select * from ${table}`)).rows.length,
      0,
      table,
    );
  await assert.rejects(save(["users"], true, 1), /FORBIDDEN/);
  await assert.rejects(
    db.exec("update cms_editors set is_owner=true"),
    /permission denied/,
  );
  await assert.rejects(
    db.exec(
      "insert into growth_campaigns(code,name,percent,max_uses,starts_at,ends_at,plan,mode) values('NOPE','Nope',50,1,now(),now()+interval '1 day','all','simulation')",
    ),
    /row-level security/,
  );
  assert.ok(
    (await db.query("select growth_staff_notifications() value")).rows[0],
  );
});
test("changes and disablement apply to the same existing JWT immediately", async () => {
  await asUser(owner, "owner@example.invalid");
  await save(["campaigns"], true, 1);
  await asUser(staff, email);
  await assert.rejects(
    db.exec("select growth_staff_notifications()"),
    /FORBIDDEN/,
  );
  await db.exec(
    "insert into growth_campaigns(code,name,percent,max_uses,starts_at,ends_at,plan,mode) values('YES','Allowed',50,1,now(),now()+interval '1 day','all','simulation')",
  );
  assert.equal(
    (
      await db.query(
        "select * from growth_campaign_stats(array(select id from growth_campaigns))",
      )
    ).rows.length,
    1,
  );
  await asUser(owner, "owner@example.invalid");
  await save(["campaigns"], false, 2);
  await asUser(staff, email);
  assert.equal(
    (await db.query("select * from growth_campaigns")).rows.length,
    0,
  );
});
test("owner and self changes remain protected even for delegated user managers", async () => {
  await asUser(owner, "owner@example.invalid");
  await save(["users"], true, 3);
  await asUser(staff, email);
  await assert.rejects(save(["chat"], true, 4), /SELF_CHANGE_FORBIDDEN/);
  await assert.rejects(
    db.exec(
      "select backoffice_save_staff('owner@example.invalid','Owner',array['chat'],false,1)",
    ),
    /OWNER_PROTECTED/,
  );
});
test("case permission creates and synchronizes invitations without granting document access", async () => {
  await asUser(owner, "owner@example.invalid");
  await save(["cases"], true, 4);
  await asUser(staff, email);
  const customer = randomUUID(),
    cid = randomUUID();
  await db.query(
    "insert into crm_customers(id,first_name,last_name,email,phone) values($1,'Test','Customer','customer@example.invalid','09000000000')",
    [customer],
  );
  await db.query(
    "insert into crm_cases(id,customer_id,plan,quoted_amount) values($1,$2,'online',100)",
    [cid, customer],
  );
  assert.equal(
    (await db.query("select * from crm_document_access")).rows.length,
    0,
  );
  await db.query(
    "update crm_customers set email='changed@example.invalid',revision=revision+1 where id=$1",
    [customer],
  );
  await assert.rejects(
    db.query(
      "insert into crm_document_access(case_id,case_number,customer_email,enabled) values($1,999,'attacker@example.invalid',true)",
      [randomUUID()],
    ),
    /row-level security/,
  );
  await asUser(owner, "owner@example.invalid");
  const access = (
    await db.query<{ customer_email: string; enabled: boolean }>(
      "select * from crm_document_access where case_id=$1",
      [cid],
    )
  ).rows[0];
  assert.equal(access.customer_email, "changed@example.invalid");
  assert.equal(access.enabled, false);
  await db.query(
    "insert into crm_payments(case_id,amount,reference,status) values($1,10,'TEST','recorded')",
    [cid],
  );
  const document = randomUUID();
  await db.query(
    "insert into crm_documents(id,case_id,group_id,title,kind,applicant_role,filename,mime_type,byte_size,sha256,source) values($1,$2,$1,'Test document','general','applicant','fixture.pdf','application/pdf',20,repeat('a',64),'staff')",
    [document, cid],
  );
  await db.query(
    "update crm_documents set uploaded=true,revision=revision+1 where id=$1",
    [document],
  );
  await db.exec(
    "reset role; grant select,insert,delete on storage.objects to authenticated",
  );
  await db.query(
    "insert into storage.objects(bucket_id,name) values('case-documents',$1)",
    [`${cid}/${document}/primary`],
  );
  await asUser(staff, email);
  assert.equal((await db.query("select * from crm_documents")).rows.length, 0);
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select * from crm_activity where kind='crm_payments'"))
      .rows.length,
    0,
  );
  await asUser(owner, "owner@example.invalid");
  await save(["documents"], true, 5);
  await asUser(staff, email);
  assert.equal((await db.query("select * from crm_documents")).rows.length, 1);
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    1,
  );
  await db.query(
    "update crm_documents set status='approved',revision=revision+1 where id=$1",
    [document],
  );
  assert.equal(
    (await db.query("select * from crm_document_reviews")).rows.length,
    1,
  );
  await db.exec("reset role");
  const customerIdentity = randomUUID();
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'changed@example.invalid',now())",
    [customerIdentity],
  );
  await asUser(customerIdentity, "changed@example.invalid");
  assert.equal((await db.query("select * from crm_documents")).rows.length, 1);
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    1,
  );
  assert.equal((await db.query("select * from crm_cases")).rows.length, 0);
});
test("JWT email spoofing and unconfirmed identities cannot authorize staff permissions", async () => {
  await asUser(outsider, email);
  assert.equal(
    (
      await db.query<{ ok: boolean }>(
        "select growth_private.has_permission('cases') ok",
      )
    ).rows[0].ok,
    false,
  );
  await db.exec("reset role");
  await db.query("update auth.users set email_confirmed_at=null where id=$1", [
    staff,
  ]);
  await asUser(staff, email);
  assert.equal(
    (
      await db.query<{ ok: boolean }>(
        "select growth_private.has_permission('cases') ok",
      )
    ).rows[0].ok,
    false,
  );
});
