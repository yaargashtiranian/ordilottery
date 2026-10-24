import { getBackofficeSession } from "@/lib/backoffice-auth";
import {
  backofficeJson as json,
  isBackofficeOrigin,
  readBackofficeBody,
} from "@/lib/backoffice-request";
import { normalizeStaffPermissions } from "@/lib/backoffice-permissions";

/** All membership reads and writes use the caller's JWT, including the audited database mutation. */
export async function GET() {
  try {
    const session = await getBackofficeSession("users");
    if (!session)
      return json({ error: "دسترسی مدیریت کاربران لازم است." }, 403);
    const [members, log] = await Promise.all([
      session.client
        .from("cms_editors")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
      session.client
        .from("backoffice_access_log")
        .select("id,email,actor_id,created_at")
        .order("id", { ascending: false })
        .limit(30),
    ]);
    if (members.error || log.error) throw new Error();
    return json({ members: members.data, log: log.data });
  } catch {
    return json({ error: "دریافت کاربران انجام نشد." }, 503);
  }
}

/** Revision checks and owner/self protection are repeated in SQL so direct RPC calls cannot bypass them. */
export async function POST(request: Request) {
  if (!isBackofficeOrigin(request))
    return json({ error: "مبدأ نامعتبر است." }, 403);
  try {
    const session = await getBackofficeSession("users");
    if (!session)
      return json({ error: "دسترسی مدیریت کاربران لازم است." }, 403);
    const input = await readBackofficeBody(request, 5000);
    const permissions = normalizeStaffPermissions(input?.permissions);
    if (
      !input ||
      typeof input.email !== "string" ||
      typeof input.name !== "string" ||
      input.name.trim().length < 2 ||
      input.name.length > 100 ||
      input.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) ||
      typeof input.enabled !== "boolean" ||
      !permissions ||
      (input.enabled && !permissions.length) ||
      !Number.isSafeInteger(input.revision) ||
      Number(input.revision) < 0
    )
      return json({ error: "نام، ایمیل و دسترسی‌ها را بررسی کنید." }, 422);
    const { error } = await session.client.rpc("backoffice_save_staff", {
      p_email: input.email.trim().toLowerCase(),
      p_name: input.name.trim(),
      p_permissions: permissions,
      p_enabled: input.enabled,
      p_revision: input.revision,
    });
    if (error)
      return json(
        {
          error:
            error.code === "40001"
              ? "اطلاعات تغییر کرده؛ فهرست را تازه کنید."
              : error.code === "42501"
                ? "تغییر حساب مالک یا حساب خودتان مجاز نیست."
                : "ذخیره کاربر انجام نشد.",
        },
        error.code === "40001" ? 409 : error.code === "42501" ? 403 : 422,
      );
    return json({ ok: true });
  } catch {
    return json({ error: "ارتباط برقرار نشد؛ ذخیره تأیید نشده است." }, 503);
  }
}
