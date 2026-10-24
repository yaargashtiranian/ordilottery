import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID, randomInt } from "node:crypto";
const phone = () => `090${String(randomInt(10000000, 99999999))}`;

test("new-order SMS proof uses the provider code without exposing it or accepting the old fixed code", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "مسیر من را بساز", exact: true })
    .click();
  await page.getByLabel("نام (الزامی)", { exact: true }).fill("مشتری");
  await page
    .getByLabel("نام خانوادگی (الزامی)", { exact: true })
    .fill("آزمایشی");
  await page
    .getByLabel("ایمیل (الزامی)", { exact: true })
    .fill(`otp-${randomUUID()}@example.invalid`);
  await page.getByLabel("شماره تماس (الزامی)", { exact: true }).fill(phone());
  await page
    .getByRole("button", { name: "دیدن خلاصه و قیمت", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "تأیید موبایل (آزمایشی)", exact: true }),
  ).toHaveCount(0);
  const started = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/portal/verification") &&
      r.request().postDataJSON()?.channel === "mobile",
  );
  await page
    .getByRole("button", { name: "تأیید با پیامک", exact: true })
    .click();
  const response = await started;
  expect(response.status()).toBe(200);
  expect(await response.text()).not.toContain("0741437414");
  await page.getByLabel("کد تأیید", { exact: true }).fill("123456");
  await page
    .getByRole("button", { name: "تأیید و ادامه", exact: true })
    .click();
  await expect(
    page.locator(".customer-verification").getByRole("alert"),
  ).toContainText("کد نادرست");
  await page.getByRole("button", { name: "ارسال دوباره", exact: true }).click();
  await expect(
    page.locator(".customer-verification").getByRole("alert"),
  ).toContainText("یک دقیقه");
  await page.getByLabel("کد تأیید", { exact: true }).fill("۰۷۴۱۴۳۷۴۱۴");
  await page
    .getByRole("button", { name: "تأیید و ادامه", exact: true })
    .click();
  await expect(page.getByText("کد تخفیف داری؟", { exact: true })).toBeVisible();
});

test("SMS signup creates a phone-proven account with password login while keeping email/document authority separate", async ({
  page,
}) => {
  const mobile = phone();
  await page.goto("/portal");
  await page
    .getByRole("button", { name: "ساخت حساب مشتری", exact: true })
    .click();
  await page.getByLabel("نام", { exact: true }).fill("مشتری");
  await page.getByLabel("نام خانوادگی", { exact: true }).fill("آزمایشی");
  await page
    .getByRole("textbox", { name: "ایمیل", exact: true })
    .fill(`phone-${randomUUID()}@example.invalid`);
  await page.getByLabel("شماره موبایل", { exact: true }).fill(mobile);
  await page
    .getByLabel("رمز عبور", { exact: true })
    .fill("synthetic-phone-password");
  await page.getByRole("radio", { name: "موبایل", exact: true }).check();
  await page
    .getByRole("button", { name: "ساخت حساب مشتری", exact: true })
    .click();
  await page.getByLabel("کد تأیید", { exact: true }).fill("0741437414");
  const axe = await new AxeBuilder({ page })
    .include(".portal-auth-panel")
    .analyze();
  expect(axe.violations).toEqual([]);
  await page
    .getByRole("button", { name: "تأیید و ساخت حساب", exact: true })
    .click();
  await expect(
    page.getByText("برای دسترسی به مدارک، ایمیل پرونده را تأیید کنید.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("حساب آزمایشی موبایل", { exact: true }),
  ).toHaveCount(0);
  const who = await page.context().request.get("/api/backoffice/users");
  expect(who.status()).toBe(403);
  await page.getByRole("button", { name: "خروج از حساب", exact: true }).click();
  await page.getByLabel("ایمیل یا موبایل", { exact: true }).fill(mobile);
  await page
    .getByLabel("رمز عبور", { exact: true })
    .fill("synthetic-phone-password");
  await page
    .getByRole("button", { name: "ورود به پرتال", exact: true })
    .click();
  await expect(
    page.getByText("برای دسترسی به مدارک، ایمیل پرونده را تأیید کنید.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("provider rejection is sanitized and leaves the challenge unverified", async ({
  request,
  baseURL,
}) => {
  const result = await request.post("/api/portal/verification", {
    headers: { Origin: baseURL! },
    data: {
      action: "start",
      channel: "mobile",
      profile: {
        firstName: "مشتری",
        lastName: "آزمایشی",
        email: `rejected-${randomUUID()}@example.invalid`,
        phone: "09000000999",
      },
    },
  });
  expect([429, 503]).toContain(result.status());
  const text = await result.text();
  expect(text).not.toContain("private");
  expect(text).not.toContain("0741437414");
  const current = await request.get("/api/portal/verification");
  expect((await current.json()).check?.verified).not.toBe(true);
});
