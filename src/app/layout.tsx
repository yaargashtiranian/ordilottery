import type { Metadata, Viewport } from "next";
import "@fontsource/vazirmatn/400.css";
import "@fontsource/vazirmatn/500.css";
import "@fontsource/vazirmatn/600.css";
import "@fontsource/vazirmatn/700.css";
import "./globals.css";
import { DirectionProvider } from "@/components/direction-provider";
import { brand } from "@/lib/site";

/** A canonical origin is emitted only after the real deployment domain is set. */
const siteUrl = process.env.SITE_URL;
export const metadata: Metadata = {
  ...(siteUrl
    ? { metadataBase: new URL(siteUrl), alternates: { canonical: "/" } }
    : {}),
  title: {
    default: `${brand.name} | یک شروع تازه، با همراهی مطمئن`,
    template: `%s | ${brand.name}`,
  },
  description: `مسیر خدمات ثبت‌نام لاتاری را بشناسید؛ راهنمای مدارک، همراهی متخصص و خدمات آنلاین و حضوری ${brand.name}. ثبت درخواست خدمات از ثبت‌نام رسمی DV جداست.`,
  openGraph: {
    title: `${brand.name}؛ همراه یک شروع تازه`,
    description: brand.description,
    locale: "fa_IR",
    type: "website",
    siteName: brand.legalName,
  },
  twitter: { card: "summary_large_image" },
  // Prevent indexing a staging build; production requires an explicit switch.
  robots:
    process.env.ALLOW_INDEXING === "true"
      ? { index: true, follow: true }
      : { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f7f8f2",
  width: "device-width",
  initialScale: 1,
};

/** The local font avoids external runtime requests and keeps Persian layout stable. */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <DirectionProvider>{children}</DirectionProvider>
      </body>
    </html>
  );
}
