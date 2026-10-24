import Link from "next/link";
import { brand } from "@/lib/site";
import { PortalAuth } from "@/components/portal-auth";
import { createBackofficeClient } from "@/lib/backoffice-auth";
import { PortalEmail } from "@/components/portal-email";
import { CaseDocuments } from "@/components/documents/case-documents";
import { PortalSignOut } from "@/components/documents/portal-signout";
import { documentSession } from "@/lib/documents-server";
import { isInternalPhoneEmail } from "@/lib/customer-verification";

/** Only the invitation projection is read here; customers never receive internal case notes. */
export default async function PortalPage() {
  // Missing cloud bindings still render the useful login screen rather than a server exception.
  const session = await documentSession().catch(() => null);
  // Internal phone logins are not proof of an email, including after real SMS confirmation.
  if (!session) {
    const client = await createBackofficeClient().catch(() => null);
    const user = client ? (await client.auth.getUser()).data.user : null;
    if (
      user &&
      ["test_phone", "phone"].includes(user.app_metadata.identity_assurance) &&
      isInternalPhoneEmail(user.email)
    )
      return (
        <main className="docs-portal">
          <header className="docs-heading">
            <div>
              <Link href="/">{brand.name}</Link>
              <h1>پرتال مشتری</h1>
              <p>
                {user.user_metadata.first_name} {user.user_metadata.last_name}
              </p>
            </div>
            <PortalSignOut />
          </header>
          {user.app_metadata.identity_assurance === "test_phone" && (
            <p className="simulation-banner">حساب آزمایشی موبایل</p>
          )}
          <p>برای دسترسی به مدارک، ایمیل پرونده را تأیید کنید.</p>
          <PortalEmail initialEmail={user.user_metadata.claimed_email || ""} />
          <Link href="/#registration">ثبت سفارش</Link>
        </main>
      );
  }
  if (!session) return <PortalAuth />;
  const { data, error } = await session.client
    .from("crm_document_access")
    .select("*")
    .eq("customer_email", session.user.email!.toLowerCase())
    .order("case_number", { ascending: false });
  return (
    <main className="docs-portal">
      <header className="docs-heading">
        <div>
          <Link href="/">{brand.name}</Link>
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
        <p className="docs-empty">هنوز پرونده‌ای ندارید.</p>
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
