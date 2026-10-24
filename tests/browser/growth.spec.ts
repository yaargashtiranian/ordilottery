import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID, randomInt } from "node:crypto";

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
  if (
    await page
      .getByRole("button", { name: "تأیید موبایل (آزمایشی)", exact: true })
      .isVisible()
      .catch(() => false)
  ) {
    await page
      .getByRole("button", { name: "تأیید موبایل (آزمایشی)", exact: true })
      .click();
    await page.getByLabel("کد تأیید", { exact: true }).fill("123456");
    await page
      .getByRole("button", { name: "تأیید و ادامه", exact: true })
      .click();
  } else {
    // The asynchronous contact lookup may still be rendering the verification choice.
    await expect(
      page.getByText("کد تخفیف داری؟", { exact: true }).or(
        page.getByRole("button", {
          name: "تأیید موبایل (آزمایشی)",
          exact: true,
        }),
      ),
    ).toBeVisible();
    if (
      await page
        .getByRole("button", { name: "تأیید موبایل (آزمایشی)", exact: true })
        .isVisible()
    ) {
      await page
        .getByRole("button", { name: "تأیید موبایل (آزمایشی)", exact: true })
        .click();
      await page.getByLabel("کد تأیید", { exact: true }).fill("123456");
      await page
        .getByRole("button", { name: "تأیید و ادامه", exact: true })
        .click();
    }
  }
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
  await expect(page.getByLabel("پیام شما", { exact: true })).toHaveCount(0);
  const bypass = await page.request.post("/api/experience", {
    headers: { Origin: baseURL! },
    data: { action: "message", id: randomUUID(), body: "بدون اطلاعات تماس" },
  });
  expect(bypass.status()).toBe(422);
  await page.getByLabel("نام", { exact: true }).fill("سارا");
  await page.getByLabel("نام خانوادگی", { exact: true }).fill("آزمایشی");
  await page.getByLabel("شماره موبایل", { exact: true }).fill("۰۹۰۰۰۰۰۰۰۰۰");
  const leadAccessibility = await new AxeBuilder({ page })
    .include(".chat-panel")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(leadAccessibility.violations).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("chat-lead.png") });
  await page.getByRole("button", { name: "شروع گفت‌وگو", exact: true }).click();
  const body = `سؤال آزمایشی ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("پیام شما", { exact: true }).fill(body);
  await page.getByRole("button", { name: "ارسال پیام", exact: true }).click();
  await expect(page.getByRole("log").getByText(body)).toBeVisible();
  await page.getByRole("button", { name: "بستن گفت‌وگو", exact: true }).click();
  const adminContext = await browser.newContext({ baseURL });
  try {
    const admin = await adminContext.newPage();
    await staff(admin);
    await admin.getByLabel(/اعلان‌های پشتیبانی، [1-9]/).click();
    const bellAccessibility = await new AxeBuilder({ page: admin })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(bellAccessibility.violations).toEqual([]);
    await admin.screenshot({
      path: test.info().outputPath("staff-notifications.png"),
    });
    await admin
      .locator(".support-notification-panel a")
      .filter({ hasText: "سارا آزمایشی" })
      .first()
      .click();
    await expect(admin).toHaveURL(/\/backoffice\/chat\?conversation=/);
    await expect(admin.getByRole("log").getByText(body)).toBeVisible();
    await expect(admin.locator(".support-lead-card")).toContainText(
      "سارا آزمایشی",
    );
    await expect(admin.locator(".support-lead-card a")).toHaveAttribute(
      "href",
      "tel:09000000000",
    );
    await admin.screenshot({
      path: test.info().outputPath("staff-chat-lead.png"),
    });
    await expect
      .poll(async () =>
        Number(
          (
            await (
              await admin.request.get(
                "/api/backoffice/growth?section=notifications",
              )
            ).json()
          ).total,
        ),
      )
      .toBe(0);
    await admin
      .getByLabel("متن پاسخ به مشتری")
      .fill("سلام، برای اسکن مدارک راهنمایی‌تان می‌کنیم.");
    await admin
      .getByRole("button", { name: "ارسال پاسخ", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: /گفت‌وگو، 1 پاسخ خوانده‌نشده/ }),
    ).toBeVisible({ timeout: 15000 });
    await page.screenshot({
      path: test.info().outputPath("customer-notification.png"),
    });
    await page.reload();
    await page
      .getByRole("button", { name: /گفت‌وگو، 1 پاسخ خوانده‌نشده/ })
      .click();
    await expect(
      page
        .getByRole("log")
        .getByText("سلام، برای اسکن مدارک راهنمایی‌تان می‌کنیم."),
    ).toBeVisible({ timeout: 12000 });
    await expect
      .poll(async () =>
        Number(
          (
            await (
              await page.request.get("/api/experience?notifications=1")
            ).json()
          ).unread_count,
        ),
      )
      .toBe(0);
    const stranger = await browser.newContext({ baseURL });
    try {
      const response = await stranger.request.get(
        "/api/experience?notifications=1",
      );
      expect(await response.json()).toEqual({
        unread_count: 0,
        conversation: null,
      });
    } finally {
      await stranger.close();
    }
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

test("new registrations require a bound code before ordering", async ({
  page,
  baseURL,
}) => {
  const profile = {
    firstName: "مشتری",
    lastName: "آزمایشی",
    email: `verify-${randomUUID()}@example.invalid`,
    phone: `090${String(randomInt(100000000)).padStart(8, "0")}`,
  };
  const denied = await page.request.post("/api/experience", {
    headers: { Origin: baseURL! },
    data: {
      action: "order",
      ...profile,
      plan: "online",
      idempotencyKey: randomUUID(),
      consent: true,
      expectedTotal: 1499000,
      code: "",
    },
  });
  expect(denied.status()).toBe(422);
  await page.goto("/");
  await page
    .getByRole("button", { name: "مسیر من را بساز", exact: true })
    .click();
  await page
    .getByLabel("نام (الزامی)", { exact: true })
    .fill(profile.firstName);
  await page
    .getByLabel("نام خانوادگی (الزامی)", { exact: true })
    .fill(profile.lastName);
  await page.getByLabel("ایمیل (الزامی)", { exact: true }).fill(profile.email);
  await page
    .getByLabel("شماره تماس (الزامی)", { exact: true })
    .fill(profile.phone);
  await page
    .getByRole("button", { name: "دیدن خلاصه و قیمت", exact: true })
    .click();
  await page
    .getByRole("button", { name: "تأیید موبایل (آزمایشی)", exact: true })
    .click();
  await page.getByLabel("کد تأیید", { exact: true }).fill("000000");
  await page
    .getByRole("button", { name: "تأیید و ادامه", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "کد نادرست" }),
  ).toContainText("کد نادرست");
  await page.getByLabel("کد تأیید", { exact: true }).fill("۱۲۳۴۵۶");
  const axe = await new AxeBuilder({ page })
    .include(".customer-verification")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("order-otp.png") });
  await page
    .getByRole("button", { name: "تأیید و ادامه", exact: true })
    .click();
  await expect(page.getByText("کد تخفیف داری؟", { exact: true })).toBeVisible();
  // A changed contact pair cannot reuse the proof even when the client jumps directly to the API.
  const changed = await page.request.post("/api/experience", {
    headers: { Origin: baseURL! },
    data: {
      action: "order",
      ...profile,
      email: `other-${randomUUID()}@example.invalid`,
      phone: "09000000009",
      plan: "online",
      idempotencyKey: randomUUID(),
      consent: true,
      expectedTotal: 1499000,
      code: "",
    },
  });
  expect(changed.status()).toBe(422);
});

test("phone test signup supports password login without confirming an email or unlocking private records", async ({
  page,
  baseURL,
}) => {
  await page.goto("/portal");
  await page
    .getByRole("button", { name: "ساخت حساب مشتری", exact: true })
    .click();
  const phone = `090${String(randomInt(100000000)).padStart(8, "0")}`;
  await page.getByLabel("نام", { exact: true }).fill("مشتری");
  await page.getByLabel("نام خانوادگی", { exact: true }).fill("آزمایشی");
  await page
    .getByRole("textbox", { name: "ایمیل", exact: true })
    .fill(`portal-${randomUUID()}@example.invalid`);
  await page.getByLabel("شماره موبایل", { exact: true }).fill(phone);
  await page
    .getByLabel("رمز عبور", { exact: true })
    .fill("synthetic-customer-password");
  await page
    .getByRole("radio", { name: "موبایل (آزمایشی)", exact: true })
    .check();
  await page
    .getByRole("button", { name: "ساخت حساب مشتری", exact: true })
    .click();
  await page.getByLabel("کد تأیید", { exact: true }).fill("123456");
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("portal-otp.png") });
  await page
    .getByRole("button", { name: "تأیید و ساخت حساب", exact: true })
    .click();
  await expect(
    page.getByText("حساب آزمایشی موبایل", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("حساب آزمایشی موبایل", { exact: true }),
  ).toBeVisible();
  expect(
    (
      await page.request.get(
        "/api/documents/cases/33000000-0000-4000-8000-000000000001",
      )
    ).status(),
  ).toBe(401);
  expect(
    (await page.request.get("/api/backoffice/growth?section=orders")).status(),
  ).toBe(401);
  await page.getByRole("button", { name: "خروج از حساب", exact: true }).click();
  await page.getByLabel("ایمیل یا موبایل", { exact: true }).fill(phone);
  await page
    .getByLabel("رمز عبور", { exact: true })
    .fill("synthetic-customer-password");
  await page
    .getByRole("button", { name: "ورود به پرتال", exact: true })
    .click();
  await expect(
    page.getByText("حساب آزمایشی موبایل", { exact: true }),
  ).toBeVisible();
  // The public signup endpoint never overwrites an existing phone account or its password.
  const retry = await page.request.post("/api/portal/session", {
    headers: { Origin: baseURL! },
    data: {
      action: "register",
      method: "test_phone",
      firstName: "مشتری",
      lastName: "آزمایشی",
      email: "different@example.invalid",
      phone,
      password: "replacement-password",
    },
  });
  expect([409, 422]).toContain(retry.status());
});

test("email signup waits for real confirmation and does not grant a session", async ({
  page,
}) => {
  await page.goto("/portal");
  await page
    .getByRole("button", { name: "ساخت حساب مشتری", exact: true })
    .click();
  await page.getByLabel("نام", { exact: true }).fill("مشتری");
  await page.getByLabel("نام خانوادگی", { exact: true }).fill("ایمیلی");
  await page
    .getByRole("textbox", { name: "ایمیل", exact: true })
    .fill(`email-${randomUUID()}@example.invalid`);
  await page.getByLabel("شماره موبایل", { exact: true }).fill("09000000005");
  await page
    .getByLabel("رمز عبور", { exact: true })
    .fill("synthetic-customer-password");
  await page
    .getByRole("button", { name: "ساخت حساب مشتری", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "لینک تأیید را در ایمیل باز کنید.",
  );
  expect(
    (
      await page.request.get(
        "/api/documents/cases/33000000-0000-4000-8000-000000000001",
      )
    ).status(),
  ).toBe(401);
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
