import { test } from "node:test";
import assert from "node:assert/strict";
import { getCheckoutConfig } from "../src/lib/checkout-config";

const defaults = {
  ENABLE_CHECKOUT: "true",
  WORDPRESS_API_URL: "https://cms.example.test/bridge/",
  WORDPRESS_API_TOKEN: "test-only-placeholder",
  CHECKOUT_ALLOWED_ORIGINS: "https://checkout.example.test",
};

/** Scope synthetic configuration to each assertion and preserve real bindings. */
function withConfig(overrides: Partial<typeof defaults>, check: () => void) {
  const previous = new Map(
    Object.keys(defaults).map((name) => [name, process.env[name]]),
  );
  try {
    Object.assign(process.env, defaults, overrides);
    check();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("checkout is disabled unless explicitly enabled with every binding", () => {
  for (const name of Object.keys(defaults)) {
    withConfig({ [name]: "" }, () => assert.equal(getCheckoutConfig(), null));
  }
  withConfig({ ENABLE_CHECKOUT: "false" }, () =>
    assert.equal(getCheckoutConfig(), null),
  );
});

test("accepts exact HTTPS origins and normalizes the bridge's trailing slash", () => {
  withConfig(
    {
      CHECKOUT_ALLOWED_ORIGINS:
        " https://checkout.example.test, https://bank.example.test ",
    },
    () => {
      const config = getCheckoutConfig();
      assert.equal(config?.apiUrl, "https://cms.example.test/bridge");
      assert.deepEqual(config?.allowedOrigins, [
        "https://checkout.example.test",
        "https://bank.example.test",
      ]);
    },
  );
});

test("refuses insecure or credential-bearing bridge configuration", () => {
  for (const url of [
    "http://cms.example.test/bridge",
    "https://user:pass@cms.example.test/bridge",
    "https://cms.example.test/bridge?token=test",
    "https://cms.example.test/bridge#fragment",
    "not-a-url",
  ]) {
    withConfig({ WORDPRESS_API_URL: url }, () =>
      assert.equal(getCheckoutConfig(), null),
    );
  }
});

test("refuses wildcard, path, HTTP and credential-bearing checkout origins", () => {
  for (const origin of [
    "*",
    "https://*.example.test",
    "https://checkout.example.test/pay",
    "http://checkout.example.test",
    "https://user:pass@checkout.example.test",
    "https://checkout.example.test/",
  ]) {
    withConfig({ CHECKOUT_ALLOWED_ORIGINS: origin }, () =>
      assert.equal(getCheckoutConfig(), null),
    );
  }
});
