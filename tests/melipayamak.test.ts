import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getMelipayamakConfig,
  melipayamakEndpoint,
  sendRegistrationSms,
  type MelipayamakConfig,
} from "../src/lib/melipayamak";
import { notifyRegistration } from "../src/lib/registration-notification";
import { handleRegistration } from "../src/lib/checkout";
import type { CheckoutConfig } from "../src/lib/checkout-config";

const sms: MelipayamakConfig = {
  username: "synthetic-user",
  password: "synthetic-api-password",
  registrationBodyId: "1234",
};
const provider: CheckoutConfig = {
  apiUrl: "https://cms.example.test/bridge",
  token: "synthetic-provider-token",
  allowedOrigins: ["https://checkout.example.test"],
};
const message = { to: "۰۹۱۲۳۴۵۶۷۸۹", firstName: "سارا", reference: "YG-1001" };
const providerId = "20095843916754837";

/** All addresses/credentials in this suite are synthetic; fetch never uses the network. */
test("SMS requires an explicit switch, all bindings and a positive approved template ID", () => {
  const fixture = {
    ENABLE_MELIPAYAMAK: "true",
    MELIPAYAMAK_USERNAME: sms.username,
    MELIPAYAMAK_PASSWORD: sms.password,
    MELIPAYAMAK_REGISTRATION_BODY_ID: sms.registrationBodyId,
  };
  const previous = new Map(
    Object.keys(fixture).map((key) => [key, process.env[key]]),
  );
  try {
    Object.assign(process.env, fixture);
    assert.deepEqual(getMelipayamakConfig(), sms);
    for (const key of Object.keys(fixture)) {
      Object.assign(process.env, fixture, { [key]: "" });
      assert.equal(getMelipayamakConfig(), null);
    }
    for (const id of ["0", "-1", "12;34", "not-a-template", "9999999999999"]) {
      Object.assign(process.env, fixture, {
        MELIPAYAMAK_REGISTRATION_BODY_ID: id,
      });
      assert.equal(getMelipayamakConfig(), null);
    }
    Object.assign(process.env, fixture, { ENABLE_MELIPAYAMAK: "false" });
    assert.equal(getMelipayamakConfig(), null);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("uses the fixed HTTPS provider, form encoding and approved parameter order", async () => {
  const result = await sendRegistrationSms(sms, message, async (url, init) => {
    assert.equal(url, melipayamakEndpoint);
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    assert.ok(init?.signal);
    const body = new URLSearchParams(init?.body as string);
    assert.deepEqual(Object.fromEntries(body), {
      username: sms.username,
      password: sms.password,
      to: "09123456789",
      bodyId: "1234",
      text: "سارا;YG-1001",
    });
    return Response.json({
      RetStatus: 1,
      Value: providerId,
      StrRetStatus: "Ok",
    });
  });
  assert.deepEqual(result, { status: "accepted", providerId });
});

test("rejects invalid recipients and template injection without calling the provider", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    throw new Error("Unexpected provider call");
  };
  for (const candidate of [
    { ...message, to: "123" },
    { ...message, firstName: "سارا;متغیر اضافه" },
    { ...message, firstName: "سارا\nمتن دیگر" },
    { ...message, reference: "https://attacker.test" },
    { ...message, firstName: "" },
    { ...message, firstName: "ا".repeat(81) },
  ])
    assert.equal(
      (await sendRegistrationSms(sms, candidate, fetcher)).status,
      "rejected",
    );
  assert.equal(calls, 0);
});

test("normalizes the Iranian international prefix and preserves a safe numeric ID", async () => {
  const result = await sendRegistrationSms(
    sms,
    { ...message, to: "+98 (912) 345-6789" },
    async (_url, init) => {
      assert.equal(
        new URLSearchParams(init?.body as string).get("to"),
        "09123456789",
      );
      return Response.json({ RetStatus: 1, Value: 123456 });
    },
  );
  assert.deepEqual(result, { status: "accepted", providerId: "123456" });
});

test("explicit provider rejection is distinct from uncertain HTTP or response failures", async () => {
  for (const body of [
    { RetStatus: 2, Value: "-1" },
    { RetStatus: 1, Value: "0" },
    { RetStatus: 1, Value: "-7" },
  ]) {
    assert.deepEqual(
      await sendRegistrationSms(sms, message, async () => Response.json(body)),
      { status: "rejected", reason: "provider_rejected" },
    );
  }
  for (const body of [
    null,
    {},
    { RetStatus: "1", Value: providerId },
    { RetStatus: 1, Value: Number.MAX_SAFE_INTEGER + 1 },
    { RetStatus: 1, Value: "unexpected-private-error" },
  ]) {
    assert.deepEqual(
      await sendRegistrationSms(sms, message, async () => Response.json(body)),
      { status: "unknown", reason: "invalid_response" },
    );
  }
  assert.deepEqual(
    await sendRegistrationSms(
      sms,
      message,
      async () => new Response("private diagnostic", { status: 503 }),
    ),
    { status: "unknown", reason: "http_error" },
  );
});

test("network/JSON errors are sanitized and never automatically retried", async () => {
  for (const invalidJson of [false, true]) {
    let calls = 0;
    const result = await sendRegistrationSms(sms, message, async () => {
      calls++;
      if (invalidJson) return new Response("not JSON: private diagnostic");
      throw new Error(`Timeout containing ${sms.password}`);
    });
    assert.deepEqual(result, { status: "unknown", reason: "network_error" });
    assert.equal(calls, 1);
    assert.equal(JSON.stringify(result).includes(sms.password), false);
  }
});

/** The fake models atomic notification claims; it is not a live provider integration. */
function bridge(
  options: { recordFails?: boolean; smsTimesOut?: boolean } = {},
) {
  let claimed = false;
  const providerCalls: unknown[] = [];
  const results: Record<string, unknown>[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    const target = String(url);
    if (target.endsWith("/claim")) {
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        `Bearer ${provider.token}`,
      );
      if (claimed) return new Response(null, { status: 204 });
      claimed = true;
      return Response.json(
        { notificationId: "sms-1", ...message },
        { status: 201 },
      );
    }
    if (target === melipayamakEndpoint) {
      providerCalls.push(init?.body);
      if (options.smsTimesOut) throw new Error("Ambiguous network timeout");
      return Response.json({ RetStatus: 1, Value: providerId });
    }
    if (target.endsWith("/result")) {
      results.push(JSON.parse(init?.body as string));
      assert.equal(
        new Headers(init?.headers).get("Idempotency-Key"),
        "sms-result:sms-1",
      );
      return new Response(null, { status: options.recordFails ? 503 : 204 });
    }
    throw new Error("Unexpected destination");
  };
  return { fetcher, providerCalls, results };
}

