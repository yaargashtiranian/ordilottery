import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/** AES-GCM authenticates each version and prevents copying ciphertext into another case. */
function key() {
  const value = process.env.DOCUMENTS_ENCRYPTION_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value))
    throw new Error("Document encryption is not configured");
  return Buffer.from(value, "hex");
}
export function documentsConfigured() {
  return /^[a-f0-9]{64}$/i.test(process.env.DOCUMENTS_ENCRYPTION_KEY || "");
}
export function encryptDocument(bytes: Uint8Array, identity: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(identity));
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}
export function decryptDocument(bytes: Uint8Array, identity: string) {
  const value = Buffer.from(bytes);
  const cipher = createDecipheriv("aes-256-gcm", key(), value.subarray(0, 12));
  cipher.setAAD(Buffer.from(identity));
  cipher.setAuthTag(value.subarray(12, 28));
  return Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]);
}
export function documentHash(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}
