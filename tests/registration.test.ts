import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRegistration, normalizeDigits } from "../src/lib/registration";
import { handleRegistration } from "../src/lib/checkout";
import { getCampaignState } from "../src/lib/campaign";
import type { CheckoutConfig } from "../src/lib/checkout-config";

const valid = {
  firstName: "سارا",
  lastName: "ایرانی",
  email: "sara@example.com",
  phone: "۰۹۱۲۳۴۵۶۷۸۹",
  plan: "online",
  idempotencyKey: "3d6a76e4-70f1-4b52-921c-f260a68b039e",
};
const config: CheckoutConfig = {
  apiUrl: "https://cms.example.test/bridge",
  token: "test-credential-not-real",
  allowedOrigins: ["https://checkout.example.test"],
};

/** All provider calls in this suite are injected fakes; no live charges or leads. */
function request(body: unknown = valid, headers: Record<string, string> = {}) {
  return new Request("https://site.example.test/api/registration", {
    method: "POST",
    headers: {
      Origin: "https://site.example.test",
      "Content-Type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("normalizes both Persian and Arabic digit sets", () => {
  assert.equal(
    normalizeDigits("۰۱۲۳۴۵۶۷۸۹ / ٠١٢٣٤٥٦٧٨٩"),
    "0123456789 / 0123456789",
  );
});

test("validates names, trims input and accepts an international Iran prefix", () => {
  const result = validateRegistration({
    ...valid,
    firstName: "  سارا  ",
    phone: "+98 (912) 345-6789",
  });
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.data.phone, "09123456789");
    assert.equal(result.data.firstName, "سارا");
  }
});

test("rejects malformed applicant fields with field-specific errors", () => {
  const result = validateRegistration({
    ...valid,
    firstName: "<script>",
    lastName: "ا",
    email: "bad",
    phone: "123",
  });
  assert.equal(result.valid, false);
  if (!result.valid)
    assert.deepEqual(Object.keys(result.fields), [
      "firstName",
      "lastName",
      "email",
      "phone",
    ]);
});

test("names require a letter, while legitimate separators remain accepted", () => {
  for (const firstName of ["..", "--", "''", "\u200c\u200c", "\u064e\u064f"]) {
    const result = validateRegistration({ ...valid, firstName });
    assert.equal(
      result.valid,
      false,
      `Punctuation or marks alone are not a name`,
    );
    if (!result.valid) assert.ok(result.fields.firstName);
  }
  for (const firstName of ["علی‌رضا", "Anne-Marie", "O’Connor"]) {
    assert.equal(validateRegistration({ ...valid, firstName }).valid, true);
  }
});

test("JSON media type is exact while charset parameters remain supported", async () => {
  for (const type of [
    "application/jsonp",
    "application/json-extra",
    "text/json",
  ]) {
    assert.equal(
      (await handleRegistration(request(valid, { "Content-Type": type }), null))
        .status,
      415,
    );
  }
  assert.equal(
    (
      await handleRegistration(
        request(valid, { "Content-Type": "application/json; charset=utf-8" }),
        null,
      )
    ).status,
    503,
  );
});

test("rejects unknown plans and invalid retry identifiers", () => {
  assert.equal(validateRegistration({ ...valid, plan: "free" }).valid, false);
  assert.equal(
    validateRegistration({ ...valid, idempotencyKey: "123" }).valid,
    false,
  );
  assert.equal(validateRegistration(null).valid, false);
});

