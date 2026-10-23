"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { MessageCircle, Send, X, ArrowRight, Headphones } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Guide } from "./guide";
import { assistantTopics, type ChatMessage } from "@/lib/growth/model";
import { experience } from "@/lib/growth/client";

/** Deterministic FAQ assistant plus private human handoff; polling runs only for an open, visible chat. */
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [human, setHuman] = useState(false);
  const [answer, setAnswer] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [revision, setRevision] = useState(0);
  const attempt = useRef("");
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) close.current?.focus();
    else if (wasOpen.current) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);
  useEffect(() => {
    if (!open) return;
    // Sending disables the submit button and can move focus to body; Escape must still close the non-modal panel.
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
  useEffect(() => {
    if (!open || !human) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    let delay = 4000;
    async function poll() {
      if (document.visibilityState !== "hidden") {
        try {
          const response = await fetch("/api/experience", {
            cache: "no-store",
            signal: controller.signal,
          });
          if (response.status === 401) {
            setStatus(
              "پیام اول را بنویس؛ پاسخ‌ها در همین مرورگر نمایش داده می‌شوند.",
            );
          } else {
            const data = await response.json();
            if (!response.ok) throw new Error();
            setMessages(data.messages);
            setStatus(
              data.conversation?.status === "closed"
                ? "گفت‌وگو بسته شده؛ با پیام جدید دوباره باز می‌شود."
                : data.conversation?.status === "replied"
                  ? "کارشناس پاسخ داده است."
                  : data.conversation
                    ? "پیام دریافت شده؛ در انتظار پاسخ کارشناس."
                    : "پیام اول را بنویس؛ پاسخ‌ها اینجا نمایش داده می‌شوند.",
            );
          }
          delay = 4000;
        } catch {
          if (!stopped) {
            setStatus("ارتباط موقتاً قطع شده؛ دوباره بررسی می‌کنیم.");
            delay = Math.min(delay * 2, 30000);
          }
        }
      }
      if (!stopped) timer = setTimeout(poll, delay);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, human, revision]);
  function dismiss() {
    setOpen(false);
    trigger.current?.focus();
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy || !draft.trim()) return;
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
  return (
    <div className="chat-widget">
      {!open && (
        <button
          ref={trigger}
          className="chat-trigger"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label="سؤالی داری؟"
        >
          <MessageCircle size={22} />
          <span>سؤالی داری؟</span>
        </button>
      )}
      {open && (
        <section
          className="chat-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="chat-title"
          onKeyDown={(event) => {
            if (event.key === "Escape") dismiss();
          }}
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
              onClick={dismiss}
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
              {answer && (
                <p className="chat-answer" role="status">
                  {answer}
                </p>
              )}
              <Button className="w-full" onClick={() => setHuman(true)}>
                <Headphones size={18} />
                می‌خواهم با کارشناس صحبت کنم
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
              <div
                ref={log}
                role="log"
                aria-label="پیام‌های گفت‌وگو"
                aria-live="polite"
                aria-relevant="additions text"
                className="chat-log"
                onScroll={() => {
                  const el = log.current!;
                  pinned.current =
                    el.scrollHeight - el.scrollTop - el.clientHeight < 70;
                }}
              >
                {!messages.length && (
                  <p>
                    سؤالت را کوتاه بنویس. اطلاعات کارت، عکس یا مدارک هویتی را
                    اینجا نفرست.
                  </p>
                )}
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
              {error && (
                <p role="alert" className="chat-error">
                  {error}
                </p>
              )}
              <p className="chat-disclosure">
                با ارسال، پیام برای تیم ذخیره می‌شود. آخرین ۱۰۰ پیام نمایش داده
                می‌شود.{" "}
                <a href="/privacy" target="_blank" rel="noreferrer">
                  حریم خصوصی
                </a>
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
