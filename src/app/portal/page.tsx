import Link from "next/link";
import { LoginForm } from "@/components/backoffice/login-form";
import { CaseDocuments } from "@/components/documents/case-documents";
import { PortalSignOut } from "@/components/documents/portal-signout";
import { documentSession } from "@/lib/documents-server";

/** Only the invitation projection is read here; customers never receive internal case notes. */
export default async function PortalPage() {
  const session = await documentSession();
  if (!session)
    return (
      <main className="bo-login">
        <section className="bo-login-panel">
          <Link className="bo-wordmark" href="/">
            یارگشت
          </Link>
          <div className="bo-login-heading">
            <h1>مدارک پروندهٔ شما</h1>
            <p>ورود امن برای ارسال مدارک و دیدن نتیجهٔ بررسی کارشناس.</p>
          </div>
          <LoginForm portal />
        </section>
      </main>
    );
  const { data, error } = await session.client
    .from("crm_document_access")
    .select("*")
    .eq("customer_email", session.user.email!.toLowerCase())
    .order("case_number", { ascending: false });
  return (
    <main className="docs-portal">
      <header className="docs-heading">
        <div>
          <Link href="/">یارگشت</Link>
          <h1>مدارک پرونده‌های من</h1>
          <p>
            با ایمیل <bdi>{session.user.email}</bdi> وارد شده‌اید.
          </p>
        </div>
        <PortalSignOut />
      </header>
      {error ? (
        <p role="alert">
          دریافت پرونده‌ها انجام نشد؛ صفحه را دوباره بارگذاری کنید.
        </p>
      ) : !data.length ? (
        <p className="docs-empty">
          پرونده‌ای برای این ایمیل وجود ندارد. برای تطبیق ایمیل پرونده با
          پشتیبانی تماس بگیرید.
        </p>
      ) : (
        data.map((item) => (
          <section key={item.case_id}>
            <h2>
              پرونده <bdi>YG-{item.case_number}</bdi>
            </h2>
            <CaseDocuments caseId={item.case_id} staff={false} />
          </section>
        ))
      )}
    </main>
  );
}
