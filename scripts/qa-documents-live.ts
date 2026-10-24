import { chromium, request as playwrightRequest } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Explicit setup/cleanup SQL creates synthetic Auth identities without sending signup emails.
const configPath = resolve("test-results/documents-live.json");
type Config = {
  staff: string;
  owner: string;
  other: string;
  customer: string;
  caseId: string;
  password: string;
  prefix: string;
  document?: string;
};
const mode = process.argv[2];
if (mode === "setup") {
  mkdirSync("test-results", { recursive: true });
  const value: Config = {
    staff: randomUUID(),
    owner: randomUUID(),
    other: randomUUID(),
    customer: randomUUID(),
    caseId: randomUUID(),
    password: randomBytes(24).toString("hex"),
    prefix: `documents-${randomBytes(6).toString("hex")}`,
  };
  writeFileSync(configPath, JSON.stringify(value));
  const accounts = (["staff", "owner", "other"] as const)
    .map(
      (role) =>
        `insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change) values('00000000-0000-0000-0000-000000000000','${value[role]}','authenticated','authenticated','${value.prefix}-${role}@example.invalid',extensions.crypt('${value.password}',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');\ninsert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at) values('${value[role]}','${value[role]}','{"sub":"${value[role]}","email":"${value.prefix}-${role}@example.invalid","email_verified":true}','email',now(),now());`,
    )
    .join("\n");
  console.log(
    `begin;\n${accounts}\ninsert into public.cms_editors(email,permissions) values('${value.prefix}-staff@example.invalid',array['documents','cases','customers']);\ninsert into public.crm_customers(id,first_name,last_name,email,phone,notes) values('${value.customer}','مشتری','آزمایش مدارک','${value.prefix}-owner@example.invalid','09000000000','Synthetic automated document QA only');\ninsert into public.crm_cases(id,customer_id,plan,quoted_amount) values('${value.caseId}','${value.customer}','online',1499000);\ncommit;`,
  );
} else {
  const config: Config = JSON.parse(readFileSync(configPath, "utf8"));
  if (mode === "expire")
    console.log(
      `update public.crm_document_access set retention_at=now()-interval '1 second' where case_id='${config.caseId}';`,
    );
  else if (mode === "cleanup-sql")
    console.log(
      `begin;\ndelete from public.crm_document_reviews where document_id in (select id from public.crm_documents where case_id='${config.caseId}');\ndelete from public.crm_documents where case_id='${config.caseId}';\ndelete from public.crm_document_access where case_id='${config.caseId}';\ndelete from public.crm_activity where customer_id='${config.customer}';\ndelete from public.crm_cases where id='${config.caseId}';\ndelete from public.crm_customers where id='${config.customer}';\ndelete from public.cms_editors where email='${config.prefix}-staff@example.invalid';\ndelete from auth.users where id in ('${config.staff}','${config.owner}','${config.other}');\ncommit;`,
    );
  else
    void verify(config, mode === "purge").catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

/** Real browser -> Next API -> Auth/RLS -> encrypted Storage -> decrypted response. No real documents. */
async function verify(config: Config, purge: boolean) {
  const origin = "http://localhost:3000";
  const staff = await playwrightRequest.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin },
  });
  const owner = await playwrightRequest.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin },
  });
  const other = await playwrightRequest.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin },
  });
  async function login(client: typeof staff, role: string) {
    const response = await client.post(
      role === "staff" ? "/api/backoffice/session" : "/api/portal/session",
      {
        data: {
          email: `${config.prefix}-${role}@example.invalid`,
          password: config.password,
        },
      },
    );
    assert.equal(response.status(), 200, await response.text());
  }
  await Promise.all([
    login(staff, "staff"),
    login(owner, "owner"),
    login(other, "other"),
  ]);
  if (purge) {
    assert.equal(
      (await owner.get(`/api/documents/${config.document}/file`)).status(),
      410,
    );
    const response = await staff.post(
      `/api/documents/maintenance?case_id=${config.caseId}`,
    );
    assert.equal(response.status(), 200, await response.text());
    assert.ok((await response.json()).deleted >= 2);
    console.log(
      "Passed: expired downloads blocked; primary and recovery copies purged via Storage API.",
    );
    await Promise.all([staff.dispose(), owner.dispose(), other.dispose()]);
    return;
  }
  const enabled = await staff.patch(`/api/documents/cases/${config.caseId}`, {
    data: { enabled: true },
  });
  assert.equal(enabled.status(), 200, await enabled.text());
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
      (existsSync("C:/Program Files/Google/Chrome/Application/chrome.exe")
        ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
        : undefined),
  });
  try {
    const ownerContext = await browser.newContext({
      storageState: await owner.storageState(),
    });
    ownerContext.setDefaultTimeout(20000);
    const customerPage = await ownerContext.newPage();
    customerPage.on("pageerror", (error) =>
      console.error("Customer UI error:", error.message),
    );
    await customerPage.goto(`${origin}/portal`);
    console.log("Customer portal loaded.");
    await customerPage.getByRole("button", { name: "افزودن مدرک" }).click();
    await customerPage.getByLabel("عنوان مدرک").fill("نمونهٔ آزمایشی پرونده");
    // A generated one-pixel PNG is a synthetic graphic, never an identity document.
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
      "base64",
    );
    await customerPage.getByLabel("فایل مدرک").setInputFiles({
      name: "synthetic-test.png",
      mimeType: "image/png",
      buffer: bytes,
    });
    const uploadResponse = customerPage.waitForResponse(
      (r) =>
        r.url().includes(`/api/documents/cases/${config.caseId}`) &&
        r.request().method() === "POST",
    );
    await customerPage
      .getByRole("button", { name: "ارسال و ذخیرهٔ نسخه" })
      .click();
    const uploaded = await uploadResponse;
    assert.equal(uploaded.status(), 201, await uploaded.text());
    const doc = (await uploaded.json()).document;
    console.log("Customer upload and backup persisted.");
    config.document = doc.id;
    writeFileSync(configPath, JSON.stringify(config));
    assert.equal(doc.source, "customer");
    const downloaded = await owner.get(`/api/documents/${doc.id}/file`);
    assert.equal(downloaded.status(), 200, await downloaded.text());
    assert.deepEqual(await downloaded.body(), bytes);
    assert.match(downloaded.headers()["cache-control"], /no-store/);
    assert.equal(
      (await other.get(`/api/documents/${doc.id}/file`)).status(),
      404,
    );
    assert.equal(
      (await other.get(`/api/documents/cases/${config.caseId}`)).status(),
      404,
    );
    assert.equal(
      (
        await owner.patch(`/api/documents/${doc.id}`, {
          data: { status: "approved", note: "", revision: doc.revision },
        })
      ).status(),
      401,
    );
    assert.equal(
      (await owner.get(`/api/documents/${doc.id}/file?backup=1`)).status(),
      403,
    );
    const staffContext = await browser.newContext({
      storageState: await staff.storageState(),
      viewport: { width: 1440, height: 1080 },
    });
    staffContext.setDefaultTimeout(20000);
    const page = await staffContext.newPage();
    page.on("pageerror", (error) =>
      console.error("Staff UI error:", error.message),
    );
    await page.goto(`${origin}/backoffice/cases?id=${config.caseId}`);
    await page
      .getByRole("heading", { name: "نمونهٔ آزمایشی پرونده" })
      .waitFor();
    await page.getByRole("button", { name: "مشاهده", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await page.getByRole("button", { name: "بستن فرم" }).click();
    await page.getByRole("button", { name: "رد با دلیل" }).click();
    await page
      .getByLabel("دلیل رد و اصلاح موردنیاز (الزامی)")
      .fill("نسخهٔ خواناتر ارسال کنید؛ این فقط آزمایش است.");
    await page
      .getByRole("button", { name: "ثبت رد مدرک", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    const rejected = (
      await (await staff.get(`/api/documents/cases/${config.caseId}`)).json()
    ).documents[0];
    assert.equal(rejected.status, "rejected");
    assert.equal(
      (
        await staff.patch(`/api/documents/${doc.id}`, {
          data: { status: "approved", note: "", revision: doc.revision },
        })
      ).status(),
      409,
    );
    await page.getByRole("button", { name: "نسخهٔ جدید" }).click();
    await page.getByLabel("فایل مدرک").setInputFiles({
      name: "synthetic-replacement.png",
      mimeType: "image/png",
      buffer: bytes,
    });
    const replacementResponse = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/documents/cases/${config.caseId}`) &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "ارسال و ذخیرهٔ نسخه" }).click();
    const replacement = await replacementResponse;
    assert.equal(replacement.status(), 201, await replacement.text());
    const v2 = (await replacement.json()).document;
    assert.equal(v2.version, 2);
    assert.equal(v2.source, "staff");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .locator(".docs-row")
      .filter({ hasText: "synthetic-replacement.png" })
      .getByRole("button", { name: "تأیید", exact: true })
      .click();
    await page.getByRole("button", { name: "ثبت تأیید", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    const backup = await staff.get(`/api/documents/${doc.id}/file?backup=1`);
    assert.equal(backup.status(), 200);
    assert.deepEqual(await backup.body(), bytes);
    const current = await staff.get(`/api/documents/cases/${config.caseId}`);
    const payload = await current.json();
    assert.equal(payload.documents.length, 2);
    assert.equal(
      payload.documents.find((item: { id: string }) => item.id === doc.id)
        .status,
      "rejected",
    );
    assert.equal(
      payload.documents.find((item: { id: string }) => item.id === v2.id)
        .status,
      "approved",
    );
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.deepEqual(axe.violations, []);
    await page.screenshot({
      path: "test-results/documents-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: "test-results/documents-mobile.png",
      fullPage: true,
    });
    const raw = await fetch(
      `${process.env.SUPABASE_URL}/storage/v1/object/public/case-documents/${config.caseId}/${doc.id}/primary`,
    );
    assert.notEqual(raw.status, 200);
    console.log(
      "Passed: real customer upload, expert preview/rejection/replacement/approval, immutable originals, private downloads, encrypted backup, ownership denial, optimistic conflict, desktop/mobile accessibility.",
    );
  } finally {
    await browser.close();
    await Promise.all([staff.dispose(), owner.dispose(), other.dispose()]);
  }
}
