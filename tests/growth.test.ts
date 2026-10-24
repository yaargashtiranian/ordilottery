import { test } from "node:test";
import assert from "node:assert/strict";
import { couponCode, validateCampaign } from "../src/lib/growth/model";
import {
  gatewaySettings,
  rials,
  requestGateway,
  verifyGateway,
} from "../src/lib/growth/zarinpal";

/** Input and mocked provider contracts cover money conversion and untrusted gateway responses. */
test("coupon normalization and bounded campaign rules", () => {
  assert.equal(couponCode(" fall۱۰۰ "), "FALL100");
  assert.throws(() => couponCode("<script>"));
  const valid = {
    code: "VALID",
    name: "کمپین",
    percent: "۱۰۰",
    max_uses: "۵",
    starts_at: "2026-01-01T00:00:00Z",
    ends_at: "2027-01-01T00:00:00Z",
    plan: "all",
    mode: "simulation",
  };
  assert.equal(validateCampaign(valid).percent, 100);
  for (const patch of [
    { percent: 101 },
    { percent: 0 },
    { max_uses: 0 },
    { max_uses: 1.5 },
    { ends_at: "invalid" },
    { plan: "cheap" },
    { mode: "unknown" },
  ])
    assert.throws(() => validateCampaign({ ...valid, ...patch }));
});
test("rials conversion rejects unsafe or fractional money", () => {
  assert.equal(rials(749500), 7495000);
  for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER])
    assert.throws(() => rials(value));
});
test("simulation never provides a bank endpoint; only HTTPS canonical callbacks allowed", () => {
  assert.equal(gatewaySettings("simulation"), null);
  assert.equal(
    gatewaySettings("live", {
      ZARINPAL_MERCHANT_ID: "test",
      SITE_URL: "http://example.com",
    }),
    null,
  );
  assert.equal(
    gatewaySettings("sandbox", {
      ENABLE_CHECKOUT: "true",
      ZARINPAL_MERCHANT_ID: "test",
      SITE_URL: "https://example.com",
    })?.api,
    "https://sandbox.zarinpal.com/pg/v4/payment",
  );
});

test("disabled gateway cannot create an endpoint even with otherwise complete credentials", () => {
  for (const mode of ["live", "sandbox"] as const) {
    assert.equal(
      gatewaySettings(mode, {
        ENABLE_CHECKOUT: "false",
        ZARINPAL_MERCHANT_ID: "synthetic",
        SITE_URL: "https://example.invalid",
      }),
      null,
    );
  }
});
test("request and verification use the server amount and validated authority, never browser status", async () => {
  const settings = gatewaySettings("sandbox", {
    ENABLE_CHECKOUT: "true",
    ZARINPAL_MERCHANT_ID: "test",
    SITE_URL: "https://example.com",
  })!;
  const authority = "S" + "1".repeat(35);
  const requestMock: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.amount, 7495000);
    assert.equal(body.currency, "IRR");
    assert.ok(
      body.callback_url.startsWith(
        "https://example.com/api/payments/callback?order=",
      ),
    );
    return Response.json({ data: { code: 100, authority } });
  };
  assert.equal(
    await requestGateway(settings, "id", 749500, requestMock),
    authority,
  );
  for (const code of [100, 101]) {
    assert.equal(
      await verifyGateway(settings, authority, 749500, async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.amount, 7495000);
        assert.equal(body.authority, authority);
        return Response.json({ data: { code, ref_id: 12345 } });
      }),
      "12345",
    );
  }
  await assert.rejects(
    verifyGateway(settings, authority, 749500, async () =>
      Response.json({ data: { code: -51, ref_id: 12345 } }),
    ),
  );
  await assert.rejects(
    requestGateway(settings, "id", 749500, async () =>
      Response.json({ data: { code: 100, authority: "https://evil.example" } }),
    ),
  );
});
