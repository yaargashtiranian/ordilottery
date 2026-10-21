import Link from "next/link";
import { Compass, ShieldCheck, ArrowUpLeft, Layers3 } from "lucide-react";
import { LoginForm } from "@/components/backoffice/login-form";

/** Public sign-in screen contains no content drafts or account membership details. */
export default function BackofficeLogin() {
  return (
    <main className="bo-login">
      <section className="bo-login-panel">
        <Link href="/" className="bo-wordmark">
          <span>
            <Compass size={24} />
          </span>
          <strong>
            یارگشت<small>فضای مدیریت محتوا</small>
          </strong>
        </Link>
        <div className="bo-login-heading">
          <span className="bo-overline">خوش آمدید</span>
          <h1>
            یک جای آرام،
            <br />
            برای مدیریت جزئیات.
          </h1>
          <p>با حساب مدیر وارد شوید و محتوای سایت را به‌روز نگه دارید.</p>
        </div>
        <LoginForm />
        <Link href="/" className="bo-return">
          بازگشت به سایت <ArrowUpLeft size={15} />
        </Link>
      </section>
      <aside className="bo-login-art" aria-label="مدیریت محتوای یارگشت">
        <span className="bo-art-label" dir="ltr">
          YAARGASHT / WORKSPACE
        </span>
        <div className="bo-art-orbit">
          <div className="bo-art-core">
            <Layers3 size={60} strokeWidth={1} />
          </div>
          <span className="bo-orbit-dot" />
        </div>
        <div className="bo-art-copy">
          <span>پشت هر تجربه خوب</span>
          <h2>
            جزئیاتی هست
            <br />
            که درست مدیریت شده‌اند.
          </h2>
          <p>
            محتوا را بنویسید، با خیال راحت مرور کنید
            <br />و وقتی آماده بود، منتشر کنید.
          </p>
        </div>
        <span className="bo-art-footer">
          <ShieldCheck size={17} /> دسترسی اختصاصی تیم مدیریت
        </span>
      </aside>
    </main>
  );
}
