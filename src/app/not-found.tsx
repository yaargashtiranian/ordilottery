import Link from "next/link";
import { Brand } from "@/components/brand";

/** Keep unknown paths recoverable without exposing application internals. */
export default function NotFound() {
  return (
    <main className="legal-page">
      <Brand />
      <h1>این مسیر پیدا نشد.</h1>
      <p>از صفحه اصلی، مسیر تازه‌ای را شروع کنید.</p>
      <Link href="/" className="inline-link">
        بازگشت به صفحه اصلی ←
      </Link>
    </main>
  );
}
