"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CreditCard, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Guide } from "./guide";
import { type Order } from "@/lib/growth/model";
import { experience, followCheckout } from "@/lib/growth/client";
import { plans, persianNumber } from "@/lib/site";

/** Always reload authoritative state; URL query strings never determine whether a payment succeeded. */
export function CheckoutResult({
  id,
  paymentsEnabled = false,
}: {
  id: string;
  paymentsEnabled?: boolean;
}) {
  const [order, setOrder] = useState<Order | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/experience?order=${encodeURIComponent(id)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error ||
              "این سفارش فقط در مرورگری که با آن شروع کرده‌اید قابل مشاهده است.",
          );
        setOrder(data.order);
        setMessage("");
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setMessage(error.message || "ارتباط برقرار نشد.");
      });
    return () => controller.abort();
  }, [id, revision]);
  async function pay(outcome?: "success" | "cancel") {
    setBusy(true);
    setMessage("");
    try {
      const data = await experience({
        action: outcome ? "simulate" : "pay",
        id,
        outcome,
      });
      if (outcome) setRevision((value) => value + 1);
      else followCheckout(data.next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ارتباط برقرار نشد.");
    } finally {
      setBusy(false);
    }
  }
  const done = order?.status === "completed";
  const cancelled = order?.status === "cancelled";
  return (
    <main className="checkout-page shell">
      <Link href="/">بازگشت به سایت ←</Link>
      <section className="checkout-card">
        <Guide />
        <span className="eyebrow">
          {order?.mode === "live" ? "درخواست خدمات شما" : "مسیر آزمایشی خرید"}
        </span>
        <h1>
          {done
            ? "این قدم کامل شد!"
            : cancelled
              ? "پرداخت آزمایشی لغو شد"
              : order?.mode === "live" && !paymentsEnabled
                ? "سفارش شما ثبت شد"
                : "یک مرور کوتاه، بعد ادامه"}
        </h1>
        {!order && !message && <p role="status">در حال دریافت سفارش…</p>}
        {order && (
          <>
            <p>{plans[order.plan].name}</p>
            {order.mode !== "live" && (
              <p className="simulation-banner">
                این سفارش آزمایشی است؛ هیچ وجه، پرونده خدماتی یا ثبت رسمی ایجاد
                نمی‌شود.
              </p>
            )}
            <dl className="journey-totals">
              <div>
                <dt>هزینه خدمت</dt>
                <dd>{persianNumber(order.base_amount)} تومان</dd>
              </div>
              <div>
                <dt>تخفیف</dt>
                <dd>{persianNumber(order.discount_amount)} تومان</dd>
              </div>
              <div className="total">
                <dt>{done ? "مبلغ سفارش" : "مبلغ قابل پرداخت"}</dt>
                <dd>{persianNumber(order.total_amount)} تومان</dd>
              </div>
            </dl>
            {done ? (
              <div className="checkout-success">
                <CheckCircle2 />
                <p>
                  {order.payment_kind === "discount"
                    ? "تخفیف صددرصد اعمال شد؛ پرداخت بانکی لازم نبود."
                    : order.mode !== "live"
                      ? "نتیجه موفق آزمایشی ثبت شد."
                      : "پرداخت از طریق درگاه تأیید شد."}
                </p>
                <p>
                  {order.mode === "live"
                    ? "در انتظار بررسی کارشناس."
                    : "نتیجهٔ آزمایشی؛ پرونده‌ای ایجاد نشده است."}
                </p>
                <Button asChild>
                  <Link href="/portal">ورود یا ساخت حساب مشتری</Link>
                </Button>
              </div>
            ) : !cancelled ? (
              <div className="checkout-buttons">
                {order.mode === "simulation" ? (
                  <>
                    <p>
                      درگاه شبیه‌سازی‌شده: نتیجه دلخواه را برای بررسی مسیر
                      انتخاب کنید.
                    </p>
                    <Button disabled={busy} onClick={() => pay("success")}>
                      شبیه‌سازی پرداخت موفق
                    </Button>
                    <Button
                      disabled={busy}
                      variant="outline"
                      onClick={() => pay("cancel")}
                    >
                      شبیه‌سازی انصراف
                    </Button>
                  </>
                ) : paymentsEnabled ? (
                  <>
                    <p>
                      انتقال به{" "}
                      {order.mode === "sandbox"
                        ? "محیط آزمایشی زرین‌پال"
                        : "زرین‌پال"}
                      ؛ اطلاعات کارت فقط در درگاه وارد می‌شود.
                    </p>
                    <Button disabled={busy} onClick={() => pay()}>
                      <CreditCard />
                      {busy ? "در حال ارتباط…" : "ادامه به زرین‌پال"}
                    </Button>
                  </>
                ) : (
                  <>
                    <p>در انتظار بررسی کارشناس. پرداخت بانکی غیرفعال است.</p>
                    <p>وضعیت مالی: پرداخت‌نشده.</p>
                    <Button asChild variant="outline">
                      <Link href="/portal">ورود به پرتال مشتری</Link>
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <Button asChild>
                <Link href="/#registration">شروع یک سفارش تازه</Link>
              </Button>
            )}
            <p className="journey-footnote">
              <ShieldCheck size={15} />
              نتیجه این مرحله، تأیید ثبت رسمی لاتاری نیست.
            </p>
            <details>
              <summary>شناسه پیگیری سفارش</summary>
              <bdi className="order-reference">{id}</bdi>
            </details>
          </>
        )}
        {message && (
          <p role="alert" className="journey-message">
            {message}
          </p>
        )}
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => setRevision((value) => value + 1)}
        >
          بررسی دوباره وضعیت
        </Button>
      </section>
    </main>
  );
}
