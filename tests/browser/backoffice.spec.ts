import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Exercise the real protected routes without creating accounts or sending email. */
test("backoffice redirects anonymous visitors and refuses API writes", async ({
  page,
  request,
  baseURL,
}) => {
  await page.goto("/backoffice");
  await expect(page).toHaveURL(/\/backoffice\/login$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "مدیریت جزئیات",
  );
  expect((await request.get("/api/backoffice/pages")).status()).toBe(401);
  for (const section of [
    "customers",
    "cases",
    "payments",
    "support",
    "content",
  ]) {
    await page.goto(`/backoffice/${section}`);
    await expect(page).toHaveURL(/\/backoffice\/login$/);
  }
  for (const entity of [
    "overview",
    "customers",
    "cases",
    "payments",
    "support",
  ]) {
    const response = await request.get(`/api/backoffice/operations/${entity}`);
    expect(response.status()).toBe(401);
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
  expect(
    (
      await request.post("/api/backoffice/operations/customers", {
        headers: { Origin: baseURL! },
        data: {},
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/backoffice/operations/payments", {
        headers: { Origin: "https://untrusted.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.patch("/api/backoffice/pages/home", {
        headers: { Origin: baseURL! },
        data: { action: "publish" },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.patch("/api/backoffice/pages/home", {
        headers: { Origin: "https://untrusted.example" },
        data: { action: "publish" },
      })
    ).status(),
  ).toBe(403);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
});

test("login supports keyboard entry and first-account mode without sending credentials", async ({
  page,
}) => {
  await page.goto("/backoffice/login");
  await page
    .getByRole("button", { name: "اولین ورود؟ ساخت حساب مدیر" })
    .click();
  await expect(
    page.getByRole("button", { name: "ساخت حساب مدیر", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("رمز عبور")).toHaveAttribute(
    "autocomplete",
    "new-password",
  );
  await page.getByLabel("ایمیل مدیریت").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("رمز عبور")).toBeFocused();
});
