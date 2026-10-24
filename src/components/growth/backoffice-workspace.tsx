"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  type Campaign,
  type ChatMessage,
  type Conversation,
  type Order,
} from "@/lib/growth/model";
import { persianNumber, plans } from "@/lib/site";
import { type Contact } from "@/lib/registration";

type OrderRow = Order & {
  applicant: { firstName: string; lastName: string; email: string };
  provider_ref: string | null;
};
type Row = Campaign | Conversation | OrderRow;
type Stat = { id: string; used: number; reserved: number };
const modeLabels = {
  simulation: "شبیه‌ساز",
  sandbox: "درگاه آزمایشی",
  live: "واقعی",
  disabled: "خاموش",
};
const stateLabels: Record<string, string> = {
  pending: "در انتظار",
  initiating: "ارتباط با درگاه؛ نیازمند بررسی در صورت توقف",
  redirected: "منتظر تأیید درگاه",
  completed: "تکمیل‌شده",
  cancelled: "لغوشده",
  waiting: "منتظر پاسخ تیم",
  replied: "پاسخ داده شده",
  closed: "بسته",
};
const date = (value: string) =>
  new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Tehran",
  }).format(new Date(value));

/** All changes travel through the authenticated API. Polling is visible-tab-only and lists are paginated. */
export function GrowthWorkspace({
  section,
  defaultMode = "simulation",
  initialConversation = "",
}: {
  section: "campaigns" | "chat" | "orders";
  defaultMode?: string;
  initialConversation?: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stat[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(initialConversation);
  const [lead, setLead] = useState<Contact | null>(null);
  const [unreadIds, setUnreadIds] = useState<string[]>([]);
  const acknowledged = useRef(new Set<string>());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const attempt = useRef("");
  const replyAttempt = useRef("");
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      if (document.visibilityState !== "hidden") {
        try {
          const response = await fetch(
            `/api/backoffice/growth?section=${section}&page=${page}`,
            { cache: "no-store", signal: controller.signal },
          );
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          if (stopped) return;
          setRows(data.rows);
          setStats(data.stats);
          setTotal(data.total);
          setLoading(false);
        } catch (error) {
          if (!stopped) {
            setLoading(false);
            setError(
              error instanceof Error ? error.message : "دریافت انجام نشد.",
            );
          }
        }
      }
      if (!stopped && section === "chat") timer = setTimeout(load, 5000);
    }
    void load();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [section, page, revision]);
  useEffect(() => {
    if (!selected || section !== "chat") return;
    const controller = new AbortController();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      if (document.visibilityState !== "hidden") {
        try {
          const response = await fetch(
            `/api/backoffice/growth?section=chat&id=${selected}`,
            { signal: controller.signal, cache: "no-store" },
          );
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          if (stopped) return;
          setMessages(data.messages);
          setLead(data.lead);
          setUnreadIds(data.unread_ids || []);
        } catch {
          if (!stopped)
            setError("دریافت پیام‌ها قطع شده؛ دوباره بررسی می‌شود.");
        }
      }
      if (!stopped) timer = setTimeout(load, 4000);
    }
    void load();
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [selected, section, revision]);
  // Read only message IDs returned for the currently displayed conversation, independently per staff account.
  useEffect(() => {
    if (
      section !== "chat" ||
      !selected ||
      document.visibilityState === "hidden"
    )
      return;
    const ids = unreadIds.filter((id) => !acknowledged.current.has(id));
    if (!ids.length) return;
    ids.forEach((id) => acknowledged.current.add(id));
    void fetch("/api/backoffice/growth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "chat_read", ids }),
    })
      .then((response) => {
        if (!response.ok) throw new Error();
        window.dispatchEvent(new Event("support-notifications-refresh"));
        setRevision((value) => value + 1);
      })
      .catch(() => {
        ids.forEach((id) => acknowledged.current.delete(id));
        setError("وضعیت خواندن پیام‌ها ذخیره نشد؛ دوباره بررسی می‌شود.");
      });
  }, [unreadIds, selected, section]);
  async function mutate(input: Record<string, unknown>) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/backoffice/growth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRevision((value) => value + 1);
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "ذخیره انجام نشد.");
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = Object.fromEntries(new FormData(form));
    // datetime-local is interpreted in the operator's browser timezone and serialized unambiguously to UTC.
    for (const key of ["starts_at", "ends_at"]) {
      const timestamp = new Date(String(input[key]));
      if (!Number.isFinite(timestamp.getTime())) {
        setError("بازه زمانی معتبر وارد کنید.");
        return;
      }
      input[key] = timestamp.toISOString();
    }
    const id = attempt.current || crypto.randomUUID();
    attempt.current = id;
    if (await mutate({ ...input, id, action: "campaign" })) {
      form.reset();
      attempt.current = "";
    }
  }
  async function reply(close = false) {
    const id = replyAttempt.current || crypto.randomUUID();
    replyAttempt.current = id;
    if (
      await mutate({
        action: "reply",
        id,
        conversation: selected,
        body: draft,
        close,
      })
    ) {
      setDraft("");
      replyAttempt.current = "";
    }
  }
  return (
    <main className="growth-workspace">
      <header>
        <span className="eyebrow">رشد و ارتباط با مشتری</span>
        <h1>
          {section === "campaigns"
            ? "کمپین‌ها؛ با ظرفیت مشخص"
            : section === "chat"
              ? "میز گفت‌وگو"
              : "از انتخاب تا تکمیل سفارش"}
        </h1>
        <p>
          {section === "campaigns"
            ? "درصد و شرایط پس از ساخت ثابت‌اند. برای تغییر شرایط، کمپین جدید بسازید؛ کد قبلی را می‌توانید متوقف کنید."
            : section === "chat"
              ? "پیام‌های این بخش برای مشتری نمایش داده می‌شوند. یادداشت‌های داخلی در بخش پشتیبانی باقی می‌مانند."
              : "سفارش‌های آزمایشی درآمد یا پرونده واقعی ایجاد نمی‌کنند. تخفیف صددرصد، پرداخت بانکی نیست."}
        </p>
      </header>
      {error && (
        <p className="bo-error-banner" role="alert">
          {error}
        </p>
      )}
      {section === "campaigns" && (
        <details className="growth-create">
          <summary>ساخت کمپین و کد تخفیف</summary>
          <form
            onSubmit={create}
            onChange={() => {
              attempt.current = "";
            }}
          >
            <fieldset disabled={busy} className="growth-form">
              <label>
                <Label asChild>
                  <span>نام کمپین</span>
                </Label>
                <Input
                  name="name"
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="پیش‌ثبت‌نام پاییز"
                />
              </label>
              <label>
                کد تخفیف
                <Input
                  name="code"
                  dir="ltr"
                  required
                  minLength={3}
                  maxLength={32}
                  placeholder="AUTUMN100"
                />
              </label>
              <label>
                درصد تخفیف
                <Input
                  name="percent"
                  type="number"
                  min={1}
                  max={100}
                  required
                  defaultValue={100}
                />
              </label>
              <label>
                سقف تعداد استفاده
                <Input
                  name="max_uses"
                  type="number"
                  min={1}
                  max={1000000}
                  required
                  defaultValue={10}
                />
              </label>
              <label>
                شروع (زمان مرورگر)
                <Input name="starts_at" type="datetime-local" required />
              </label>
              <label>
                پایان (زمان مرورگر)
                <Input name="ends_at" type="datetime-local" required />
              </label>
              <label>
                خدمت
                <select name="plan" defaultValue="all">
                  <option value="all">هر دو خدمت</option>
                  <option value="online">آنلاین</option>
                  <option value="inperson">حضوری</option>
                </select>
              </label>
              <label>
                محیط استفاده
                <select name="mode" defaultValue={defaultMode}>
                  <option value="simulation">شبیه‌ساز داخلی</option>
                  <option value="sandbox">درگاه آزمایشی زرین‌پال</option>
                  <option value="live">واقعی</option>
                </select>
              </label>
              <label>
                کانال کمپین
                <Input
                  name="channel"
                  maxLength={100}
                  placeholder="اینستاگرام / همکاری / مشتریان قبلی"
                />
              </label>
              <label>
                توضیحات داخلی
                <Textarea name="notes" maxLength={1000} />
              </label>
              <p>
                هر کد برای هر ایمیل یک بار. ظرفیت شامل سفارش‌های تکمیل‌شده و
                رزروهای باز است؛ سفارش شبیه‌ساز پس از ۲۰ دقیقه از رزرو خارج
                می‌شود.
              </p>
              <Button type="submit" disabled={busy}>
                ثبت کمپین
              </Button>
            </fieldset>
          </form>
        </details>
      )}
      <div className={section === "chat" ? "growth-chat-grid" : ""}>
        <section className="growth-records" aria-label="فهرست رکوردها">
          {loading ? (
            <p role="status">در حال دریافت…</p>
          ) : !rows.length ? (
            <p>هنوز موردی در این بخش نیست.</p>
          ) : (
            rows.map((row) => {
              if (section === "campaigns") {
                const campaign = row as Campaign;
                const stat = stats.find((item) => item.id === row.id);
                return (
                  <article className="growth-record" key={row.id}>
                    <div>
                      <span className="growth-tag">
                        {modeLabels[campaign.mode]}
                      </span>
                      <h2>
                        {campaign.name} <bdi>{campaign.code}</bdi>
                      </h2>
                      <p>
                        {persianNumber(campaign.percent)}٪ تخفیف ·{" "}
                        {campaign.plan === "all"
                          ? "هر دو خدمت"
                          : plans[campaign.plan].name}
                      </p>
                      <p>
                        {date(campaign.starts_at)} تا {date(campaign.ends_at)}{" "}
                        (تهران)
                      </p>
                      <p>
                        مصرف‌شده: {persianNumber(stat?.used || 0)} · رزرو:{" "}
                        {persianNumber(stat?.reserved || 0)} · سقف:{" "}
                        {persianNumber(campaign.max_uses)}
                      </p>
                      <p>
                        {campaign.channel} {campaign.notes}
                      </p>
                    </div>
                    <Button
                      disabled={busy}
                      variant={campaign.active ? "outline" : "default"}
                      onClick={() =>
                        mutate({
                          action: "toggle",
                          id: row.id,
                          active: !campaign.active,
                        })
                      }
                    >
                      {campaign.active ? "توقف کمپین" : "فعال‌سازی کمپین"}
                    </Button>
                  </article>
                );
              }
              if (section === "chat") {
                const conversation = row as Conversation;
                return (
                  <button
                    className="growth-conversation"
                    key={row.id}
                    aria-pressed={selected === row.id}
                    onClick={() => {
                      if (
                        draft.trim() &&
                        !window.confirm("پاسخ ارسال‌نشده کنار گذاشته شود؟")
                      )
                        return;
                      setSelected(row.id);
                      setMessages([]);
                      setLead(null);
                      setUnreadIds([]);
                      setDraft("");
                      replyAttempt.current = "";
                    }}
                  >
                    <strong>
                      {conversation.first_name
                        ? `${conversation.first_name} ${conversation.last_name}`
                        : "گفت‌وگو"}{" "}
                      <bdi>{row.id.slice(0, 8)}</bdi>
                    </strong>
                    {conversation.phone ? (
                      <bdi>{conversation.phone}</bdi>
                    ) : null}
                    {Boolean(conversation.unread_count) ? (
                      <span className="support-unread-label">
                        {persianNumber(conversation.unread_count!)} پیام
                        خوانده‌نشده
                      </span>
                    ) : null}
                    <span>{stateLabels[conversation.status]}</span>
                    <small>{date(conversation.updated_at)}</small>
                  </button>
                );
              }
              const order = row as OrderRow;
              return (
                <article className="growth-record" key={row.id}>
                  <div>
                    <span className="growth-tag">{modeLabels[order.mode]}</span>
                    <h2>
                      {order.applicant.firstName} {order.applicant.lastName}
                    </h2>
                    <p>
                      {plans[order.plan].name} · {stateLabels[order.status]}
                    </p>
                    <p>
                      نهایی: {persianNumber(order.total_amount)} تومان · تخفیف:{" "}
                      {persianNumber(order.discount_amount)} تومان
                    </p>
                    <p>
                      {order.payment_kind === "discount"
                        ? "بدون پرداخت بانکی (تخفیف کامل)"
                        : order.provider_ref
                          ? `مرجع درگاه: ${order.provider_ref}`
                          : "بدون تأیید بانکی"}
                    </p>
                    <small>
                      <bdi>{order.id}</bdi> · {date(order.created_at)}
                    </small>
                  </div>
                  {order.case_id && (
                    <a href={`/backoffice/cases?id=${order.case_id}`}>
                      پرونده خدمات
                    </a>
                  )}
                </article>
              );
            })
          )}
        </section>
        {section === "chat" && (
          <section className="staff-chat" aria-label="پاسخ به مشتری">
            {selected ? (
              <>
                <h2>
                  پاسخ عمومی به مشتری <bdi>{selected.slice(0, 8)}</bdi>
                </h2>
                {lead ? (
                  <div className="support-lead-card">
                    <strong>
                      لید پشتیبانی: {lead.firstName} {lead.lastName}
                    </strong>
                    <a href={`tel:${lead.phone}`}>
                      <bdi>{lead.phone}</bdi>
                    </a>
                    <small>
                      شمارهٔ اعلام‌شده توسط مخاطب؛ تأیید پیامکی انجام نشده است.
                    </small>
                  </div>
                ) : (
                  <p className="chat-disclosure">
                    اطلاعات تماس این گفت‌وگوی قدیمی هنوز تکمیل نشده است.
                  </p>
                )}
                <div
                  className="staff-chat-log"
                  role="log"
                  aria-live="polite"
                  aria-label="پیام‌های مشتری"
                >
                  {messages.map((message) => (
                    <article
                      key={message.id}
                      className={`chat-bubble ${message.sender}`}
                    >
                      <small>
                        {message.sender === "staff" ? "تیم" : "مشتری"} ·{" "}
                        {date(message.created_at)}
                      </small>
                      <p>{message.body}</p>
                    </article>
                  ))}
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void reply();
                  }}
                >
                  <Label htmlFor="staff-reply">متن پاسخ به مشتری</Label>
                  <Textarea
                    id="staff-reply"
                    value={draft}
                    maxLength={2000}
                    required
                    disabled={busy}
                    rows={3}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      replyAttempt.current = "";
                    }}
                  />
                  <div className="journey-actions">
                    <Button disabled={busy || !draft.trim()} type="submit">
                      ارسال پاسخ
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => reply(true)}
                    >
                      بستن گفت‌وگو
                    </Button>
                  </div>
                </form>
                <p>
                  آخرین ۱۰۰ پیام؛ از درخواست مدارک هویتی در چت خودداری کنید.
                </p>
              </>
            ) : (
              <p>یک گفت‌وگو را انتخاب کنید.</p>
            )}
          </section>
        )}
      </div>
      <footer className="growth-pagination">
        <Button
          variant="outline"
          disabled={page === 1}
          onClick={() => setPage((value) => value - 1)}
        >
          صفحه قبل
        </Button>
        <span>
          صفحه {persianNumber(page)} · {persianNumber(total)} مورد
        </span>
        <Button
          variant="outline"
          disabled={page * 25 >= total}
          onClick={() => setPage((value) => value + 1)}
        >
          صفحه بعد
        </Button>
        <Button
          variant="ghost"
          onClick={() => setRevision((value) => value + 1)}
        >
          تازه‌سازی
        </Button>
      </footer>
    </main>
  );
}
