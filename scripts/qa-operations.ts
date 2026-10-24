import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import {
  fixtureCustomers,
  fixtureCases,
  fixtureTickets,
  fixturePayments,
  fixtureMessages,
  fixtureActivity,
  fixturePayload,
} from "../tests/fixtures/operations";
import {
  validateOperation,
  type OperationsSection,
} from "../src/lib/operations-model";

// UI-only API mocks exercise forms; the independent SQL transaction tests real database rules.
async function main() {
  const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
      (existsSync(chrome) ? chrome : undefined),
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  });
  const page = await context.newPage();
  page.on("dialog", (dialog) => dialog.accept());
  const records: Record<string, Record<string, unknown>[]> = JSON.parse(
    JSON.stringify({
      customers: fixtureCustomers,
      cases: fixtureCases,
      payments: fixturePayments,
      support: fixtureTickets,
    }),
  );
  const messages = structuredClone(fixtureMessages);
  let rejectEdit = false;
  await page.route("**/api/backoffice/operations/**", async (route) => {
    const url = new URL(route.request().url());
    const [entity, id] = url.pathname.split("/").slice(-2);
    const isDetail = ["customers", "cases", "payments", "support"].includes(
      entity,
    );
    const resource = isDetail ? entity : id;
    const table = records[resource] ?? [];
    if (route.request().method() === "GET") {
      if (resource === "overview") {
        await route.fulfill({ json: fixturePayload("overview") });
        return;
      }
      if (isDetail) {
        const record = table.find((item) => item.id === id);
        const payments = records.payments.filter((item) => item.case_id === id);
        await route.fulfill({
          json: {
            record,
            activity: fixtureActivity,
            cases: records.cases.filter((item) => item.customer_id === id),
            payments,
            tickets: records.support.filter(
              (item) => item.customer_id === id || item.case_id === id,
            ),
            messages: messages.filter((item) => item.ticket_id === id),
            financials: {
              net_recorded: payments.reduce(
                (sum, item) => sum + Number(item.amount),
                0,
              ),
              receipt_count: payments.length,
            },
          },
        });
      } else {
        const q = url.searchParams.get("q");
        const rows = q
          ? table.filter((item) => JSON.stringify(item).includes(q))
          : table;
        await route.fulfill({
          json: {
            rows,
            total: rows.length,
            page: 1,
            summary: null,
            activity: [],
          },
        });
      }
      return;
    }
    const input = route.request().postDataJSON();
    if (route.request().method() === "PATCH" && rejectEdit) {
      await route.fulfill({
        status: 409,
        json: { error: "نسخه جدیدتری ثبت شده است." },
      });
      return;
    }
    if (resource === "notes") {
      const note = {
        id: input.id,
        ticket_id: input.ticket_id,
        body: input.body,
        created_at: "2026-10-21T11:00:00Z",
      };
      messages.push(note);
      await route.fulfill({ json: { record: note } });
      return;
    }
    const payload = validateOperation(
      resource,
      input,
      route.request().method() === "PATCH",
    );
    if (isDetail) {
      Object.assign(
        table.find((item) => item.id === id)!,
        payload,
      );
      await route.fulfill({
        json: { record: table.find((item) => item.id === id) },
      });
    } else {
      const record = {
        ...payload,
        created_at: "2026-10-21T11:00:00Z",
        updated_at: "2026-10-21T11:00:00Z",
        revision: 1,
      };
      table.push(record);
      await route.fulfill({ json: { record } });
    }
  });
  mkdirSync("test-results/operations-qa", { recursive: true });
  const results: { label: string; issues: unknown[] }[] = [];
  async function visit(section: OperationsSection, id?: string) {
    await page.goto(
      `http://localhost:3000/operations-qa-temp?section=${section}${id ? `&id=${id}` : ""}`,
    );
    await page.getByRole("heading", { level: 1 }).waitFor();
    if (id) await page.locator(".ops-detail-header").waitFor();
  }
  async function audit(label: string) {
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    const issues = result.violations.map((item) => ({
      id: item.id,
      nodes: item.nodes.map((node) => ({
        target: node.target,
        reason: node.failureSummary,
      })),
    }));
    results.push({ label, issues });
    console.log(label, JSON.stringify(issues));
    assert.equal(issues.length, 0, `${label}: accessibility issues`);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
  }
  try {
    await visit("overview");
    await audit("desktop-overview");
    await page.screenshot({
      path: "test-results/operations-qa/overview-desktop.png",
      fullPage: true,
    });
    await visit("customers");
    await page.getByRole("button", { name: "مشتری جدید", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await audit("customer-form");
    await page.locator("#ops-firstName").fill("نمونه");
    await page.locator("#ops-lastName").fill("تازه");
    await page.locator("#ops-email").fill("new@example.invalid");
    await page.locator("#ops-phone").fill("09000000002");
    await page
      .getByRole("button", { name: "ذخیره مشتری", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "نمونه تازه", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "ویرایش مشتری", exact: true })
      .click();
    await page.locator("#ops-firstName").fill("حفظ‌شده");
    rejectEdit = true;
    await page
      .getByRole("button", { name: "ذخیره مشتری", exact: true })
      .click();
    await page.getByRole("alert").filter({ hasText: "نسخه جدیدتری" }).waitFor();
    assert.equal(await page.locator("#ops-firstName").inputValue(), "حفظ‌شده");
    await page.getByRole("button", { name: "انصراف", exact: true }).click();
    rejectEdit = false;
    await visit("cases", fixtureCases[0].id);
    await audit("desktop-case-detail");
    await page.screenshot({
      path: "test-results/operations-qa/case-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "به‌روزرسانی پرونده", exact: true })
      .click();
    await page.getByLabel("روند انجام خدمت").selectOption("ready");
    await page.getByLabel("وضعیت بررسی مدارک").selectOption("approved");
    await page
      .getByLabel("شرح تغییر برای تاریخچه")
      .fill("اطلاعات بررسی و تأیید شد.");
    await page
      .getByRole("button", { name: "ذخیره پرونده", exact: true })
      .click();
    await page
      .getByText("اطلاعات با موفقیت ذخیره شد.", { exact: true })
      .waitFor();
    await visit("payments");
    await audit("payments");
    await page.screenshot({
      path: "test-results/operations-qa/payments-desktop.png",
      fullPage: true,
    });
    await visit("support", fixtureTickets[0].id);
    await page
      .getByRole("button", { name: "یادداشت جدید", exact: true })
      .click();
    await page
      .getByLabel("یادداشت داخلی پشتیبانی")
      .fill("یادداشت مرورگر برای ادامه پیگیری.");
    await page
      .getByRole("button", { name: "ذخیره یادداشت", exact: true })
      .click();
    await page
      .getByText("یادداشت مرورگر برای ادامه پیگیری.", { exact: true })
      .waitFor();
    await audit("support-detail");
    await page.setViewportSize({ width: 390, height: 844 });
    await visit("overview");
    await audit("mobile-overview");
    await page.screenshot({
      path: "test-results/operations-qa/overview-mobile.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "باز کردن منو" }).click();
    await page
      .getByRole("link", { name: "سوابق پرداخت", exact: true })
      .waitFor();
    await page.keyboard.press("Escape");
    await visit("cases", fixtureCases[0].id);
    await audit("mobile-case-detail");
    await page.screenshot({
      path: "test-results/operations-qa/case-mobile.png",
      fullPage: true,
    });
    writeFileSync(
      "test-results/operations-qa/result.json",
      JSON.stringify(results, null, 2),
    );
    console.log(
      "UI customer-create, stale-edit preservation, case-update and support-note: passed (mock API)",
    );
  } finally {
    await browser.close();
  }
}
/** Mount only synthetic UI in a temporary development route, then remove it even on failure. */
async function runWithFixture() {
  const directory = resolve("src/app/operations-qa-temp");
  const path = resolve(directory, "page.tsx");
  if (existsSync(path))
    throw new Error(
      "Temporary fixture path already exists; refusing to overwrite it.",
    );
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path,
    `import {notFound} from "next/navigation";
import {OperationsWorkspace} from "@/components/backoffice/operations-workspace";
import {sections,type OperationsSection} from "@/lib/operations-model";
import {fixturePayload} from "../../../tests/fixtures/operations";
import "../backoffice/backoffice.css";
import "../backoffice/operations.css";
export default async function Preview({searchParams}:{searchParams:Promise<{section?:string;id?:string}>}){
if(process.env.NODE_ENV!=="development")notFound();
const params=await searchParams;
const section=Object.hasOwn(sections,params.section??"")?params.section as OperationsSection:"overview";
return <div className="backoffice"><OperationsWorkspace key={section+(params.id??"")} access={{enabled:true,is_owner:true,permissions:[]}} email="manager@example.invalid" section={section} initialData={fixturePayload(section)} initialId={params.id}/></div>;
}`,
  );
  try {
    await main();
  } finally {
    unlinkSync(path);
  }
}
void runWithFixture().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
