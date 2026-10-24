import Link from "next/link";
import { redirect } from "next/navigation";
import { getBackofficeSession } from "@/lib/backoffice-auth";
import { BackofficeShell } from "@/components/backoffice/shell";
import { GrowthWorkspace } from "./backoffice-workspace";
import { commerceMode } from "@/lib/growth/server";
const titles = {
  campaigns: "کمپین و کد تخفیف",
  chat: "گفت‌وگوی مشتریان",
  orders: "سفارش‌های وب",
};
/** Keep authorization in the server page as well as every API; an unavailable binding never leaks data. */
export async function GrowthPage({
  section,
  initialConversation = "",
}: {
  section: keyof typeof titles;
  initialConversation?: string;
}) {
  let session;
  try {
    session = await getBackofficeSession();
  } catch {
    return (
      <main className="bo-login">
        <section className="bo-login-panel">
          <h1>{titles[section]}</h1>
          <p>
            ارتباط با فضای مدیریت برقرار نشد. تنظیمات Supabase را بررسی کنید.
          </p>
          <Link href="/backoffice/login">صفحه ورود</Link>
        </section>
      </main>
    );
  }
  if (!session) redirect("/backoffice/login");
  return (
    <BackofficeShell
      email={session.user.email!}
      title={titles[section]}
      active={section}
    >
      <GrowthWorkspace
        section={section}
        initialConversation={initialConversation}
        defaultMode={
          commerceMode() === "disabled" ? "simulation" : commerceMode()
        }
      />
    </BackofficeShell>
  );
}
