import { test } from "node:test";
import assert from "node:assert/strict";
import { getCheckoutConfig } from "../src/lib/checkout-config";

test("unimplemented direct payment remains disabled even if a stale enable flag is set", () => {
  const previous = process.env.ENABLE_CHECKOUT;
  try {
    process.env.ENABLE_CHECKOUT = "true";
    assert.equal(getCheckoutConfig(), null);
  } finally {
    if (previous === undefined) delete process.env.ENABLE_CHECKOUT;
    else process.env.ENABLE_CHECKOUT = previous;
  }
});
