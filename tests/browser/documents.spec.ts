import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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
  await expect(page.getByLabel("رمز عبور")).toBeFocused();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
