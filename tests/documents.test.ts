import test from "node:test";
import assert from "node:assert/strict";
import {
  validateDocumentBytes,
  documentRules,
} from "../src/lib/documents-model";
import {
  encryptDocument,
  decryptDocument,
  documentHash,
} from "../src/lib/documents-crypto";

const pdf = new TextEncoder().encode("%PDF-1.7\n% synthetic test only\n%%EOF");
test("document validation rejects MIME spoofing, empty and oversized files", () => {
  assert.doesNotThrow(() => validateDocumentBytes(pdf, "application/pdf"));
  assert.throws(() => validateDocumentBytes(pdf, "image/jpeg"));
  assert.throws(() =>
    validateDocumentBytes(
      new TextEncoder().encode("<script>alert(1)</script>"),
      "application/pdf",
    ),
  );
  assert.throws(() => validateDocumentBytes(new Uint8Array(), "image/png"));
  assert.throws(() =>
    validateDocumentBytes(
      new Uint8Array(documentRules.maxBytes + 1),
      "application/pdf",
    ),
  );
});
test("authenticated encryption binds file bytes to both case and version", () => {
  const previous = process.env.DOCUMENTS_ENCRYPTION_KEY;
  try {
    process.env.DOCUMENTS_ENCRYPTION_KEY = "ab".repeat(32);
    const encrypted = encryptDocument(pdf, "case/version");
    assert.equal(
      documentHash(decryptDocument(encrypted, "case/version")),
      documentHash(pdf),
    );
    assert.notDeepEqual(encrypted, pdf);
    assert.throws(() => decryptDocument(encrypted, "another-case/version"));
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 1;
    assert.throws(() => decryptDocument(tampered, "case/version"));
    process.env.DOCUMENTS_ENCRYPTION_KEY = "cd".repeat(32);
    assert.throws(() => decryptDocument(encrypted, "case/version"));
  } finally {
    if (previous === undefined) delete process.env.DOCUMENTS_ENCRYPTION_KEY;
    else process.env.DOCUMENTS_ENCRYPTION_KEY = previous;
  }
});
