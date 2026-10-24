import "server-only";
import { hasStaffAccess, type StaffAccess } from "./backoffice-permissions";
import { createBackofficeClient } from "@/lib/backoffice-auth";
import {
  documentRules,
  validateDocumentBytes,
  type CaseDocument,
  type DocumentAccess,
} from "@/lib/documents-model";
import {
  decryptDocument,
  documentHash,
  documentsConfigured,
  encryptDocument,
} from "@/lib/documents-crypto";
import { isUuid } from "@/lib/operations-model";
import { isTestLoginEmail } from "./customer-verification";
import {
  backofficeJson,
  isBackofficeOrigin,
  readBackofficeBody,
} from "@/lib/backoffice-request";

const bucket = "case-documents";
type Session = NonNullable<Awaited<ReturnType<typeof documentSession>>>;
type RouteContext = { params: Promise<{ id: string }> };
type AccessState = DocumentAccess & { expired: boolean };

/** Customers use explicit invitations; staff document authority is separate from other backoffice sections. */
export async function documentSession() {
  const client = await createBackofficeClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (
    error ||
    !user?.email ||
    !user.email_confirmed_at ||
    isTestLoginEmail(user.email)
  )
    return null;
  const { data, error: membershipError } = await client
    .from("cms_editors")
    .select("enabled,is_owner,permissions")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();
  if (membershipError) throw membershipError;
  return {
    client,
    user,
    staff: data ? hasStaffAccess(data as StaffAccess, "documents") : false,
  };
}
function fail(error: string, status = 400) {
  return backofficeJson({ error }, status);
}
function expired(access: { expired: boolean }) {
  return access.expired;
}
function path(doc: { case_id: string; id: string }, copy = "primary") {
  return `${doc.case_id}/${doc.id}/${copy}`;
}

/** Bound multipart bytes before parsing, including bodies with no Content-Length. */
async function boundedForm(request: Request) {
  const reader = request.body?.getReader();
  if (
    !reader ||
    !request.headers.get("content-type")?.startsWith("multipart/form-data;")
  )
    return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > documentRules.maxBytes + 24000) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": request.headers.get("content-type")! },
    }).formData();
  } catch {
    return null;
  }
}

/** Lists contain private metadata only. Cleanup never removes unexpired documents. */
export async function listDocuments(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return fail("پرونده پیدا نشد.", 404);
    const session = await documentSession();
    if (!session) return fail("ابتدا وارد حساب شوید.", 401);
    const { data: access, error } = await session.client
      .rpc("crm_document_access_state", { p_case_id: id })
      .returns<AccessState[]>()
      .maybeSingle();
    if (error) throw error;
    if (!access) return fail("پرونده پیدا نشد.", 404);
    const { data: documents, error: docError } = await session.client
      .from("crm_documents")
      .select("*")
      .eq("case_id", id)
      .eq("uploaded", true)
      .eq("erased", false)
      .order("created_at", { ascending: false });
    if (docError) throw docError;
    return backofficeJson({
      access,
      documents: expired(access) ? [] : documents,
      configured: documentsConfigured(),
      expired: expired(access),
    });
  } catch {
    return fail("دریافت مدارک انجام نشد.", 503);
  }
}

