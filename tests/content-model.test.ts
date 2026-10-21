import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultPageContent,
  isPageSlug,
  validatePageContent,
} from "../src/lib/content-model";
import {
  isBackofficeOrigin,
  readBackofficeBody,
} from "../src/lib/backoffice-request";

test("CMS accepts complete copy and rejects partial or unexpected fields", () => {
  const content = defaultPageContent("home");
  assert.deepEqual(validatePageContent("home", content), content);
  const { eyebrow: removed, ...partial } = content;
  assert.ok(removed);
  assert.equal(validatePageContent("home", partial), null);
  assert.equal(
    validatePageContent("home", { ...content, unexpected: "value" }),
    null,
  );
  assert.equal(
    validatePageContent("home", { ...content, eyebrow: "  " }),
    null,
  );
  assert.equal(
    validatePageContent("home", { ...content, eyebrow: "x".repeat(4001) }),
    null,
  );
  assert.equal(validatePageContent("home", { ...content, eyebrow: 42 }), null);
});

test("CMS slug checks exclude inherited properties and arbitrary paths", () => {
  assert.equal(isPageSlug("home"), true);
  for (const slug of [
    "__proto__",
    "constructor",
    "toString",
    "../privacy",
    "other",
  ])
    assert.equal(isPageSlug(slug), false);
});

test("backoffice rejects missing/cross-site origins and bounds streaming JSON bodies", async () => {
  const request = (origin: string | null, body: string) =>
    new Request("https://example.com/api/backoffice/pages/home", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...(origin ? { origin } : {}),
      },
      body,
    });
  const original = process.env.SITE_URL;
  delete process.env.SITE_URL;
  try {
    assert.equal(
      isBackofficeOrigin(request("https://example.com", "{}")),
      true,
    );
    assert.equal(
      isBackofficeOrigin(request("https://evil.example", "{}")),
      false,
    );
    assert.equal(
      isBackofficeOrigin(
        new Request("http://localhost:3000/api/backoffice/pages/home", {
          method: "PATCH",
          headers: { host: "127.0.0.1:3100", origin: "http://127.0.0.1:3100" },
        }),
      ),
      true,
    );
    assert.equal(isBackofficeOrigin(request(null, "{}")), false);
    assert.deepEqual(
      await readBackofficeBody(request("https://example.com", '{"ok":true}')),
      { ok: true },
    );
    assert.equal(
      await readBackofficeBody(
        request("https://example.com", '{"value":"' + "x".repeat(100) + '"}'),
        30,
      ),
      null,
    );
    assert.equal(
      await readBackofficeBody(request("https://example.com", "[]")),
      null,
    );
    assert.equal(
      await readBackofficeBody(request("https://example.com", "invalid")),
      null,
    );
  } finally {
    if (original === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = original;
  }
});
