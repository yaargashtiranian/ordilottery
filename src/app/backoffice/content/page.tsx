import { hasStaffAccess, firstStaffPath } from "@/lib/backoffice-permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getBackofficeSession } from "@/lib/backoffice-auth";
import { BackofficeWorkspace } from "@/components/backoffice/workspace";
import { Button } from "@/components/ui/button";
import type { ContentPage } from "@/lib/content-model";

export const dynamic = "force-dynamic";

/** Authenticate in the page itself; a guessed route cannot expose editorial content. */
export default async function BackofficePage() {
  let session;
  try {
    session = await getBackofficeSession();
  } catch {
    return (
      <main className="bo-service-error">
        <h1>ارتباط با سرویس مدیریت برقرار نشد.</h1>
        <p>لطفاً دوباره تلاش کنید؛ اطلاعات شما تغییر نکرده است.</p>
        <Button asChild>
          <Link href="/backoffice/content">تلاش دوباره</Link>
        </Button>
      </main>
    );
  }
  if (!session) redirect("/backoffice/login");
  if (!hasStaffAccess(session.access, "content"))
    redirect(firstStaffPath(session.access));
  const { data, error } = await session.client
    .from("cms_pages")
    .select("*")
    .order("slug");
  return (
    <BackofficeWorkspace
      initialPages={(data ?? []) as ContentPage[]}
      access={session.access}
      email={session.user.email ?? ""}
      initialError={error ? "دریافت صفحات انجام نشد. دوباره تلاش کنید." : null}
    />
  );
}