test("concurrent notification attempts send once only after a durable claim", async () => {
  const fake = bridge();
  const results = await Promise.all([
    notifyRegistration(provider, sms, "request-1", fake.fetcher),
    notifyRegistration(provider, sms, "request-1", fake.fetcher),
  ]);
  assert.deepEqual(results, [{ status: "accepted" }, { status: "skipped" }]);
  assert.equal(fake.providerCalls.length, 1);
  assert.deepEqual(fake.results, [
    { notificationId: "sms-1", status: "accepted", providerId },
  ]);
});

test("missing bridge/claim errors do not send any SMS", async () => {
  for (const status of [200, 401, 404, 500]) {
    let calls = 0;
    const result = await notifyRegistration(
      provider,
      sms,
      "request-1",
      async () => {
        calls++;
        return new Response("unavailable", { status });
      },
    );
    assert.deepEqual(result, { status: "claim_failed" });
    assert.equal(calls, 1);
  }
  assert.deepEqual(
    await notifyRegistration(provider, sms, "request-1", async () => {
      throw new Error("offline");
    }),
    { status: "claim_failed" },
  );
});

test("malformed claims and invalid persisted recipients cannot trigger a paid send", async () => {
  for (const event of [
    {},
    { notificationId: "../unsafe", ...message },
    { notificationId: "sms-1", ...message, to: 123 },
  ]) {
    let calls = 0;
    const result = await notifyRegistration(
      provider,
      sms,
      "request-1",
      async () => {
        calls++;
        return Response.json(event, { status: 201 });
      },
    );
    assert.deepEqual(result, { status: "claim_failed" });
    assert.equal(calls, 1);
  }
  const urls: string[] = [];
  const result = await notifyRegistration(
    provider,
    sms,
    "request-1",
    async (url) => {
      urls.push(String(url));
      return String(url).endsWith("/claim")
        ? Response.json(
            { notificationId: "sms-1", ...message, to: "invalid" },
            { status: 201 },
          )
        : new Response(null, { status: 204 });
    },
  );
  assert.deepEqual(result, { status: "rejected" });
  assert.equal(urls.includes(melipayamakEndpoint), false);
});

