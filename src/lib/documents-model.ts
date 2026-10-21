/** Technical intake limits are not official DV photo or identity requirements. */
export const documentRules = {
  maxBytes: 5 * 1024 * 1024,
  kinds: { general: "مدرک پرونده", photo: "عکس", identity: "مدرک هویتی" },
  roles: { applicant: "متقاضی اصلی", spouse: "همسر", child: "فرزند" },
  mimeTypes: ["image/jpeg", "image/png", "application/pdf"],
} as const;
export const documentStatuses = {
  pending: "در انتظار بررسی",
  approved: "تأیید شده",
  rejected: "رد شده",
};
export type CaseDocument = {
  id: string;
  case_id: string;
  group_id: string;
  version: number;
  title: string;
  kind: keyof typeof documentRules.kinds;
  applicant_role: keyof typeof documentRules.roles;
  filename: string;
  mime_type: string;
  byte_size: number;
  sha256: string;
  source: "customer" | "staff";
  uploaded: boolean;
  status: keyof typeof documentStatuses;
  review_note: string;
  revision: number;
  created_at: string;
  reviewed_at: string | null;
  erased: boolean;
};
export type DocumentAccess = {
  case_id: string;
  case_number: number;
  customer_email: string;
  enabled: boolean;
  retention_at: string | null;
};
export type DocumentPayload = {
  documents: CaseDocument[];
  access: DocumentAccess;
  configured: boolean;
  expired: boolean;
};

/** Inspect magic bytes as well as the supplied MIME; filenames never select a parser. */
export function validateDocumentBytes(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > documentRules.maxBytes)
    throw new Error("حجم فایل باید بین ۱ بایت و ۵ مگابایت باشد.");
  const starts = (...signature: number[]) =>
    signature.every((n, i) => bytes[i] === n);
  const png =
    starts(137, 80, 78, 71, 13, 10, 26, 10) &&
    bytes.length >= 33 &&
    new TextDecoder().decode(bytes.slice(12, 16)) === "IHDR";
  const jpeg =
    starts(255, 216, 255) &&
    bytes.length > 4 &&
    bytes[bytes.length - 2] === 255 &&
    bytes[bytes.length - 1] === 217;
  const pdf =
    new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-" &&
    new TextDecoder().decode(bytes.slice(-1024)).includes("%%EOF");
  if (!(
    (mime === "image/png" && png) ||
    (mime === "image/jpeg" && jpeg) ||
    (mime === "application/pdf" && pdf)
  ))
    throw new Error("محتوای فایل با PDF، JPEG یا PNG معتبر مطابقت ندارد.");
  if (png) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16),
      height = view.getUint32(20);
    if (!width || !height || width * height > 40_000_000)
      throw new Error("ابعاد تصویر قابل پذیرش نیست؛ حداکثر ۴۰ میلیون پیکسل.");
  }
}