/** Staff explicitly open intake; a manual payment never opens it automatically. */
export async function setDocumentAccess(
  request: Request,
  context: RouteContext,
) {
  if (!isBackofficeOrigin(request))
    return fail("مبدأ درخواست معتبر نیست.", 403);
  try {
    const session = await documentSession();
    if (!session?.staff) return fail("دسترسی کارشناس لازم است.", 401);
    const { id } = await context.params;
    const input = await readBackofficeBody(request, 1000);
    if (!isUuid(id) || typeof input?.enabled !== "boolean")
      return fail("اطلاعات معتبر نیست.", 422);
    const { data, error } = await session.client
      .from("crm_document_access")
      .update({ enabled: input.enabled })
      .eq("case_id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return fail("پرونده پیدا نشد.", 404);
    return backofficeJson({ access: data });
  } catch {
    return fail("تغییر دسترسی انجام نشد.", 503);
  }
}

/** Immutable encrypted objects and backup must both persist before an upload is acknowledged. */
export async function uploadDocument(request: Request, context: RouteContext) {
  if (!isBackofficeOrigin(request))
    return fail("مبدأ درخواست معتبر نیست.", 403);
  try {
    const session = await documentSession();
    if (!session) return fail("ابتدا وارد حساب شوید.", 401);
    if (!documentsConfigured())
      return fail("فضای امن مدارک هنوز پیکربندی نشده است.", 503);
    const { id } = await context.params;
    if (!isUuid(id)) return fail("پرونده پیدا نشد.", 404);
    const { data: access, error: accessError } = await session.client
      .rpc("crm_document_access_state", { p_case_id: id })
      .returns<AccessState[]>()
      .maybeSingle();
    if (accessError) throw accessError;
    if (!access || (!session.staff && !access.enabled) || expired(access))
      return fail("دریافت مدارک برای این پرونده فعال نیست.", 403);
    const form = await boundedForm(request);
    const file = form?.get("file");
    if (!form || !(file instanceof File))
      return fail("فایل معتبر تا سقف ۵ مگابایت انتخاب کنید.", 422);
    const title = String(form.get("title") || "").trim();
    const kind = String(form.get("kind") || "general"),
      role = String(form.get("applicant_role") || "applicant");
    const groupId = String(form.get("group_id") || "");
    const uploadId = String(form.get("id") || "");
    if (
      !isUuid(uploadId) ||
      (groupId && !isUuid(groupId)) ||
      title.length < 2 ||
      title.length > 120 ||
      !Object.hasOwn(documentRules.kinds, kind) ||
      !Object.hasOwn(documentRules.roles, role)
    )
      return fail("عنوان و مشخصات مدرک معتبر نیست.", 422);
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      validateDocumentBytes(bytes, file.type);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "فایل معتبر نیست.", 422);
    }
    const hash = documentHash(bytes);
    const doc = {
      id: uploadId,
      case_id: id,
      group_id: groupId || uploadId,
      title,
      kind,
      applicant_role: role,
      filename:
        file.name.replace(/[\x00-\x1f/\\]/g, "_").slice(0, 160) || "document",
      mime_type: file.type,
      byte_size: file.size,
      sha256: hash,
      source: session.staff ? "staff" : "customer",
    };
    // Stable upload IDs allow a retry to finish a partial primary/backup upload without duplication.
    const { data: existing, error: existingError } = await session.client
      .from("crm_documents")
      .select("*")
      .eq("id", uploadId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (
      existing &&
      (existing.case_id !== id ||
        existing.uploaded_by !== session.user.id ||
        existing.sha256 !== hash ||
        existing.group_id !== doc.group_id)
    )
      return fail("شناسه بارگذاری با فایل دیگری استفاده شده است.", 409);
    if (existing?.uploaded) return backofficeJson({ document: existing });
    let record = existing;
    if (!record) {
      const result = await session.client
        .from("crm_documents")
        .insert(doc)
        .select("*")
        .single();
      if (result.error)
        return fail(
          "ثبت نسخه مدرک انجام نشد؛ پرونده و نسخه قبلی را بررسی کنید.",
          409,
        );
      record = result.data;
    }
    const encrypted = encryptDocument(bytes, `${id}/${uploadId}`);
    for (const copy of ["primary", "backup"]) {
      const objectPath = path(doc, copy);
      const { error } = await session.client.storage
        .from(bucket)
        .upload(objectPath, encrypted, {
          contentType: "application/octet-stream",
          upsert: false,
        });
      if (error) {
        // On an uncertain response, authenticate the stored ciphertext rather than overwrite it.
        const saved = await session.client.storage
          .from(bucket)
          .download(objectPath);
        if (
          saved.error ||
          documentHash(
            decryptDocument(
              new Uint8Array(await saved.data.arrayBuffer()),
              `${id}/${uploadId}`,
            ),
          ) !== hash
        )
          throw error;
      }
    }
    const { data, error } = await session.client
      .from("crm_documents")
      .update({ uploaded: true, revision: record.revision + 1 })
      .eq("id", uploadId)
      .eq("revision", record.revision)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return fail("نسخه تغییر کرده است؛ فهرست را تازه کنید.", 409);
    return backofficeJson({ document: data }, 201);
  } catch {
    return fail(
      "بارگذاری کامل نشد؛ فایل و پشتیبان تأیید نشده‌اند. با همان فایل دوباره تلاش کنید.",
      503,
    );
  }
}

