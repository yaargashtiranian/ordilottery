import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";

/** Drive real UI -> Next API -> isolated PostgreSQL migrations; no page.route mocks replace feature behavior. */
async function review(page: Page, code: string) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "مسیر من را بساز", exact: true })
    .click();
  await page.getByLabel("نام (الزامی)", { exact: true }).fill("سارا");
  await page
    .getByLabel("نام خانوادگی (الزامی)", { exact: true })
    .fill("ایرانی");
  await page
    .getByLabel("ایمیل (الزامی)", { exact: true })
    .fill(`test-${randomUUID()}@example.invalid`);
  await page
    .getByLabel("شماره تماس (الزامی)", { exact: true })
    .fill("۰۹۱۲۳۴۵۶۷۸۹");
  await page.getByRole("button", { name: "دیدن خلاصه و قیمت" }).click();
  await page.getByText("کد تخفیف داری؟", { exact: true }).click();
  await page.getByLabel("کد تخفیف", { exact: true }).fill(code);
  await page.getByRole("button", { name: "بررسی کد", exact: true }).click();
  await expect(
    page.getByText("تخفیف اعمال شد؛ ظرفیت هنگام تأیید سفارش نهایی می‌شود."),
  ).toBeVisible();
  await page.getByRole("checkbox").check();
}
async function staff(page: Page) {
  await page.goto("/backoffice/login");
  await page.getByLabel("ایمیل مدیریت").fill("growth-staff@example.invalid");
  await page.getByLabel("رمز عبور", { exact: true }).fill("synthetic-password");
  await page
    .getByRole("button", { name: "ورود به بک‌آفیس", exact: true })
    .click();
  await expect(page).toHaveURL(/\/backoffice$/);
}

test("100% campaign finishes without bank, persists on reload, and refuses a second browser", async ({
  page,
  browser,
  baseURL,
}) => {
  await review(page, "TEST100");
  await page
    .getByRole("button", { name: "تأیید سفارش بدون پرداخت", exact: true })
    .click();
  await expect(page).toHaveURL(/\/checkout\/[a-f0-9-]+$/);
  await expect(
    page.getByText("تخفیف صددرصد اعمال شد؛ پرداخت بانکی لازم نبود."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "این قدم کامل شد!" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "این قدم کامل شد!" }),
  ).toBeVisible();
  const id = page.url().split("/").at(-1)!;
  const stranger = await browser.newContext();
  try {
    const response = await stranger.request.get(
      `${baseURL}/api/experience?order=${id}`,
    );
    expect(response.status()).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain("سارا");
  } finally {
    await stranger.close();
  }
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test("partial discount enters simulator and both cancel and success have authoritative results", async ({
  page,
}) => {
  await review(page, "TEST50");
  await page
    .getByRole("button", { name: "تأیید و ادامه به پرداخت", exact: true })
    .click();
  await expect(
    page.getByText("۷۴۹٬۵۰۰ تومان", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "شبیه‌سازی انصراف" }).click();
  await expect(
    page.getByRole("heading", { name: "پرداخت آزمایشی لغو شد" }),
  ).toBeVisible();
  await review(page, "TEST50");
  await page
    .getByRole("button", { name: "تأیید و ادامه به پرداخت", exact: true })
    .click();
  await page.getByRole("button", { name: "شبیه‌سازی پرداخت موفق" }).click();
  await expect(page.getByText("نتیجه موفق آزمایشی ثبت شد.")).toBeVisible();
});

test("staff creates a capped campaign and its last redemption rejects another customer", async ({
  page,
  browser,
  baseURL,
}) => {
  await staff(page);
  await page.goto("/backoffice/campaigns");
  await page.getByText("ساخت کمپین و کد تخفیف", { exact: true }).click();
  const code = `CAP-${randomUUID().slice(0, 8)}`.toUpperCase();
  await page.getByLabel("نام کمپین", { exact: true }).fill("کمپین مرورگر");
  await page.getByLabel("کد تخفیف", { exact: true }).fill(code);
  await page.getByLabel("سقف تعداد استفاده").fill("1");
  await page.getByLabel("شروع (زمان مرورگر)").fill("2026-01-01T00:00");
  await page.getByLabel("پایان (زمان مرورگر)").fill("2030-01-01T00:00");
  await page.getByRole("button", { name: "ثبت کمپین", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: new RegExp(code) }),
  ).toBeVisible();
  const customer = await browser.newContext({ baseURL });
  try {
    const client = await customer.newPage();
    await review(client, code);
    await client
      .getByRole("button", { name: "تأیید سفارش بدون پرداخت" })
      .click();
    await expect(
      client.getByRole("heading", { name: "این قدم کامل شد!" }),
    ).toBeVisible();
  } finally {
    await customer.close();
  }
  await page.getByRole("button", { name: "تازه‌سازی" }).click();
  await expect(
    page.locator(".growth-record").filter({ hasText: code }),
  ).toContainText("مصرف‌شده: ۱");
  const denied = await page.request.post("/api/experience", {
    headers: { Origin: baseURL! },
    data: { action: "quote", plan: "online", code },
  });
  expect(denied.status()).toBe(409);
});

test("assistant works locally and human messages cross to staff and back without internal notes", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "سؤالی داری؟" }).click();
  await page.getByRole("button", { name: "ثبت‌نام رسمی شروع شده؟" }).click();
  await expect(
    page.getByText(/تاریخ این دوره هنوز در سایت تأیید نشده است/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "می‌خواهم با کارشناس صحبت کنم" })
    .click();
  const body = `سؤال آزمایشی ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("پیام شما", { exact: true }).fill(body);
  await page.getByRole("button", { name: "ارسال پیام", exact: true }).click();
  await expect(page.getByRole("log").getByText(body)).toBeVisible();
  const adminContext = await browser.newContext({ baseURL });
  try {
    const admin = await adminContext.newPage();
    await staff(admin);
    await admin.goto("/backoffice/chat");
    await admin.locator(".growth-conversation").first().click();
    await expect(admin.getByRole("log").getByText(body)).toBeVisible();
    await admin
      .getByLabel("متن پاسخ به مشتری")
      .fill("سلام، برای اسکن مدارک راهنمایی‌تان می‌کنیم.");
    await admin
      .getByRole("button", { name: "ارسال پاسخ", exact: true })
      .click();
    await expect(
      page
        .getByRole("log")
        .getByText("سلام، برای اسکن مدارک راهنمایی‌تان می‌کنیم."),
    ).toBeVisible({ timeout: 12000 });
    const accessibility = await new AxeBuilder({ page: admin })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  } finally {
    await adminContext.close();
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("public routes reject cross-site writes and missing staff sessions", async ({
  request,
  baseURL,
}) => {
  const response = await request.post("/api/experience", {
    headers: { Origin: "https://foreign.example" },
    data: { action: "message", id: randomUUID(), body: "should not persist" },
  });
  expect(response.status()).toBe(403);
  const staffRead = await request.get(
    "/api/backoffice/growth?section=campaigns",
  );
  expect(staffRead.status()).toBe(401);
  const bad = await request.post("/api/experience", {
    headers: { Origin: baseURL! },
    data: { action: "order", plan: "online", firstName: "<script>" },
  });
  expect(bad.status()).toBe(422);
});
