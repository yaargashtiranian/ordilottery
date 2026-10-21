import type { Metadata } from "next";
import "./backoffice.css";
import "./operations.css";
import "@/components/documents/documents.css";

export const metadata: Metadata = {
  title: "بک‌آفیس",
  robots: { index: false, follow: false },
};

/** Keep administration styling and indexing rules scoped to this route tree. */
export default function BackofficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="backoffice">{children}</div>;
}
