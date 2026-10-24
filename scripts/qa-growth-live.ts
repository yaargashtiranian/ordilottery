import { createClient } from "@supabase/supabase-js";
import {
  chromium,
  expect as baseExpect,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
// Remote Auth/RLS round trips need a realistic timeout instead of the local fixture's five seconds.
const expect = baseExpect.configure({ timeout: 30000 });

/** Opt-in integration against real Supabase. Only synthetic identities/records are created, then removed. */
async function main() {
  assert.equal(process.env.COMMERCE_MODE, "live");
  assert.equal(process.env.ENABLE_CHECKOUT, "false");
  const origin = process.env.QA_ORIGIN || "http://localhost:3200";
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  const db = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const publicClient = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  const marker = `qa-growth-${randomBytes(6).toString("hex")}`;
  const staffEmail = `${marker}-staff@example.invalid`,
    password = randomBytes(24).toString("hex");
  const guestHashes = new Set<string>(),
    campaignIds: string[] = [],
    contexts: BrowserContext[] = [];
  let staffId: string | undefined;
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  const hash = (text: string) =>
    createHash("sha256").update(text).digest("hex");
  async function rememberGuest(context: BrowserContext) {
    const token = (await context.cookies()).find(
      (cookie) => cookie.name === "yg_guest",
    )?.value;
    if (token) guestHashes.add(hash(token));
  }
  async function context() {
    const item = await browser.newContext({
      baseURL: origin,
      viewport: { width: 1440, height: 1000 },
    });
    item.setDefaultTimeout(30000);
    contexts.push(item);
    return item;
  }
  async function review(page: Page, code = "") {
    await page.goto(origin);
    await page
      .getByRole("button", { name: "مسیر من را بساز", exact: true })
      .click();
    await page.getByLabel("نام (الزامی)", { exact: true }).fill("آزمون");
    await page
      .getByLabel("نام خانوادگی (الزامی)", { exact: true })
      .fill("سفارش مصنوعی");
    await page
      .getByLabel("ایمیل (الزامی)", { exact: true })
      .fill(`${marker}-${randomUUID().slice(0, 8)}@example.invalid`);
    await page
      .getByLabel("شماره تماس (الزامی)", { exact: true })
      .fill("09000000000");
    await page.getByRole("button", { name: "دیدن خلاصه و قیمت" }).click();
    if (code) {
      await page.getByText("کد تخفیف داری؟", { exact: true }).click();
      await page.getByLabel("کد تخفیف", { exact: true }).fill(code);
      await page.getByRole("button", { name: "بررسی کد", exact: true }).click();
      await expect(
        page.getByText("تخفیف اعمال شد؛ ظرفیت هنگام تأیید سفارش نهایی می‌شود."),
      ).toBeVisible();
    }
    await page.getByRole("checkbox").check();
  }
  try {
    const user = await db.auth.admin.createUser({
      email: staffEmail,
      password,
      email_confirm: true,
    });
    if (user.error) throw user.error;
    staffId = user.data.user.id;
    const membership = await db
      .from("cms_editors")
      .insert({ email: staffEmail });
    if (membership.error) throw membership.error;
    const customer = await context(),
      page = await customer.newPage();
    await review(page);
    const save = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/experience") &&
        response.request().postDataJSON()?.action === "order",
    );
    await page
      .getByRole("button", {
        name: "ثبت سفارش و دریافت کد پیگیری",
        exact: true,
      })
      .click();
    const saved = await save;
    assert.equal(saved.status(), 200);
    const originalPayload = saved.request().postDataJSON();
    await rememberGuest(customer);
    await expect(page).toHaveURL(/\/checkout\/[a-f0-9-]+$/);
    const order = { id: page.url().split("/").at(-1)! };
    await expect(
      page.getByRole("heading", { name: "سفارش شما ثبت شد" }),
    ).toBeVisible();
    await expect(
      page.getByText("وضعیت مالی: پرداخت‌نشده.", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /ادامه به زرین‌پال/ }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "سفارش شما ثبت شد" }),
    ).toBeVisible();
    const retry = await customer.request.post(`${origin}/api/experience`, {
      headers: { Origin: origin },
      data: originalPayload,
    });
    assert.equal(retry.status(), 200);
    assert.equal((await retry.json()).order.id, order.id);
    const pay = await customer.request.post(`${origin}/api/experience`, {
      headers: { Origin: origin },
      data: { action: "pay", id: order.id },
    });
    assert.equal(pay.status(), 503);
    const direct = await db
      .from("growth_orders")
      .select("status,authority,payment_kind,case_id,mode")
      .eq("id", order.id)
      .single();
    assert.equal(direct.data?.status, "pending");
    assert.equal(direct.data?.mode, "live");
    assert.equal(direct.data?.authority, null);
    assert.equal(direct.data?.payment_kind, null);
    assert.equal(direct.data?.case_id, null);
    console.log(
      "Passed: real unpaid order persists, retry is idempotent, gateway is blocked, no paid state/CRM fabricated.",
    );

    const stranger = await context();
    assert.equal(
      (
        await stranger.request.get(`${origin}/api/experience?order=${order.id}`)
      ).status(),
      401,
    );
    const missingLead = await stranger.request.post(
      `${origin}/api/experience`,
      {
        headers: { Origin: origin },
        data: {
          action: "message",
          id: randomUUID(),
          body: "اطلاعات تماس ثبت نشده",
        },
      },
    );
    assert.equal(missingLead.status(), 422);
    await rememberGuest(stranger);
    const strangerLead = await stranger.request.post(
      `${origin}/api/experience`,
      {
        headers: { Origin: origin },
        data: {
          action: "chat_lead",
          lead: {
            firstName: "مخاطب",
            lastName: "آزمایشی",
            phone: "09000000000",
          },
          consent: true,
        },
      },
    );
    assert.equal(strangerLead.status(), 200);
    const unrelated = await stranger.request.post(`${origin}/api/experience`, {
      headers: { Origin: origin },
      data: {
        action: "message",
        id: randomUUID(),
        body: "پیام مصنوعی برای آزمون جداسازی مرورگرها",
      },
    });
    assert.equal(unrelated.status(), 200);
    await rememberGuest(stranger);
    assert.equal(
      (
        await stranger.request.get(`${origin}/api/experience?order=${order.id}`)
      ).status(),
      404,
    );
    assert.ok(
      (await publicClient.from("growth_orders").select("id").eq("id", order.id))
        .error,
    );

    const admin = await context(),
      staff = await admin.newPage();
    await staff.goto(`${origin}/backoffice/login`);
    await staff.getByLabel("ایمیل مدیریت").fill(staffEmail);
    await staff.getByLabel("رمز عبور", { exact: true }).fill(password);
    const loginResponse = staff.waitForResponse(
      (response) =>
        response.url().endsWith("/api/backoffice/session") &&
        response.request().method() === "POST",
    );
    await staff
      .getByRole("button", { name: "ورود به بک‌آفیس", exact: true })
      .click();
    assert.equal(
      (await loginResponse).status(),
      200,
      "Synthetic staff login must succeed before checking protected UI",
    );
    await expect(staff).toHaveURL(/\/backoffice$/);
    await staff.goto(`${origin}/backoffice/orders`);
    await expect(staff.getByText(order.id, { exact: true })).toBeVisible();
    const code = `QA-${randomBytes(6).toString("hex")}`.toUpperCase();
    await staff.goto(`${origin}/backoffice/campaigns`);
    await staff.getByText("ساخت کمپین و کد تخفیف", { exact: true }).click();
    await staff
      .getByLabel("نام کمپین", { exact: true })
      .fill("کمپین مصنوعی آزمون زنده");
    await staff.getByLabel("کد تخفیف", { exact: true }).fill(code);
    await staff.getByLabel("درصد تخفیف").fill("100");
    await staff.getByLabel("سقف تعداد استفاده").fill("1");
    await staff.getByLabel("شروع (زمان مرورگر)").fill("2026-01-01T00:00");
    await staff.getByLabel("پایان (زمان مرورگر)").fill("2030-01-01T00:00");
    await staff.getByLabel("محیط استفاده").selectOption("live");
    const campaignSave = staff.waitForResponse(
      (response) =>
        response.url().endsWith("/api/backoffice/growth") &&
        response.request().postDataJSON()?.action === "campaign",
    );
    await staff.getByRole("button", { name: "ثبت کمپین", exact: true }).click();
    const campaignResult = await campaignSave;
    assert.equal(campaignResult.status(), 200, await campaignResult.text());
    const campaign = await db
      .from("growth_campaigns")
      .select("id")
      .eq("code", code)
      .single();
    assert.ok(campaign.data);
    campaignIds.push(campaign.data.id);
    const free = await context(),
      freePage = await free.newPage();
    await review(freePage, code);
    await freePage
      .getByRole("button", { name: "تأیید سفارش بدون پرداخت", exact: true })
      .click();
    await rememberGuest(free);
    await expect(
      freePage.getByText("تخفیف صددرصد اعمال شد؛ پرداخت بانکی لازم نبود."),
    ).toBeVisible();
    const freeId = freePage.url().split("/").at(-1)!;
    const freeOrder = await db
      .from("growth_orders")
      .select("case_id,status,payment_kind,total_amount")
      .eq("id", freeId)
      .single();
    assert.equal(freeOrder.data?.status, "completed");
    assert.equal(freeOrder.data?.payment_kind, "discount");
    assert.equal(freeOrder.data?.total_amount, 0);
    assert.ok(freeOrder.data?.case_id);
    const intake = await db
      .from("crm_document_access")
      .select("enabled")
      .eq("case_id", freeOrder.data!.case_id)
      .single();
    assert.equal(intake.data?.enabled, false);
    const receipts = await db
      .from("crm_payments")
      .select("id", { count: "exact", head: true })
      .eq("case_id", freeOrder.data!.case_id);
    assert.equal(receipts.count, 0);
    const capped = await stranger.request.post(`${origin}/api/experience`, {
      headers: { Origin: origin },
      data: { action: "quote", plan: "online", code },
    });
    assert.equal(capped.status(), 409);
    console.log(
      "Passed: authenticated backoffice sees order, creates live campaign, full discount creates one case with private intake closed; capped redemption denies another browser.",
    );

    await page
      .getByRole("button", { name: "سؤالی داری؟", exact: true })
      .click();
    await page
      .getByRole("button", { name: "می‌خواهم با کارشناس صحبت کنم" })
      .click();
    await page.getByLabel("نام", { exact: true }).fill("مشتری");
    await page.getByLabel("نام خانوادگی", { exact: true }).fill("آزمایشی");
    await page.getByLabel("شماره موبایل", { exact: true }).fill("۰۹۰۰۰۰۰۰۰۰۰");
    await page
      .getByRole("button", { name: "شروع گفت‌وگو", exact: true })
      .click();
    const body = `پیام مصنوعی ${marker}`;
    await page.getByLabel("پیام شما", { exact: true }).fill(body);
    await page.getByRole("button", { name: "ارسال پیام", exact: true }).click();
    await expect(page.getByRole("log").getByText(body)).toBeVisible();
    await page
      .getByRole("button", { name: "بستن گفت‌وگو", exact: true })
      .click();
    const cookie = (await customer.cookies()).find(
      (item) => item.name === "yg_guest",
    )!;
    const conversation = await db
      .from("growth_conversations")
      .select("id")
      .eq("guest_hash", hash(cookie.value))
      .single();
    assert.ok(conversation.data);
    await expect
      .poll(async () =>
        Number(
          (
            await (
              await admin.request.get(
                `${origin}/api/backoffice/growth?section=notifications`,
              )
            ).json()
          ).total,
        ),
      )
      .toBeGreaterThan(0);
    await staff.goto(`${origin}/backoffice/chat`);
    await staff
      .locator(".growth-conversation")
      .filter({ hasText: conversation.data!.id.slice(0, 8) })
      .click();
    await expect(staff.getByRole("log").getByText(body)).toBeVisible();
    await expect(staff.locator(".support-lead-card a")).toHaveAttribute(
      "href",
      "tel:09000000000",
    );
    const answer = `پاسخ مصنوعی ${marker}`;
    await staff.getByLabel("متن پاسخ به مشتری").fill(answer);
    await staff
      .getByRole("button", { name: "ارسال پاسخ", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: /گفت‌وگو، 1 پاسخ خوانده‌نشده/ }),
    ).toBeVisible({ timeout: 15000 });
    await page.reload();
    await page
      .getByRole("button", { name: /گفت‌وگو، 1 پاسخ خوانده‌نشده/ })
      .click();
    await expect(page.getByRole("log").getByText(answer)).toBeVisible({
      timeout: 15000,
    });
    await expect
      .poll(async () =>
        Number(
          (
            await (
              await customer.request.get(
                `${origin}/api/experience?notifications=1`,
              )
            ).json()
          ).unread_count,
        ),
      )
      .toBe(0);
    console.log(
      "Passed: required lead, staff notification, persisted customer reply badge, private ownership and durable read state on real Supabase.",
    );

    const cap = await db
      .from("growth_campaigns")
      .insert({
        code: `RACE-${randomBytes(5).toString("hex")}`.toUpperCase(),
        name: "ظرفیت مصنوعی هم‌زمان",
        percent: 100,
        max_uses: 1,
        starts_at: "2026-01-01T00:00:00Z",
        ends_at: "2030-01-01T00:00:00Z",
        plan: "all",
        mode: "live",
      })
      .select("id,code")
      .single();
    if (cap.error) throw cap.error;
    campaignIds.push(cap.data.id);
    const race = await Promise.all(
      [1, 2].map(async (index) => {
        const guest = hash(randomBytes(32).toString("hex"));
        guestHashes.add(guest);
        return db.rpc("growth_checkout", {
          p_id: randomUUID(),
          p_guest: guest,
          p_hash: hash(`${marker}-${index}`),
          p_applicant: {
            firstName: "آزمون",
            lastName: "هم‌زمان",
            email: `${marker}-race${index}@example.invalid`,
            phone: "09000000000",
          },
          p_plan: "online",
          p_code: cap.data.code,
          p_mode: "live",
          p_reserve: true,
          p_expected: 0,
        });
      }),
    );
    assert.equal(race.filter((result) => !result.error).length, 1);
    assert.ok(
      race.some((result) =>
        result.error?.message.includes("COUPON_UNAVAILABLE"),
      ),
    );
    console.log(
      "Passed: concurrent real database requests cannot reserve the last campaign slot twice.",
    );
  } finally {
    for (const item of contexts)
      await rememberGuest(item).catch(() => undefined);
    await browser.close();
    // Follow only captured capabilities and returned IDs; unrelated real customer records are never queried/deleted.
    for (const guest of guestHashes) {
      const orders = await db
        .from("growth_orders")
        .select("id,case_id")
        .eq("guest_hash", guest);
      if (orders.error) throw orders.error;
      for (const order of orders.data) {
        let customerId: string | undefined;
        if (order.case_id) {
          const record = await db
            .from("crm_cases")
            .select("customer_id")
            .eq("id", order.case_id)
            .single();
          customerId = record.data?.customer_id;
        }
        const removed = await db
          .from("growth_orders")
          .delete()
          .eq("id", order.id);
        if (removed.error) throw removed.error;
        if (order.case_id) {
          for (const table of ["crm_activity", "crm_document_access"]) {
            const result = await db
              .from(table)
              .delete()
              .eq("case_id", order.case_id);
            if (result.error) throw result.error;
          }
          const cases = await db
            .from("crm_cases")
            .delete()
            .eq("id", order.case_id);
          if (cases.error) throw cases.error;
          if (customerId) {
            await db
              .from("crm_activity")
              .delete()
              .eq("customer_id", customerId);
            const result = await db
              .from("crm_customers")
              .delete()
              .eq("id", customerId);
            if (result.error) throw result.error;
          }
        }
      }
      const chats = await db
        .from("growth_conversations")
        .delete()
        .eq("guest_hash", guest);
      if (chats.error) throw chats.error;
      await db
        .from("growth_rate_limits")
        .delete()
        .in("key", [hash(`read:${guest}`), hash(`write:${guest}`)]);
    }
    if (campaignIds.length) {
      const result = await db
        .from("growth_campaigns")
        .delete()
        .in("id", campaignIds);
      if (result.error) throw result.error;
    }
    if (staffId) {
      await db.from("cms_editors").delete().eq("email", staffEmail);
      const result = await db.auth.admin.deleteUser(staffId);
      if (result.error) throw result.error;
    }
    console.log("Synthetic live-test records and Auth account removed.");
  }
}
void main().catch((error) => {
  // Matcher objects include accessibility snapshots with temporary passwords; never log those objects.
  console.error(
    error instanceof Error
      ? error.message.split("\n\nCall log:")[0]
      : "Live integration failed; raw provider diagnostics suppressed.",
  );
  process.exitCode = 1;
});
