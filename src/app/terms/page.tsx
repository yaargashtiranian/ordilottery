import { getPageContent } from "@/lib/content-store";
import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "شرایط خدمات",
  alternates: { canonical: "/terms" },
  robots: { index: false, follow: false },
};

/** This draft avoids inventing refund, booking or photography commitments. */
export default async function TermsPage() {
  const content = await getPageContent("terms");
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
      <ul>
        <li>{content.text10}</li>
        <li>{content.text11}</li>
        <li>{content.text12}</li>
        <li>{content.text13}</li>
      </ul>
      <p> {content.text14} </p>
      <Link className="inline-link" href="/">
        {" "}
        {content.text15}{" "}
      </Link>
    </main>
  );
}
