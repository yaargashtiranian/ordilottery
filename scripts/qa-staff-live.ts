import { createClient } from "@supabase/supabase-js";
import {
  chromium,
  expect as baseExpect,
  type BrowserContext,
} from "@playwright/test";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const expect = baseExpect.configure({ timeout: 30000 });

/** Real Auth + RLS integration, using temporary confirmed accounts without sending email or SMS. */
async function main() {
  const origin = process.env.QA_ORIGIN || "http://localhost:3200";
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  const admin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const marker = `qa-staff-${randomBytes(6).toString("hex")}`;
  const ownerEmail = `${marker}-owner@example.invalid`,
    staffEmail = `${marker}-limited@example.invalid`;
  const password = randomBytes(24).toString("hex");
  const ids: string[] = [];
  const contexts: BrowserContext[] = [];
  const browser = await chromium.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  try {
    for (const email of [ownerEmail, staffEmail]) {
      const result = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (result.error) throw result.error;
      ids.push(result.data.user.id);
    }
    const membership = await admin.from("cms_editors").insert({
      email: ownerEmail,
      display_name: "مدیر آزمایش",
      is_owner: true,
    });
    if (membership.error) throw membership.error;
    const ownerContext = await browser.newContext({
      baseURL: origin,
      viewport: { width: 1440, height: 1000 },
    });
    contexts.push(ownerContext);
    const ownerPage = await ownerContext.newPage();
    ownerPage.setDefaultTimeout(30000);
    await ownerPage.goto("/backoffice/login");
    await ownerPage.getByLabel("ایمیل مدیریت").fill(ownerEmail);
    await ownerPage.getByLabel("رمز عبور").fill(password);
    await ownerPage
      .getByRole("button", { name: "ورود به بک‌آفیس", exact: true })
      .click();
    await ownerPage.waitForURL("**/backoffice");
    await ownerPage
      .getByRole("link", { name: "کاربران و دسترسی‌ها", exact: true })
      .click();
    await ownerPage
      .getByLabel("نام و نام خانوادگی", { exact: true })
      .fill("کارشناس آزمایشی");
    await ownerPage.getByLabel("ایمیل", { exact: true }).fill(staffEmail);
    await ownerPage.getByLabel("گفت‌وگوی مشتریان", { exact: true }).check();
    await ownerPage
      .getByRole("button", { name: "ذخیره کاربر", exact: true })
      .click();
    await expect(ownerPage.getByRole("status")).toHaveText("کاربر ذخیره شد.");
    const row = ownerPage
      .locator(".staff-member")
      .filter({ has: ownerPage.locator("small", { hasText: staffEmail }) });
    await expect(row).toBeVisible();
    await ownerPage.screenshot({
      path: "test-results/staff-desktop.png",
      fullPage: true,
    });
    await ownerPage.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await ownerPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await ownerPage.screenshot({
      path: "test-results/staff-mobile.png",
      fullPage: true,
    });
    await ownerPage.setViewportSize({ width: 1440, height: 1000 });
    const staffContext = await browser.newContext({
      baseURL: origin,
      viewport: { width: 1440, height: 1000 },
    });
    contexts.push(staffContext);
    const staffPage = await staffContext.newPage();
    staffPage.setDefaultTimeout(30000);
    await staffPage.goto("/backoffice/login");
    await staffPage.getByLabel("ایمیل مدیریت").fill(staffEmail);
    await staffPage.getByLabel("رمز عبور").fill(password);
    await staffPage
      .getByRole("button", { name: "ورود به بک‌آفیس", exact: true })
      .click();
    await staffPage.waitForURL("**/backoffice/chat");
    for (const label of [
      "کاربران و دسترسی‌ها",
      "سوابق پرداخت",
      "محتوای صفحات",
      "پرونده‌ها",
    ])
      await expect(
        staffPage
          .getByRole("navigation")
          .getByRole("link", { name: label, exact: true }),
      ).toHaveCount(0);
    for (const path of [
      "/api/backoffice/users",
      "/api/backoffice/pages",
      "/api/backoffice/growth?section=orders",
      "/api/backoffice/operations/customers",
    ]) {
      const response = await staffContext.request.get(path);
      assert.ok([401, 403].includes(response.status()), path);
    }
    const forbidden = await staffContext.request.post("/api/backoffice/users", {
      headers: { Origin: origin },
      data: {
        email: staffEmail,
        name: "Escalation",
        permissions: ["users"],
        enabled: true,
        revision: 1,
      },
    });
    assert.equal(forbidden.status(), 403);
    await staffPage.goto("/backoffice/users");
    await staffPage.waitForURL("**/backoffice/chat");
    const direct = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    );
    const login = await direct.auth.signInWithPassword({
      email: staffEmail,
      password,
    });
    if (login.error) throw login.error;
    const blocked = await direct.rpc("backoffice_save_staff", {
      p_email: staffEmail,
      p_name: "Escalation",
      p_permissions: ["users"],
      p_enabled: true,
      p_revision: 1,
    });
    assert.equal(blocked.error?.code, "42501");
    await row.getByRole("button", { name: "ویرایش", exact: true }).click();
    await ownerPage.getByLabel("حساب فعال", { exact: true }).uncheck();
    await ownerPage
      .getByRole("button", { name: "ذخیره کاربر", exact: true })
      .click();
    await expect(ownerPage.getByRole("status")).toHaveText("کاربر ذخیره شد.");
    const revoked = await staffContext.request.get(
      "/api/backoffice/growth?section=notifications",
    );
    assert.equal(revoked.status(), 401);
    const revokedSql = await direct.rpc("growth_staff_notifications");
    assert.equal(revokedSql.error?.code, "42501");
    await staffPage.reload();
    await staffPage.waitForURL("**/backoffice/login");
    console.log(
      "PASS real staff UI creation, desktop/mobile layout, scoped navigation/API/RLS, self-escalation denial, immediate session revocation",
    );
  } finally {
    for (const context of contexts) await context.close();
    await browser.close();
    if (ids[0]) {
      const result = await admin
        .from("backoffice_access_log")
        .delete()
        .eq("actor_id", ids[0]);
      if (result.error) throw result.error;
    }
    const memberships = await admin
      .from("cms_editors")
      .delete()
      .in("email", [ownerEmail, staffEmail]);
    if (memberships.error) throw memberships.error;
    for (const id of ids) {
      const result = await admin.auth.admin.deleteUser(id);
      if (result.error) throw result.error;
    }
    console.log("Temporary staff fixtures removed");
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message.split("Call log:")[0]
      : "Staff QA failed",
  );
  process.exitCode = 1;
});
