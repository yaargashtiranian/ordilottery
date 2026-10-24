import { getBackofficeSession } from "@/lib/backoffice-auth";
import { backofficeJson } from "@/lib/backoffice-request";

/** Page drafts are available only after both identity and editor membership checks. */
export async function GET() {
  try {
    const session = await getBackofficeSession("content");
    if (!session)
      return backofficeJson({ error: "لطفاً با حساب مدیر وارد شوید." }, 401);
    const { data, error } = await session.client
      .from("cms_pages")
      .select("*")
      .order("slug");
    if (error) return backofficeJson({ error: "دریافت صفحات انجام نشد." }, 503);
    return backofficeJson({ pages: data });
  } catch {
    return backofficeJson({ error: "ارتباط با پایگاه داده برقرار نشد." }, 503);
  }
}
