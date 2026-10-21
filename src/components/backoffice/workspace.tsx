"use client";

import { BackofficeShell } from "@/components/backoffice/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  pageDefinitions,
  type ContentPage,
  type PageContent,
  type PageSlug,
} from "@/lib/content-model";
import {
  ArrowLeft,
  ArrowUpLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  CircleDashed,
  FileText,
  Globe2,
  Loader2,
  PanelRightClose,
  PenLine,
  Search,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";

const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tehran",
  }).format(new Date(value));
const hasDraft = (page: ContentPage) =>
  JSON.stringify(page.draft_content) !== JSON.stringify(page.published_content);

/** One workspace owns loading/error states; no fabricated analytics or successful writes. */
export function BackofficeWorkspace({
  initialPages,
  email,
  initialError = null,
}: {
  initialPages: ContentPage[];
  email: string;
  initialError?: string | null;
}) {
  const [pages, setPages] = useState(initialPages);
  const [selected, setSelected] = useState<PageSlug | null>(null);
  const [navigationDirty, setNavigationDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState(initialError ?? "");
  const [loading, setLoading] = useState(false);
  const current = pages.find((page) => page.slug === selected);
  const drafts = pages.filter(hasDraft).length;
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/backoffice/pages", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPages(data.pages);
    } catch {
      setError("دریافت صفحات انجام نشد. دوباره تلاش کنید.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <BackofficeShell
      beforeNavigate={() =>
        !navigationDirty ||
        window.confirm("تغییرات ذخیره نشده‌اند. از ویرایش خارج می‌شوید؟")
      }
      email={email}
      title={current ? pageDefinitions[current.slug].title : "محتوای صفحات"}
      active="content"
    >
      <main className="bo-content" id="bo-pages">
        {error ? (
          <div className="bo-error-banner" role="alert">
            {error}
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={refresh}
            >
              تلاش دوباره
            </Button>
          </div>
        ) : null}
        {current ? (
          <PageEditor
            onDirtyChange={setNavigationDirty}
            key={current.slug}
            page={current}
            onBack={() => {
              setSelected(null);
              setNavigationDirty(false);
            }}
            onSaved={(page) =>
              setPages((previous) =>
                previous.map((item) => (item.slug === page.slug ? page : item)),
              )
            }
          />
        ) : (
          <>
            <div className="bo-page-heading">
              <div>
                <span className="bo-overline">یک نگاه به فضای کاری شما</span>
                <h1>مدیریت محتوا</h1>
                <p>صفحه‌ها را به‌روز نگه دارید؛ هر تغییر، یک تجربه بهتر.</p>
              </div>
              <Button asChild variant="outline">
                <a href="/" target="_blank" rel="noreferrer">
                  <Globe2 />
                  مشاهده وب‌سایت
                  <ArrowUpLeft />
                </a>
              </Button>
            </div>
            <section className="bo-welcome">
              <div>
                <Badge className="bo-light-badge">
                  <span className="bo-dot" /> فضای مدیریت شما
                </Badge>
                <h2>
                  متن درست،
                  <br />
                  در جای درست.
                </h2>
                <p>
                  از اولین جمله تا آخرین جزئیات،
                  <br />
                  روایت یارگشت را اینجا مدیریت کنید.
                </p>
                <a href="#page-list">
                  شروع ویرایش صفحات
                  <ArrowLeft size={17} />
                </a>
              </div>
              <div className="bo-welcome-graphic" aria-hidden="true">
                <span className="bo-floating-check">
                  <Check size={18} />
                </span>
                <div className="bo-paper">
                  <span />
                  <span />
                  <i />
                  <span />
                  <span />
                  <div>
                    <span />
                    <span />
                  </div>
                </div>
                <div className="bo-paper back" />
                <span className="bo-graphic-caption" dir="ltr">
                  A LITTLE DETAIL. A BETTER EXPERIENCE.
                </span>
              </div>
            </section>
            <section className="bo-stats" aria-label="وضعیت محتوا">
              <Stat
                icon={<FileText />}
                label="صفحات قابل مدیریت"
                value={pages.length}
                detail="صفحه اصلی و صفحات راهنما"
              />
              <Stat
                icon={<CheckCircle2 />}
                label="صفحات منتشرشده"
                value={pages.length}
                detail="در دسترس بازدیدکنندگان سایت"
              />
              <Stat
                icon={<PenLine />}
                label="پیش‌نویس‌های جدید"
                value={drafts}
                detail={
                  drafts
                    ? "آماده بازبینی و انتشار"
                    : "همه تغییرات منتشر شده‌اند"
                }
              />
            </section>
            <Card className="bo-page-list" id="page-list">
              <div className="bo-list-heading">
                <div>
                  <h2>
                    صفحات وب‌سایت{" "}
                    <span>
                      {new Intl.NumberFormat("fa-IR").format(pages.length)}
                    </span>
                  </h2>
                  <p>یک صفحه را انتخاب کنید و روایتش را به‌روز کنید.</p>
                </div>
                <div className="bo-search">
                  <Search size={16} />
                  <Input
                    aria-label="جست‌وجوی صفحات"
                    placeholder="جست‌وجوی صفحه…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
              </div>
              <div className="bo-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">عنوان صفحه</th>
                      <th scope="col">وضعیت</th>
                      <th scope="col">آخرین تغییر</th>
                      <th scope="col">
                        <span className="sr-only">عملیات</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pages
                      .filter((page) =>
                        pageDefinitions[page.slug].title.includes(
                          search.trim(),
                        ),
                      )
                      .map((page) => (
                        <tr key={page.slug}>
                          <td>
                            <div className="bo-page-name">
                              <span
                                className={`bo-page-icon ${page.slug === "home" ? "featured" : ""}`}
                              >
                                <FileText size={20} />
                              </span>
                              <div>
                                <button
                                  type="button"
                                  aria-label={`ویرایش ${pageDefinitions[page.slug].title}`}
                                  onClick={() => setSelected(page.slug)}
                                >
                                  <strong>
                                    {pageDefinitions[page.slug].title}
                                  </strong>
                                </button>
                                <small dir="ltr">
                                  {pageDefinitions[page.slug].path}
                                </small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <Badge
                              className={
                                hasDraft(page)
                                  ? "bo-draft-badge"
                                  : "bo-published-badge"
                              }
                            >
                              <span className="bo-dot" />
                              {hasDraft(page) ? "پیش‌نویس جدید" : "منتشرشده"}
                            </Badge>
                          </td>
                          <td>
                            <time dateTime={page.updated_at}>
                              {dateLabel(page.updated_at)}
                            </time>
                          </td>
                          <td>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelected(page.slug)}
                            >
                              ویرایش صفحه
                              <ArrowLeft />
                            </Button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {!pages.some((page) =>
                pageDefinitions[page.slug].title.includes(search.trim()),
              ) ? (
                <div className="bo-empty">
                  {loading ? "در حال دریافت صفحات…" : "صفحه‌ای پیدا نشد."}
                </div>
              ) : null}
              <div className="bo-list-footer">
                <ShieldCheck size={15} />
                <span>
                  تغییرات پیش‌نویس تنها پس از انتشار روی سایت نمایش داده
                  می‌شوند.
                </span>
              </div>
            </Card>
            <div className="bo-bottom-note">
              <span>
                <span className="bo-dot" />{" "}
                {pages.length
                  ? "محتوای صفحات از Supabase دریافت شد"
                  : "محتوایی دریافت نشده است"}
              </span>
              <span>با دقت ساخته شده، برای شروع‌های تازه.</span>
            </div>
          </>
        )}
      </main>
    </BackofficeShell>
  );
}

/** Counts are derived from fetched records rather than sample dashboard numbers. */
function Stat({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="bo-stat">
        <div>
          <span>{label}</span>
          <strong>{new Intl.NumberFormat("fa-IR").format(value)}</strong>
          <small>{detail}</small>
        </div>
        <span className="bo-stat-icon">{icon}</span>
      </CardContent>
    </Card>
  );
}

/** A complete draft is saved with its revision; network/conflict errors retain local edits. */
function PageEditor({
  onDirtyChange,
  page,
  onBack,
  onSaved,
}: {
  onDirtyChange: (dirty: boolean) => void;
  page: ContentPage;
  onBack: () => void;
  onSaved: (page: ContentPage) => void;
}) {
  const definition = pageDefinitions[page.slug];
  const groups = [...new Set(definition.fields.map((field) => field.group))];
  const [group, setGroup] = useState(groups[0]);
  const [content, setContent] = useState<PageContent>({
    ...page.draft_content,
  });
  const [busy, setBusy] = useState<"save" | "publish" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const dirty = JSON.stringify(content) !== JSON.stringify(page.draft_content);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  const fields = definition.fields.filter((field) => field.group === group);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function save(action: "save" | "publish") {
    if (busy) return;
    setBusy(action);
    setMessage("");
    setError(false);
    try {
      const response = await fetch(`/api/backoffice/pages/${page.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, content, revision: page.revision }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "ذخیره انجام نشد.");
      setContent({ ...data.page.draft_content });
      onSaved(data.page);
      setMessage(
        action === "publish"
          ? "محتوا منتشر شد و روی سایت قابل مشاهده است."
          : "پیش‌نویس ذخیره شد؛ محتوای سایت تغییر نکرد.",
      );
    } catch (err) {
      setError(true);
      setMessage(
        err instanceof Error
          ? err.message
          : "ارتباط برقرار نشد؛ متن شما حفظ شده است.",
      );
    } finally {
      setBusy(null);
    }
  }
  function back() {
    if (
      !dirty ||
      window.confirm("تغییرات ذخیره نشده‌اند. از ویرایش خارج می‌شوید؟")
    )
      onBack();
  }
  return (
    <div className="bo-editor">
      <button className="bo-editor-back" onClick={back}>
        <ArrowLeft size={15} /> بازگشت به صفحات
      </button>
      <div className="bo-page-heading">
        <div>
          <span className="bo-overline">ویرایش محتوا</span>
          <h1>{definition.title}</h1>
          <p>متن‌ها را ویرایش کنید؛ چینش صفحه حفظ می‌شود.</p>
        </div>
        <div className="bo-editor-actions">
          <Button
            variant="outline"
            disabled={!!busy || !dirty}
            onClick={() => save("save")}
          >
            {busy === "save" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <PenLine />
            )}
            ذخیره پیش‌نویس
          </Button>
          <Button
            disabled={!!busy || (!dirty && !hasDraft(page))}
            onClick={() => save("publish")}
          >
            {busy === "publish" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Send />
            )}
            انتشار تغییرات
          </Button>
        </div>
      </div>
      <div className="bo-editor-status">
        <span>
          <span className="bo-dot" />
          {dirty
            ? "تغییرات ذخیره‌نشده"
            : hasDraft(page)
              ? "پیش‌نویس ذخیره‌شده"
              : "همگام با سایت"}
        </span>
        <span>
          نسخه {new Intl.NumberFormat("fa-IR").format(page.revision)} ·{" "}
          {dateLabel(page.updated_at)}
        </span>
        <a href={definition.path} target="_blank" rel="noreferrer">
          مشاهده نسخه منتشرشده
          <ArrowUpLeft size={15} />
        </a>
      </div>
      {message ? (
        <div
          role={error ? "alert" : "status"}
          className={error ? "bo-error-banner" : "bo-success-banner"}
        >
          {error ? <CircleDashed size={18} /> : <CheckCircle2 size={18} />}{" "}
          {message}
        </div>
      ) : null}
      <div className="bo-editor-grid">
        <nav className="bo-sections" aria-label="بخش‌های صفحه">
          <h2>بخش‌های صفحه</h2>
          {groups.map((item, index) => (
            <button
              key={item}
              aria-current={group === item ? "true" : undefined}
              onClick={() => setGroup(item)}
            >
              <span>
                {new Intl.NumberFormat("fa-IR")
                  .format(index + 1)
                  .padStart(2, "۰")}
              </span>
              {item}
              <ChevronLeft size={14} />
            </button>
          ))}
        </nav>
        <Card className="bo-fields">
          <div className="bo-fields-header">
            <div>
              <span className="bo-overline">محتوای بخش</span>
              <h2>{group}</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? <PanelRightClose /> : <FileText />}
              {showPreview ? "بازگشت به ویرایش" : "مرور متن"}
            </Button>
          </div>
          <CardContent>
            {showPreview ? (
              <div className="bo-copy-preview">
                {fields.map((field) => (
                  <p key={field.key}>{content[field.key]}</p>
                ))}
              </div>
            ) : (
              <fieldset disabled={!!busy} className="bo-fieldset">
                {fields.map((field) => (
                  <div className="bo-field" key={field.key}>
                    <Label htmlFor={`field-${field.key}`}>{field.label}</Label>
                    {field.value.length > 95 ? (
                      <Textarea
                        id={`field-${field.key}`}
                        required
                        maxLength={4000}
                        value={content[field.key] ?? ""}
                        onChange={(event) =>
                          setContent((previous) => ({
                            ...previous,
                            [field.key]: event.target.value,
                          }))
                        }
                        rows={4}
                      />
                    ) : (
                      <Input
                        id={`field-${field.key}`}
                        required
                        maxLength={4000}
                        value={content[field.key] ?? ""}
                        onChange={(event) =>
                          setContent((previous) => ({
                            ...previous,
                            [field.key]: event.target.value,
                          }))
                        }
                      />
                    )}
                    <small>
                      {new Intl.NumberFormat("fa-IR").format(
                        content[field.key]?.length ?? 0,
                      )}{" "}
                      نویسه
                    </small>
                  </div>
                ))}
              </fieldset>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