test("unknown provider outcome is recorded and a replay does not resend", async () => {
  const fake = bridge({ smsTimesOut: true });
  assert.deepEqual(
    await notifyRegistration(provider, sms, "request-1", fake.fetcher),
    { status: "unknown" },
  );
  assert.deepEqual(
    await notifyRegistration(provider, sms, "request-1", fake.fetcher),
    { status: "skipped" },
  );
  assert.equal(fake.providerCalls.length, 1);
  assert.deepEqual(fake.results, [
    { notificationId: "sms-1", status: "unknown", reason: "network_error" },
  ]);
});

test("result-write failure does not authorize a second SMS", async () => {
  const fake = bridge({ recordFails: true });
  assert.deepEqual(
    await notifyRegistration(provider, sms, "request-1", fake.fetcher),
    { status: "record_failed", sendStatus: "accepted" },
  );
  assert.deepEqual(
    await notifyRegistration(provider, sms, "request-1", fake.fetcher),
    { status: "skipped" },
  );
  assert.equal(fake.providerCalls.length, 1);
});

test("checkout triggers a notification only for a persisted, validated request", async () => {
  const input = {
    firstName: "سارا",
    lastName: "ایرانی",
    email: "sara@example.com",
    phone: "09123456789",
    plan: "online",
    idempotencyKey: "3d6a76e4-70f1-4b52-921c-f260a68b039e",
  };
  const incoming = () =>
    new Request("https://site.example.test/api/registration", {
      method: "POST",
      headers: {
        Origin: "https://site.example.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  const notified: string[] = [];
  const notify = (id: string) => {
    notified.push(id);
  };
  assert.equal(
    (await handleRegistration(incoming(), null, fetch, undefined, notify))
      .status,
    503,
  );
  assert.equal(notified.length, 0);
  const bad = await handleRegistration(
    incoming(),
    provider,
    async () =>
      Response.json({
        requestId: "request-1",
        checkoutUrl: "https://attacker.test",
      }),
    undefined,
    notify,
  );
  assert.equal(bad.status, 502);
  assert.equal(notified.length, 0);
  const good = () =>
    Response.json({
      requestId: "request-1",
      checkoutUrl: "https://checkout.example.test/pay",
    });
  assert.equal(
    (
      await handleRegistration(
        incoming(),
        provider,
        async () => good(),
        undefined,
        notify,
      )
    ).status,
    201,
  );
  assert.deepEqual(notified, ["request-1"]);
  assert.equal(
    (
      await handleRegistration(
        incoming(),
        provider,
        async () => good(),
        undefined,
        () => {
          throw new Error("Scheduler unavailable");
        },
      )
    ).status,
    201,
  );
});