/** Reviews use optimistic concurrency; rejecting always requires an actionable explanation. */
export async function reviewDocument(request: Request, context: RouteContext) {
  if (!isBackofficeOrigin(request))
    return fail("مبدأ درخواست معتبر نیست.", 403);
  try {
    const session = await documentSession();
    if (!session?.staff) return fail("دسترسی کارشناس لازم است.", 401);
    const { id } = await context.params;
    const input = await readBackofficeBody(request, 10000);
    if (
      !isUuid(id) ||
      !input ||
      !["approved", "rejected"].includes(String(input.status)) ||
      typeof input.note !== "string" ||
      input.note.trim().length > 2000 ||
      (input.status === "rejected" && input.note.trim().length < 3) ||
      !Number.isSafeInteger(input.revision)
    )
      return fail("نتیجه بررسی و دلیل رد (حداقل ۳ نویسه) را وارد کنید.", 422);
    const { data, error } = await session.client
      .from("crm_documents")
      .update({
        status: input.status,
        review_note: input.note.trim(),
        revision: Number(input.revision) + 1,
      })
      .eq("id", id)
      .eq("revision", input.revision)
      .eq("uploaded", true)
      .eq("erased", false)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return fail(
        "مدرک تغییر کرده است؛ فهرست را تازه کنید. متن شما حفظ شده است.",
        409,
      );
    return backofficeJson({ document: data });
  } catch {
    return fail("نتیجه بررسی ذخیره نشد.", 503);
  }
}

/** File bytes are decrypted only after both Auth and case ownership RLS succeed. No signed URL leaks. */
export async function downloadDocument(
  request: Request,
  context: RouteContext,
) {
  try {
    const session = await documentSession();
    if (!session) return fail("ابتدا وارد حساب شوید.", 401);
    const { id } = await context.params;
    if (!isUuid(id)) return fail("مدرک پیدا نشد.", 404);
    const { data: doc, error } = await session.client
      .from("crm_documents")
      .select("*")
      .eq("id", id)
      .eq("uploaded", true)
      .eq("erased", false)
      .maybeSingle();
    if (error) throw error;
    if (!doc) return fail("مدرک پیدا نشد.", 404);
    const { data: access, error: accessError } = await session.client
      .rpc("crm_document_access_state", { p_case_id: doc.case_id })
      .returns<AccessState[]>()
      .single();
    if (accessError) throw accessError;
    if (expired(access)) return fail("دوره نگهداری مدرک پایان یافته است.", 410);
    const recovery = new URL(request.url).searchParams.get("backup") === "1";
    if (recovery && !session.staff)
      return fail("بازیابی فقط برای کارشناس مجاز است.", 403);
    const bytes = await readDocumentCopy(
      session,
      doc,
      recovery ? "backup" : "primary",
    );
    const inline =
      doc.mime_type.startsWith("image/") &&
      new URL(request.url).searchParams.get("preview") === "1";
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": doc.mime_type,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
      },
    });
  } catch {
    return fail(
      "فایل دریافت نشد؛ کارشناس می‌تواند دریافت از پشتیبان را امتحان کند.",
      503,
    );
  }
}
async function readDocumentCopy(
  session: Session,
  doc: CaseDocument,
  copy: string,
) {
  const { data, error } = await session.client.storage
    .from(bucket)
    .download(path(doc, copy));
  if (error) throw error;
  const bytes = decryptDocument(
    new Uint8Array(await data.arrayBuffer()),
    `${doc.case_id}/${doc.id}`,
  );
  if (bytes.length !== doc.byte_size || documentHash(bytes) !== doc.sha256)
    throw new Error("Document integrity failed");
  validateDocumentBytes(bytes, doc.mime_type);
  return bytes;
}

/** Maintenance is a staff operation, retries storage deletes before marking metadata erased. */
export async function purgeExpiredDocuments(request: Request) {
  if (!isBackofficeOrigin(request))
    return fail("مبدأ درخواست معتبر نیست.", 403);
  try {
    const session = await documentSession();
    if (!session?.staff) return fail("دسترسی کارشناس لازم است.", 401);
    const caseId = new URL(request.url).searchParams.get("case_id");
    if (caseId && !isUuid(caseId)) return fail("شناسه پرونده معتبر نیست.", 422);
    let query = session.client.rpc("crm_document_expired_cases");
    if (caseId) query = query.eq("case_id", caseId);
    const { data: access, error } = await query;
    if (error) throw error;
    let deleted = 0;
    for (const item of access || []) {
      const result = await session.client
        .from("crm_documents")
        .select("*")
        .eq("case_id", item.case_id)
        .eq("erased", false);
      if (result.error) throw result.error;
      for (const doc of result.data || []) {
        const removed = await session.client.storage
          .from(bucket)
          .remove([path(doc), path(doc, "backup")]);
        if (removed.error) throw removed.error;
        const updated = await session.client
          .from("crm_documents")
          .update({ erased: true, revision: doc.revision + 1 })
          .eq("id", doc.id)
          .eq("revision", doc.revision)
          .select("id")
          .maybeSingle();
        if (updated.error || !updated.data)
          throw updated.error || new Error("Revision conflict");
        deleted++;
      }
    }
    return backofficeJson({ deleted });
  } catch {
    return fail("پاک‌سازی کامل نشد؛ دوباره تلاش کنید.", 503);
  }
}
