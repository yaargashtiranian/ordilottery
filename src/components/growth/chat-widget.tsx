"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  MessageCircle,
  Send,
  X,
  ArrowRight,
  Headphones,
  Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Guide } from "./guide";
import { assistantTopics, type ChatMessage } from "@/lib/growth/model";
import {
  validateContact,
  type Contact,
  type FieldErrors,
} from "@/lib/registration";
import { persianNumber } from "@/lib/site";
import { experience } from "@/lib/growth/client";

/** Contact/messages/read receipts persist on the server; drafts remain only in page memory. */
export function ChatWidget() {
  const [open, setOpen] = useState(false),
    [human, setHuman] = useState(false),
    [answer, setAnswer] = useState("");
  const [lead, setLead] = useState<Contact | null>(null),
    [contact, setContact] = useState<Contact>({
      firstName: "",
      lastName: "",
      phone: "",
    });
  const [fields, setFields] = useState<FieldErrors>({}),
    [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const [revision, setRevision] = useState(0),
    [readRevision, setReadRevision] = useState(0),
    [unread, setUnread] = useState(0),
    [notice, setNotice] = useState(false);
  const attempt = useRef(""),
    trigger = useRef<HTMLButtonElement>(null),
    close = useRef<HTMLButtonElement>(null),
    log = useRef<HTMLDivElement>(null);
  const pinned = useRef(true),
    wasOpen = useRef(false),
    lastUnread = useRef<number | null>(null),
    acknowledging = useRef(new Set<string>());
  useEffect(() => {
    if (open) close.current?.focus();
    else if (wasOpen.current) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open]);
  useEffect(() => {
    if (pinned.current && log.current)
      log.current.scrollTop = log.current.scrollHeight;
  }, [messages]);

  // Closed widgets poll only metadata/counts; no polling is performed in hidden browser tabs.
  useEffect(() => {
    let stopped = false,
      inFlight = false;
    let timer: ReturnType<typeof setTimeout>;
    let delay = 4000;
    const controller = new AbortController(),
      full = open && human;
    async function poll() {
      if (stopped || inFlight) return;
      inFlight = true;
      try {
        if (document.visibilityState !== "hidden") {
          const response = await fetch(
            full ? "/api/experience" : "/api/experience?notifications=1",
            { cache: "no-store", signal: controller.signal },
          );
          if (response.status === 401) {
            if (!stopped) {
              setLead(null);
              setUnread(0);
              setStatus("برای شروع گفت‌وگو اطلاعات تماس را وارد کنید.");
            }
          } else {
            const data = await response.json();
            if (!response.ok) throw new Error();
            if (stopped) return;
            const count = Number(data.unread_count) || 0;
            if (
              lastUnread.current !== null &&
              count > lastUnread.current &&
              !full
            )
              setNotice(true);
            lastUnread.current = count;
            setUnread(count);
            setLead(data.conversation?.lead || null);
            if (full) setMessages(data.messages || []);
            setStatus(
              data.conversation?.status === "closed"
                ? "گفت‌وگو بسته شده؛ با پیام جدید دوباره باز می‌شود."
                : data.conversation?.status === "replied"
                  ? "کارشناس پاسخ داده است."
                  : data.conversation
                    ? "پیام‌ها در همین مرورگر نمایش داده می‌شوند."
                    : "برای شروع گفت‌وگو اطلاعات تماس را وارد کنید.",
            );
          }
          delay = full ? 4000 : 10000;
        }
      } catch {
        if (!stopped) {
          setStatus("ارتباط موقتاً قطع شده؛ دوباره بررسی می‌کنیم.");
          delay = Math.min(delay * 2, 30000);
        }
      } finally {
        inFlight = false;
        if (!stopped) timer = setTimeout(poll, delay);
      }
    }
    const visible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void poll();
      }
    };
    void poll();
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
      document.removeEventListener("visibilitychange", visible);
    };
  }, [open, human, revision]);

  // Acknowledge only rendered messages; a later unseen reply cannot be marked read by this request.
  useEffect(() => {
    if (
      !open ||
      !human ||
      !lead ||
      !pinned.current ||
      document.visibilityState === "hidden"
    )
      return;
    const ids = messages
      .filter(
        (message) =>
          message.sender === "staff" &&
          !message.visitor_read_at &&
          !acknowledging.current.has(message.id),
      )
      .map((message) => message.id);
    if (!ids.length) return;
    ids.forEach((id) => acknowledging.current.add(id));
    void experience({ action: "chat_read", ids })
      .then((data) => {
        setUnread(Number(data.unread_count) || 0);
        lastUnread.current = Number(data.unread_count) || 0;
        setNotice(false);
        setMessages((current) =>
          current.map((message) =>
            ids.includes(message.id)
              ? { ...message, visitor_read_at: "acknowledged" }
              : message,
          ),
        );
      })
      .catch(() => {
        setStatus("ثبت وضعیت خواندن انجام نشد؛ دوباره بررسی می‌شود.");
      })
      .finally(() => {
        ids.forEach((id) => acknowledging.current.delete(id));
      });
  }, [messages, open, human, lead, readRevision]);

  async function start(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const result = validateContact(contact);
    setFields(result.fields);
    if (!result.valid) {
      document
        .getElementById(`chat-lead-${Object.keys(result.fields)[0]}`)
        ?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await experience({
        action: "chat_lead",
        lead: result.data,
        consent: true,
      });
      setLead(data.lead);
      setRevision((value) => value + 1);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "اطلاعات تماس ذخیره نشد.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy || !draft.trim() || !lead) return;
    setBusy(true);
    setError("");
    const id = attempt.current || crypto.randomUUID();
    attempt.current = id;
    try {
      await experience({ action: "message", id, body: draft.trim() });
      setDraft("");
      attempt.current = "";
      pinned.current = true;
      setRevision((value) => value + 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : "پیام ارسال نشد.");
    } finally {
      setBusy(false);
    }
  }
  // Explicit action also clears older replies outside the latest-100-message window.
  async function readAll() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await experience({ action: "chat_read_all", ids: [] });
      setUnread(Number(data.unread_count) || 0);
      lastUnread.current = Number(data.unread_count) || 0;
      setNotice(false);
      setRevision((value) => value + 1);
    } catch {
      setError("ثبت وضعیت خواندن انجام نشد؛ دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="chat-widget">
      {notice && !open ? (
        <div className="chat-reply-notice" role="status">
          <Bell size={17} />
          <button
            onClick={() => {
              setOpen(true);
              setHuman(true);
              setNotice(false);
            }}
          >
            پاسخ خوانده‌نشدهٔ کارشناس را ببینید
          </button>
          <button aria-label="بستن اعلان پاسخ" onClick={() => setNotice(false)}>
            <X size={15} />
          </button>
        </div>
      ) : null}
      {!open ? (
        <button
          ref={trigger}
          className="chat-trigger"
          onClick={() => {
            setOpen(true);
            if (unread) setHuman(true);
          }}
          aria-haspopup="dialog"
          aria-label={
            unread ? `گفت‌وگو، ${unread} پاسخ خوانده‌نشده` : "سؤالی داری؟"
          }
        >
          <MessageCircle size={22} />
          <span>سؤالی داری؟</span>
          {unread ? (
            <b className="chat-unread-badge">{persianNumber(unread)}</b>
          ) : null}
        </button>
      ) : null}
      {open ? (
        <section
          className="chat-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="chat-title"
        >
          <header className="chat-heading">
            <Guide small />
            <div>
              <h2 id="chat-title">
                {human ? "گفت‌وگو با کارشناس" : "راهنمای شروع"}
              </h2>
              <small>
                {human
                  ? "پاسخ تیم در همین پنجره"
                  : "پاسخ‌گوی خودکار سؤالات رایج"}
              </small>
            </div>
            <Button
              ref={close}
              size="icon"
              variant="ghost"
              onClick={() => setOpen(false)}
              aria-label="بستن گفت‌وگو"
            >
              <X size={18} />
            </Button>
          </header>
          {!human ? (
            <div className="chat-assistant">
              <p>سلام! کجای مسیر کمکت کنم؟</p>
              <div className="chat-topics">
                {assistantTopics.map((topic) => (
                  <button
                    key={topic.question}
                    onClick={() => setAnswer(topic.answer)}
                  >
                    {topic.question}
                  </button>
                ))}
              </div>
              {answer ? (
                <p className="chat-answer" role="status">
                  {answer}
                </p>
              ) : null}
              <Button className="w-full" onClick={() => setHuman(true)}>
                <Headphones size={18} />
                می‌خواهم با کارشناس صحبت کنم
                {unread ? ` (${persianNumber(unread)})` : null}
              </Button>
              <p className="chat-disclosure">
                پاسخ‌های بالا خودکارند؛ برای سؤال شخصی، تیم پاسخ می‌دهد.
              </p>
            </div>
          ) : (
            <>
              <button className="chat-back" onClick={() => setHuman(false)}>
                <ArrowRight size={14} />
                سؤالات رایج
              </button>
              {!lead ? (
                <form className="chat-lead-form" onSubmit={start}>
                  <h3>قبل از شروع، با هم آشنا شویم</h3>
                  <p>برای پیگیری درخواست پشتیبانی، این سه مورد را وارد کنید.</p>
                  {(
                    [
                      ["firstName", "نام", "given-name"],
                      ["lastName", "نام خانوادگی", "family-name"],
                      ["phone", "شماره موبایل", "tel"],
                    ] as const
                  ).map(([key, label, autoComplete]) => (
                    <div key={key}>
                      <Label htmlFor={`chat-lead-${key}`}>{label}</Label>
                      <Input
                        id={`chat-lead-${key}`}
                        value={contact[key]}
                        type={key === "phone" ? "tel" : "text"}
                        dir={key === "phone" ? "ltr" : undefined}
                        autoComplete={autoComplete}
                        maxLength={key === "phone" ? 24 : 80}
                        required
                        disabled={busy}
                        aria-invalid={Boolean(fields[key])}
                        aria-describedby={
                          fields[key] ? `chat-lead-error-${key}` : undefined
                        }
                        onChange={(event) =>
                          setContact((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                      />
                      {fields[key] ? (
                        <small
                          id={`chat-lead-error-${key}`}
                          className="chat-error"
                        >
                          {fields[key]}
                        </small>
                      ) : null}
                    </div>
                  ))}
                  <p className="chat-disclosure">
                    با شروع گفت‌وگو، نام و شمارهٔ شما برای پیگیری در Supabase
                    ذخیره و در اختیار تیم پشتیبانی قرار می‌گیرد.{" "}
                    <a href="/privacy" target="_blank" rel="noreferrer">
                      حریم خصوصی
                    </a>
                  </p>
                  <Button type="submit" disabled={busy}>
                    {busy ? "در حال ذخیره…" : "شروع گفت‌وگو"}
                  </Button>
                </form>
              ) : (
                <>
                  <p className="chat-contact-summary">
                    {lead.firstName} {lead.lastName}، سؤالتان را بنویسید.
                  </p>
                  <div
                    ref={log}
                    role="log"
                    aria-label="پیام‌های گفت‌وگو"
                    aria-live="polite"
                    aria-relevant="additions text"
                    className="chat-log"
                    onScroll={() => {
                      const element = log.current!;
                      const atBottom =
                        element.scrollHeight -
                          element.scrollTop -
                          element.clientHeight <
                        70;
                      const previous = pinned.current;
                      pinned.current = atBottom;
                      if (atBottom && !previous)
                        setReadRevision((value) => value + 1);
                    }}
                  >
                    {!messages.length ? (
                      <p>
                        سؤالت را کوتاه بنویس. اطلاعات کارت، عکس یا مدارک هویتی
                        را اینجا نفرست.
                      </p>
                    ) : null}
                    {messages.map((message) => (
                      <article
                        key={message.id}
                        className={`chat-bubble ${message.sender}`}
                      >
                        <small>
                          {message.sender === "staff" ? "کارشناس" : "شما"}
                        </small>
                        <p>{message.body}</p>
                      </article>
                    ))}
                  </div>
                  <p className="chat-connection" role="status">
                    {status}
                  </p>
                  {unread ? (
                    <button
                      className="chat-read-all"
                      disabled={busy}
                      onClick={() => void readAll()}
                    >
                      علامت‌گذاری همهٔ پاسخ‌ها به‌عنوان خوانده‌شده
                    </button>
                  ) : null}
                  <form className="chat-compose" onSubmit={send}>
                    <label htmlFor="chat-message" className="sr-only">
                      پیام شما
                    </label>
                    <Textarea
                      id="chat-message"
                      value={draft}
                      maxLength={2000}
                      rows={2}
                      disabled={busy}
                      placeholder="سؤالت را بنویس…"
                      onChange={(event) => {
                        setDraft(event.target.value);
                        attempt.current = "";
                      }}
                    />
                    <Button
                      size="icon"
                      disabled={busy || !draft.trim()}
                      aria-label="ارسال پیام"
                      type="submit"
                    >
                      <Send size={17} />
                    </Button>
                  </form>
                  <p className="chat-disclosure">
                    پیام برای تیم ذخیره می‌شود؛ آخرین ۱۰۰ پیام نمایش داده
                    می‌شود.{" "}
                    <a href="/privacy" target="_blank" rel="noreferrer">
                      حریم خصوصی
                    </a>
                  </p>
                </>
              )}
              {error ? (
                <p role="alert" className="chat-error">
                  {error}
                </p>
              ) : null}
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
