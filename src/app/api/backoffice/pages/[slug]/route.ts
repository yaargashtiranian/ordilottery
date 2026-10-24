import { getBackofficeSession } from "@/lib/backoffice-auth";
import {
  backofficeJson,
  isBackofficeOrigin,
  readBackofficeBody,
} from "@/lib/backoffice-request";
import { isPageSlug, validatePageContent } from "@/lib/content-model";

/** A version predicate makes save/publish atomic and prevents overwriting another editor. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  if (!isBackofficeOrigin(request))
    return backofficeJson({ error: "مبدأ درخواست معتبر نیست." }, 403);
  const { slug } = await context.params;
  if (!isPageSlug(slug))
    return backofficeJson({ error: "صفحه پیدا نشد." }, 404);
  try {
    const session = await getBackofficeSession("content");
    if (!session)
      return backofficeJson(
        { error: "نشست شما معتبر نیست. دوباره وارد شوید." },
        401,
      );
    const input = await readBackofficeBody(request);
    const content = validatePageContent(slug, input?.content);
    if (
      !input ||
      !content ||
      !Number.isSafeInteger(input.revision) ||
      Number(input.revision) < 1 ||
      !["save", "publish"].includes(String(input.action))
    ) {
      return backofficeJson(
        {
          error:
            "محتوای صفحه معتبر نیست؛ همه فیلدها الزامی و حداکثر ۴۰۰۰ نویسه هستند.",
        },
        400,
      );
    }
    const now = new Date().toISOString();
    const { data, error } = await session.client
      .from("cms_pages")
      .update({
        draft_content: content,
        revision: Number(input.revision) + 1,
        updated_at: now,
        updated_by: session.user.id,
        ...(input.action === "publish"
          ? { published_content: content, published_at: now }
          : {}),
      })
      .eq("slug", slug)
      .eq("revision", input.revision)
      .select("*")
      .maybeSingle();
    if (error)
      return backofficeJson(
        { error: "ذخیره انجام نشد. دوباره تلاش کنید." },
        503,
      );
    if (!data)
      return backofficeJson(
        {
          error:
            "نسخه جدیدتری ذخیره شده است. متن خود را نگه دارید و صفحه را دوباره بارگذاری کنید.",
        },
        409,
      );
    return backofficeJson({ page: data });
  } catch {
    return backofficeJson(
      { error: "ارتباط با پایگاه داده برقرار نشد؛ تغییری تأیید نشده است." },
      503,
    );
  }
}
