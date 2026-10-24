"use client";
import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { persianNumber } from "@/lib/site";

type Notice = {
  id: string;
  conversation_id: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
};
/** Every staff account has independent durable receipts; closing a toast never acknowledges a message. */
export function SupportNotifications() {
  const [items, setItems] = useState<Notice[]>([]),
    [total, setTotal] = useState(0),
    [error, setError] = useState("");
  const [toast, setToast] = useState<Notice | null>(null),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const details = useRef<HTMLDetailsElement>(null),
    seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    let delay = 8000;
    async function poll() {
      if (document.visibilityState !== "hidden")
        try {
          const response = await fetch(
            "/api/backoffice/growth?section=notifications",
            { cache: "no-store", signal: controller.signal },
          );
          if (response.status === 401) return;
          const data = await response.json();
          if (!response.ok) throw new Error();
          if (stopped) return;
          const next = data.items as Notice[];
          if (seen.current) {
            const incoming = next.find((item) => !seen.current!.has(item.id));
            if (incoming) setToast(incoming);
          } else seen.current = new Set();
          next.forEach((item) => seen.current!.add(item.id));
          setItems(next);
          setTotal(Number(data.total) || 0);
          setError("");
          delay = 8000;
        } catch {
          if (!stopped) {
            setError("دریافت اعلان‌ها قطع شده؛ دوباره بررسی می‌شود.");
            delay = Math.min(delay * 2, 30000);
          }
        }
      if (!stopped) timer = setTimeout(poll, delay);
    }
    const refresh = () => setRevision((value) => value + 1);
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    void poll();
    window.addEventListener("support-notifications-refresh", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
      window.removeEventListener("support-notifications-refresh", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [revision]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function readAll() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/backoffice/growth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "notifications_read_all" }),
      });
      if (!response.ok) throw new Error();
      setToast(null);
      setRevision((value) => value + 1);
    } catch {
      setError("علامت‌گذاری ذخیره نشد؛ دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="support-notifications">
      <details
        ref={details}
        onKeyDown={(event) => {
          if (event.key === "Escape" && details.current) {
            details.current.open = false;
            details.current.querySelector("summary")?.focus();
          }
        }}
      >
        <summary aria-label={`اعلان‌های پشتیبانی، ${total} خوانده‌نشده`}>
          <Bell size={19} />
          {total ? <b>{persianNumber(total)}</b> : null}
        </summary>
        <section
          className="support-notification-panel"
          aria-label="مرکز اعلان‌های پشتیبانی"
        >
          <header>
            <strong>اعلان‌های پشتیبانی</strong>
            <span>{persianNumber(total)} خوانده‌نشده</span>
          </header>
          {error ? <p role="alert">{error}</p> : null}
          {items.length ? (
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <a
                    href={`/backoffice/chat?conversation=${item.conversation_id}`}
                  >
                    <Bell size={15} />
                    <span>
                      پیام از{" "}
                      {item.first_name
                        ? `${item.first_name} ${item.last_name}`
                        : "مخاطب گفت‌وگو"}
                      <small>مشاهدهٔ گفت‌وگو</small>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p>پیام خوانده‌نشده‌ای ندارید.</p>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || !total}
            onClick={() => void readAll()}
          >
            <CheckCheck size={15} />
            علامت‌گذاری همه به‌عنوان خوانده‌شده
          </Button>
          {total > 20 ? <small>۲۰ اعلان آخر نمایش داده می‌شود.</small> : null}
        </section>
      </details>
      {toast ? (
        <div className="support-message-toast" role="status">
          <Bell size={17} />
          <a href={`/backoffice/chat?conversation=${toast.conversation_id}`}>
            پیام پشتیبانی خوانده‌نشده دارید
          </a>
          <button
            aria-label="بستن اعلان پشتیبانی"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
