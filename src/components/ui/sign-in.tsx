import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpLeft,
  Compass,
  Files,
  Headphones,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { brand } from "@/lib/site";

/** Presentation adapted from the supplied template; the caller owns the real authentication form. */
export function SignInPage({
  title,
  description,
  children,
  heroImageSrc = "/portal/auth-hero.jpg",
}: {
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
  heroImageSrc?: string;
}) {
  return (
    <main className="portal-auth" aria-labelledby="portal-auth-title">
      <section className="portal-auth-content">
        <header className="portal-auth-brand">
          <Link href="/" className="portal-auth-wordmark">
            <span>
              <Compass aria-hidden="true" size={24} />
            </span>
            <strong>
              {brand.name}
              <small dir="ltr">{brand.latinName}</small>
            </strong>
          </Link>
          <Link href="/" className="portal-auth-return">
            بازگشت به سایت <ArrowUpLeft aria-hidden="true" size={16} />
          </Link>
        </header>
        <div className="portal-auth-panel">
          <div className="portal-auth-intro">
            <span className="portal-auth-eyebrow">حساب کاربری شما</span>
            <h1 id="portal-auth-title">{title}</h1>
            <p>{description}</p>
          </div>
          {children}
        </div>
        <footer className="portal-auth-footer">
          <ShieldCheck size={15} aria-hidden="true" />
          <span>پرتال مشتریان {brand.legalName}</span>
        </footer>
      </section>
      <aside className="portal-auth-visual" aria-label="همراهی یارگشت">
        <div className="portal-auth-art">
          <Image
            src={heroImageSrc}
            alt=""
            fill
            sizes="(max-width: 900px) 1px, 50vw"
            className="portal-auth-image"
          />
          <div className="portal-auth-art-shade" />
          <span className="portal-auth-art-tag">
            <Compass size={18} aria-hidden="true" />
            {brand.legalName}
          </span>
          <div className="portal-auth-glass">
            <span>یک شروع تازه</span>
            <h2>
              مسیر شما،
              <br />
              با همراهی یارگشت.
            </h2>
            <div className="portal-auth-features">
              <span>
                <Files size={17} aria-hidden="true" />
                پرونده و مدارک
              </span>
              <span>
                <Headphones size={17} aria-hidden="true" />
                ارتباط با کارشناس
              </span>
            </div>
          </div>
        </div>
      </aside>
    </main>
  );
}