test("unconfigured backend returns 503 and never sends applicant information", async () => {
  let called = false;
  const response = await handleRegistration(request(), null, async () => {
    called = true;
    throw new Error();
  });
  assert.equal(response.status, 503);
  assert.equal(called, false);
  assert.equal((await response.json()).code, "NOT_CONFIGURED");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("rejects foreign origins and non-JSON submissions", async () => {
  assert.equal(
    (
      await handleRegistration(
        request(valid, { Origin: "https://attacker.test" }),
        config,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handleRegistration(
        request(valid, { "Content-Type": "text/plain" }),
        config,
      )
    ).status,
    415,
  );
});

test("same-origin requests survive Next's internal bind URL reconstruction", async () => {
  const incoming = new Request("http://0.0.0.0:3000/api/registration", {
    method: "POST",
    headers: {
      Host: "127.0.0.1:3000",
      Origin: "http://127.0.0.1:3000",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(valid),
  });
  assert.equal((await handleRegistration(incoming, null)).status, 503);
});

test("configured public origin takes precedence over request or forwarded host", async () => {
  const incoming = request(valid, {
    Host: "internal:3000",
    "X-Forwarded-Host": "attacker.test",
  });
  assert.equal(
    (
      await handleRegistration(
        incoming,
        null,
        fetch,
        "https://site.example.test",
      )
    ).status,
    503,
  );
  assert.equal(
    (
      await handleRegistration(
        request(valid, { Origin: "https://attacker.test" }),
        null,
        fetch,
        "https://site.example.test",
      )
    ).status,
    403,
  );
});

test("rejects invalid JSON and oversized actual bodies even without Content-Length", async () => {
  assert.equal((await handleRegistration(request("{"), null)).status, 400);
  assert.equal(
    (await handleRegistration(request("x".repeat(9000)), null)).status,
    413,
  );
  assert.equal(
    (
      await handleRegistration(
        request(valid, { "Content-Length": "9000" }),
        null,
      )
    ).status,
    413,
  );
});

test("invalid fields fail before any provider service request", async () => {
  const response = await handleRegistration(
    request({ ...valid, email: "broken" }),
    config,
    async () => {
      throw new Error("Should not call");
    },
  );
  assert.equal(response.status, 422);
  assert.ok((await response.json()).fields.email);
});

test("server uses its own package price and normalized data, not a browser amount", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, `${config.apiUrl}/requests`);
    assert.equal(init?.redirect, "error");
    const body = JSON.parse(init?.body as string);
    assert.equal(body.amount, 1_499_000);
    assert.equal(body.currency, "IRT");
    assert.equal(body.applicant.phone, "09123456789");
    assert.equal(
      new Headers(init?.headers).get("Idempotency-Key"),
      valid.idempotencyKey,
    );
    assert.equal(body.idempotencyKey, valid.idempotencyKey);
    return Response.json({
      requestId: "private-order",
      checkoutUrl: "https://checkout.example.test/pay/123",
    });
  };
  const response = await handleRegistration(
    request({ ...valid, amount: 1, currency: "USD" }),
    config,
    fetcher,
  );
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    checkoutUrl: "https://checkout.example.test/pay/123",
  });
  assert.equal(calls, 1);
});

test("retries carry the same idempotency key to the bridge", async () => {
  const keys: string[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    keys.push(new Headers(init?.headers).get("Idempotency-Key")!);
    return Response.json({
      requestId: "same-order",
      checkoutUrl: "https://checkout.example.test/pay/same",
    });
  };
  await handleRegistration(request(), config, fetcher);
  await handleRegistration(request(), config, fetcher);
  assert.deepEqual(keys, [valid.idempotencyKey, valid.idempotencyKey]);
  // Persistent deduplication itself must be verified on the real provider service plugin.
});

for (const destination of [
  "http://checkout.example.test/pay",
  "https://checkout.example.test.evil.test/pay",
  "https://user:secret@checkout.example.test/pay",
  "javascript:alert(1)",
]) {
  test(`refuses unsafe checkout destination: ${destination.split(":")[0]} / ${destination.includes("evil") ? "lookalike" : destination.includes("secret") ? "userinfo" : "protocol"}`, async () => {
    const response = await handleRegistration(request(), config, async () =>
      Response.json({ requestId: "order", checkoutUrl: destination }),
    );
    assert.equal(response.status, 502);
  });
}

test("upstream failures and invalid replies never leak credentials or payloads", async () => {
  for (const fetcher of [
    async () => new Response("private diagnostic", { status: 500 }),
    async () =>
      Response.json({ checkoutUrl: "https://checkout.example.test/pay" }),
    async () => {
      throw new Error("secret diagnostic");
    },
  ]) {
    const response = await handleRegistration(request(), config, fetcher);
    assert.equal(response.status, 502);
    const text = await response.text();
    assert.equal(text.includes(config.token), false);
    assert.equal(text.includes(valid.email), false);
    assert.equal(text.includes("diagnostic"), false);
  }
});

const now = Date.parse("2026-10-16T12:00:00Z");
const sourced = {
  startsAt: "2026-10-20T12:00:00Z",
  sourceUrl: "https://travel.state.gov/official-notice",
  verifiedAt: "2026-10-15T12:00:00Z",
};

test("countdown stays unannounced for missing, invalid or untrusted dates and sources", () => {
  for (const value of [
    { ...sourced, startsAt: null },
    { ...sourced, sourceUrl: null },
    { ...sourced, verifiedAt: null },
    { ...sourced, sourceUrl: "https://travel.state.gov.attacker.test/" },
    { ...sourced, sourceUrl: "http://travel.state.gov/" },
    { ...sourced, sourceUrl: "https://user:password@travel.state.gov/" },
    { ...sourced, startsAt: "2026-10-20" },
    { ...sourced, startsAt: "not-a-date" },
    { ...sourced, verifiedAt: "2027-01-01" },
  ])
    assert.equal(getCampaignState(value, now).kind, "unannounced");
});

test("sourced future countdown has correct remaining time", () => {
  assert.deepEqual(getCampaignState(sourced, now), {
    kind: "upcoming",
    remaining: 4 * 86400000,
  });
});

test("timer expiry never returns an open-registration state", () => {
  assert.deepEqual(
    getCampaignState({ ...sourced, startsAt: "2026-10-16T12:00:00Z" }, now),
    { kind: "elapsed" },
  );
});
