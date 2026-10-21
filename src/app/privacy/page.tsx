import { getPageContent } from "@/lib/content-store";
import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "حریم خصوصی",
  alternates: { canonical: "/privacy" },
  robots: { index: false, follow: false },
};

/** Describe current behavior honestly; final operational terms precede collection. */
export default async function PrivacyPage() {
  const content = await getPageContent("privacy");
  return (
    <main className="legal-page">
      <Link href="/" aria-label="بازگشت به صفحه اصلی">
        <Brand />
      </Link>
      <h1>{content.text1}</h1>
      <p> {content.text2} </p>
      <h2>{content.text3}</h2>
      <p> {content.text4} </p>
      <h2>{content.text5}</h2>
      <p> {content.text6} </p>
      <h2>{content.text7}</h2>
      <p> {content.text8} </p>
      <h2>{content.text9}</h2>
      <p> {content.text10} </p>
      <h2>{content.text11}</h2>
      <p> {content.text12} </p>
      <Link className="inline-link" href="/">
        {" "}
        {content.text13}{" "}
      </Link>
    </main>
  );
}
