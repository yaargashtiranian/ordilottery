import type { Metadata } from "next";
import "../backoffice/backoffice.css";
import "../backoffice/operations.css";
import "@/components/documents/documents.css";
import "./auth.css";
export const metadata: Metadata = {
  title: "پرتال مشتری",
  robots: { index: false, follow: false },
};
/** Private customer routes reuse the RTL application controls and prevent indexing. */
export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="backoffice">{children}</div>;
}
