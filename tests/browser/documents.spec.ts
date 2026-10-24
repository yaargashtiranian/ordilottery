import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** The adapted template stays usable on both viewports without sending any registration or OTP request. */
test("portal template supports password visibility, sign-up navigation and RTL layout", async ({
  page,
}, testInfo) => {
  await page.goto("/portal");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "ورود به پرتال مشتری",
  );
  await page
    .getByLabel("ایمیل یا موبایل", { exact: true })
    .fill("customer@example.invalid");
  const password = page.getByLabel("رمز عبور", { exact: true });
  await password.fill("synthetic-password");
  await page
    .getByRole("button", { name: "نمایش رمز عبور", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "text");
  await page
    .getByRole("button", { name: "پنهان کردن رمز عبور", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(password).toHaveAttribute("type", "password");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("portal-sign-in.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "ساخت حساب مشتری", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "ساخت حساب مشتری",
  );
  await expect(password).toHaveValue("");
  await page.getByLabel("نام", { exact: true }).fill("سارا");
  await page.getByLabel("نام خانوادگی", { exact: true }).fill("ایرانی");
  await expect(
    page.getByRole("radio", { name: "ایمیل", exact: true }),
  ).toBeChecked();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.screenshot({
    path: testInfo.outputPath("portal-sign-up.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "حساب دارید؟ وارد شوید", exact: true })
    .click();
  await expect(page.getByLabel("ایمیل یا موبایل", { exact: true })).toHaveValue(
    "customer@example.invalid",
  );
});

/** Public routes exercise denial paths without creating accounts or sending confirmation emails. */
test("private document API denies anonymous/cross-site requests and portal has accessible login", async ({
  page,
  request,
  baseURL,
}) => {
  const id = "33000000-0000-4000-8000-000000000001";
  for (const path of [
    `/api/documents/cases/${id}`,
    `/api/documents/${id}/file`,
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
  expect(
    (
      await request.post(`/api/documents/cases/${id}`, {
        headers: { Origin: baseURL! },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.patch(`/api/documents/${id}`, {
        headers: { Origin: "https://untrusted.example" },
        data: { status: "approved" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/documents/maintenance", {
        headers: { Origin: baseURL! },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/portal/session", {
        headers: { Origin: "https://untrusted.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  await page.goto("/portal");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "پرتال مشتری",
  );
  await page.getByLabel("ایمیل یا موبایل").fill("customer@example.invalid");
  await page.getByLabel("ایمیل یا موبایل").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("رمز عبور", { exact: true })).toBeFocused();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
