import { redirect } from "next/navigation";
import { getBackofficeSession } from "@/lib/backoffice-auth";
import { firstStaffPath, hasStaffAccess } from "@/lib/backoffice-permissions";
import { StaffWorkspace } from "@/components/backoffice/staff-workspace";

/** Authorization precedes rendering; membership data is fetched through the same authenticated API. */
export default async function UsersPage() {
  const session = await getBackofficeSession();
  if (!session) redirect("/backoffice/login");
  if (!hasStaffAccess(session.access, "users"))
    redirect(firstStaffPath(session.access));
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
  return (
    <StaffWorkspace
      email={session.user.email!}
      access={session.access}
      initialMembers={members.data ?? []}
      initialLog={log.data ?? []}
      initialError={
        members.error || log.error ? "دریافت کاربران انجام نشد." : ""
      }
    />
  );
}
