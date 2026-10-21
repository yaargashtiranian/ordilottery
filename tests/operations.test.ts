import { test } from "node:test";
import assert from "node:assert/strict";
import { validateOperation, searchPattern } from "../src/lib/operations-model";
import { plans } from "../src/lib/site";
const id = "10000000-0000-4000-8000-000000000001";
test("operational contacts normalize Persian phone digits and reject malformed fields", () => {
  const result = validateOperation("customers", {
    id,
    firstName: "سارا",
    lastName: "ایرانی",
    email: "Sara@example.invalid",
    phone: "۰۹۱۲۳۴۵۶۷۸۹",
  });
  assert.equal(result.phone, "09123456789");
  assert.equal(result.email, "sara@example.invalid");
  assert.throws(() =>
    validateOperation("customers", {
      id,
      firstName: "<x>",
      lastName: "ایرانی",
      email: "bad",
      phone: "000",
    }),
  );
});
test("case prices and manual verification flags cannot come from the browser", () => {
  const result = validateOperation("cases", {
    id,
    customer_id: id,
    plan: "online",
    quoted_amount: 1,
  });
  assert.equal(result.quoted_amount, plans.online.price);
  const payment = validateOperation("payments", {
    id,
    case_id: id,
    amount: "۱٬۴۹۹٬۰۰۰",
    reference: "receipt-1",
    status: "recorded",
    source: "gateway",
    gateway_verified: true,
  });
  assert.equal(payment.amount, 1499000);
  assert.equal(payment.gateway_verified, false);
  assert.equal(payment.source, "manual");
  for (const amount of [0, -1, 1.5, "NaN", 10000000001])
    assert.throws(() =>
      validateOperation("payments", {
        id,
        case_id: id,
        amount,
        reference: "receipt",
        status: "recorded",
      }),
    );
});
test("case updates require a version, a reason and approved review before completion", () => {
  const input = {
    revision: 2,
    service_status: "completed",
    review_status: "approved",
    priority: "normal",
    note: "بررسی شد",
  };
  assert.equal(validateOperation("cases", input, true).revision, 3);
  for (const patch of [
    { revision: 0 },
    { note: "" },
    { review_status: "in_review" },
    { follow_up_on: "2026-02-30" },
    { priority: "__proto__" },
  ])
    assert.throws(() =>
      validateOperation("cases", { ...input, ...patch }, true),
    );
});
test("support requests and notes validate relationships and bound text", () => {
  assert.throws(() =>
    validateOperation("support", {
      id,
      customer_id: id,
      case_id: "wrong",
      subject: "موضوع",
      channel: "phone",
      priority: "normal",
      body: "شرح",
    }),
  );
  assert.throws(() =>
    validateOperation("notes", { id, ticket_id: id, body: "x".repeat(4001) }),
  );
  assert.throws(() => validateOperation("payments", { revision: 1 }, true));
  assert.equal(searchPattern("٪ ۱۲%_\\"), "%٪ 12\\%\\_\\\\%");
});
