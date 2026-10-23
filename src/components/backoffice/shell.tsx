"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Compass,
  LayoutDashboard,
  Files,
  UsersRound,
  WalletCards,
  MessagesSquare,
  FileText,
  ArrowUpLeft,
  ShieldCheck,
  ChevronLeft,
  Menu,
  X,
  LogOut,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const navigation = [
  {
    key: "campaigns",
    href: "/backoffice/campaigns",
    label: "کمپین و تخفیف",
    icon: WalletCards,
  },
  {
    key: "orders",
    href: "/backoffice/orders",
    label: "سفارش‌های وب",
    icon: Files,
  },
  {
    key: "chat",
    href: "/backoffice/chat",
    label: "گفت‌وگوی مشتریان",
    icon: MessagesSquare,
  },
  {
    key: "overview",
    href: "/backoffice",
    label: "نمای عملیاتی",
    icon: LayoutDashboard,
  },
  { key: "cases", href: "/backoffice/cases", label: "پرونده‌ها", icon: Files },
  {
    key: "customers",
    href: "/backoffice/customers",
    label: "مشتریان",
    icon: UsersRound,
  },
  {
    key: "payments",
    href: "/backoffice/payments",
    label: "سوابق پرداخت",
    icon: WalletCards,
  },
  {
    key: "support",
    href: "/backoffice/support",
    label: "پشتیبانی",
    icon: MessagesSquare,
  },
  {
    key: "content",
    href: "/backoffice/content",
    label: "محتوای صفحات",
    icon: FileText,
  },
];

/** All workspaces share navigation and private-session controls; records stay behind server authorization. */
export function BackofficeShell({
  email,
  title,
  active,
  children,
  beforeNavigate,
}: {
  email: string;
  title: string;
  active: string;
  children: ReactNode;
  beforeNavigate?: () => boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    document.querySelector<HTMLButtonElement>(".bo-nav-close")?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("keydown", close);
      document.querySelector<HTMLButtonElement>(".bo-menu")?.focus();
    };
  }, [open]);
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/backoffice/session", {
        method: "DELETE",
      });
      if (!response.ok) throw new Error();
      router.push("/backoffice/login");
      router.refresh();
    } catch {
      setError("خروج انجام نشد؛ دوباره تلاش کنید.");
      setBusy(false);
    }
  }
  return (
    <div className="bo-shell">
      <aside className={`bo-sidebar ${open ? "is-open" : ""}`}>
        <Link
          className="bo-wordmark"
          href="/backoffice"
          onNavigate={(event) => {
            if (beforeNavigate && !beforeNavigate()) event.preventDefault();
          }}
        >
          <span>
            <Compass size={25} />
          </span>
          <strong>
            یارگشت<small>فضای مدیریت</small>
          </strong>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="bo-nav-close"
          aria-label="بستن منو"
          onClick={() => setOpen(false)}
        >
          <X />
        </Button>
        <div className="bo-workspace-tag">
          <span className="bo-workspace-icon">ی</span>
          <div>
            <strong>میز کار یارگشت</strong>
            <small>مشتری، پرونده و محتوا</small>
          </div>
          <ShieldCheck size={16} />
        </div>
        <span className="bo-nav-caption">فضای کاری تیم</span>
        <nav aria-label="منوی بک‌آفیس">
          {navigation.map(({ key, href, label, icon: Icon }) => (
            <a
              key={key}
              href={href}
              className={active === key ? "active" : ""}
              aria-current={active === key ? "page" : undefined}
            >
              <Icon size={18} />
              {label}
            </a>
          ))}
          <a href="/" target="_blank" rel="noreferrer">
            <ArrowUpLeft size={18} />
            مشاهده وب‌سایت
          </a>
        </nav>
        <div className="bo-sidebar-note">
          <ShieldCheck size={20} />
          <strong>اطلاعات مشتریان خصوصی است.</strong>
          <p>این فضای کاری تنها برای حساب‌های مجاز مدیریت در دسترس است.</p>
        </div>
        <div className="bo-profile">
          <span className="bo-avatar">م</span>
          <div>
            <strong>مدیر وب‌سایت</strong>
            <small dir="ltr">{email}</small>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="خروج از حساب"
            disabled={busy}
            onClick={logout}
          >
            {busy ? <Loader2 className="animate-spin" /> : <LogOut size={17} />}
          </Button>
        </div>
      </aside>
      {open ? (
        <button
          className="bo-scrim"
          aria-label="بستن منو"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <div className="bo-main" inert={open}>
        <header className="bo-topbar">
          <div>
            <Button
              className="bo-menu"
              variant="ghost"
              size="icon"
              aria-label="باز کردن منو"
              onClick={() => setOpen(true)}
            >
              <Menu />
            </Button>
            <span>فضای کاری</span>
            <ChevronLeft size={14} />
            <strong>{title}</strong>
          </div>
          <span className="ops-private">
            <ShieldCheck size={14} />
            دسترسی مدیریت
          </span>
        </header>
        {error ? (
          <div className="bo-error-banner" role="alert">
            {error}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
