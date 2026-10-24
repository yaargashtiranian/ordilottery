import { hasStaffAccess, firstStaffPath } from "@/lib/backoffice-permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getBackofficeSession } from "@/lib/backoffice-auth";
import { loadOperations } from "@/lib/operations-data";
import { OperationsWorkspace } from "@/components/backoffice/operations-workspace";
import type { OperationsSection } from "@/lib/operations-model";

/** Server identity checks precede every operational page and private query. */
export async function OperationsPage({
  section,
  initialId,
}: {
  section: OperationsSection;
  initialId?: string;
}) {
  let session;
  try {
    session = await getBackofficeSession();
  } catch {
    return (
      <main className="bo-service-error">
        <h1>ارتباط با فضای مدیریت برقرار نشد.</h1>
        <Link href="/backoffice">تلاش دوباره</Link>
      </main>
    );
  }
  if (!session) redirect("/backoffice/login");
  if (!hasStaffAccess(session.access, section))
    redirect(firstStaffPath(session.access));
  let initialData = null;
  let initialError = "";
  try {
    initialData = await loadOperations(session.client, section);
  } catch {
    initialError = "دریافت اطلاعات انجام نشد؛ دوباره تلاش کنید.";
  }
  return (
    <OperationsWorkspace
      key={`${section}-${initialId ?? "list"}`}
      access={session.access}
      email={session.user.email ?? ""}
      section={section}
      initialData={initialData}
      initialError={initialError}
      initialId={initialId}
    />
  );
}
