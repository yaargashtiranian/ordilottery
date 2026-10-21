"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Image from "next/image";
import {
  Check,
  Download,
  Eye,
  FileText,
  History,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import {
  documentRules,
  documentStatuses,
  type CaseDocument,
  type DocumentPayload,
} from "@/lib/documents-model";
import { recordDate } from "@/lib/operations-model";

/** Case-scoped versions keep original customer files separate from staff replacements. */
export function CaseDocuments({
  caseId,
  staff = true,
}: {
  caseId: string;
  staff?: boolean;
}) {
  const [data, setData] = useState<DocumentPayload | null>(null),
    [error, setError] = useState("");
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [upload, setUpload] = useState<CaseDocument | "new" | null>(null);
  const [review, setReview] = useState<{
    doc: CaseDocument;
    status: "approved" | "rejected";
  } | null>(null);
  const [preview, setPreview] = useState<CaseDocument | null>(null);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/documents/cases/${caseId}`, {
          signal,
          cache: "no-store",
        });
        const value = await response.json();
        if (!response.ok) throw new Error(value.error);
        setData(value);
      } catch (e) {
        if (!signal?.aborted)
          setError(e instanceof Error ? e.message : "دریافت مدارک انجام نشد.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [caseId],
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void load(controller.signal), 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);
  const expired = Boolean(data?.expired);
  const canUpload = Boolean(
    data?.configured && !expired && (staff || data?.access.enabled),
  );
  const groups = new Map<string, CaseDocument[]>();
  for (const doc of data?.documents || []) {
    const rows = groups.get(doc.group_id) || [];
    rows.push(doc);
    groups.set(doc.group_id, rows);
  }
  const latest = Array.from(groups.values()).map((versions) =>
    versions.sort((a, b) => b.version - a.version),
  );
  async function changeAccess() {
    if (!data) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/documents/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !data.access.enabled }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData({ ...data, access: result.access });
    } catch (e) {
      setError(e instanceof Error ? e.message : "تغییر دسترسی انجام نشد.");
    } finally {
      setBusy(false);
    }
  }
  async function purge() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/documents/maintenance?case_id=${caseId}`,
        {
          method: "POST",
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setNotice(`${result.deleted} نسخهٔ منقضی پاک شد.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "پاک‌سازی انجام نشد.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="docs-panel"
      aria-label="مدارک پرونده"
      aria-busy={loading}
    >
      <header className="docs-heading">
        <div>
          <span className="docs-eyebrow">
            <ShieldCheck size={15} /> فضای خصوصی پرونده
          </span>
          <h3>مدارک و بررسی کارشناس</h3>
          <p>اصل فایل، نسخه‌های اصلاح‌شده و نتیجهٔ بررسی، کنار هم.</p>
        </div>
        <div className="docs-actions">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={15} /> تازه‌سازی مدارک
          </Button>
          <Button
            size="sm"
            onClick={() => setUpload("new")}
            disabled={!canUpload}
          >
            <Plus size={16} /> افزودن مدرک
          </Button>
        </div>
      </header>
      {data ? (
        <div className="docs-intake">
          <div>
            <strong>
              {data.access.enabled
                ? "ارسال مشتری فعال است"
                : "ارسال مشتری بسته است"}
            </strong>
            <p>
              {staff ? (
                <>
                  مشتری با ایمیل <bdi>{data.access.customer_email}</bdi> از{" "}
                  <a href="/portal" target="_blank" rel="noreferrer">
                    صفحهٔ مدارک مشتری
                  </a>{" "}
                  وارد می‌شود.
                </>
              ) : (
                "برای ارسال مدرک، کارشناس باید دریافت مدارک این پرونده را فعال کند."
              )}
            </p>
          </div>
          {staff ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy || expired || !data.configured}
              onClick={() => void changeAccess()}
            >
              {data.access.enabled
                ? "بستن ارسال مشتری"
                : "فعال‌کردن ارسال مشتری"}
            </Button>
          ) : null}
        </div>
      ) : null}
      {data && !data.configured ? (
        <p className="docs-warning">
          بارگذاری تا پیکربندی کلید رمزگذاری سمت سرور غیرفعال است.
        </p>
      ) : null}
      {expired ? (
        <p className="docs-warning">
          دورهٔ نگهداری پایان یافته است؛ مشاهده و بارگذاری فایل بسته است.{" "}
          {staff ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void purge()}
            >
              پاک‌سازی فایل‌های منقضی
            </Button>
          ) : null}
        </p>
      ) : null}
      {error ? (
        <p className="bo-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="bo-success" role="status">
        {notice}
      </p>
      {loading && !data ? (
        <p className="docs-empty">
          <Loader2 className="animate-spin" size={20} /> در حال دریافت مدارک…
        </p>
      ) : data && !latest.length ? (
        <div className="docs-empty">
          <FileText size={30} />
          <strong>هنوز مدرکی ثبت نشده است</strong>
          <span>فایل‌های PDF، JPEG و PNG تا ۵ مگابایت قابل ارسال‌اند.</span>
        </div>
      ) : null}
      <div className="docs-list">
        {latest.map((versions) => (
          <article className="docs-group" key={versions[0].group_id}>
            <DocumentRow
              doc={versions[0]}
              staff={staff}
              canUpload={canUpload}
              onUpload={setUpload}
              onReview={setReview}
              onPreview={setPreview}
            />
            {versions.length > 1 ? (
              <details className="docs-history">
                <summary>
                  <History size={15} /> نسخه‌های قبلی ({versions.length - 1})
                </summary>
                {versions.slice(1).map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    staff={staff}
                    canUpload={false}
                    onUpload={setUpload}
                    onReview={setReview}
                    onPreview={setPreview}
                  />
                ))}
              </details>
            ) : null}
          </article>
        ))}
      </div>
      <p className="docs-footnote">
        مدارک در Supabase به‌صورت خصوصی و رمزگذاری‌شده همراه با نسخهٔ پشتیبان
        نگهداری می‌شوند؛ مهلت نگهداری تا پایان یا لغو پرونده و ۹۰ روز پس از آن
        است.
        {data?.access.retention_at ? (
          <> مهلت فعلی: {recordDate(data.access.retention_at)}.</>
        ) : null}{" "}
        بررسی مدرک، تأیید ثبت رسمی DV نیست.
      </p>
      {upload ? (
        <DocumentUpload
          caseId={caseId}
          previous={upload === "new" ? null : upload}
          onClose={() => setUpload(null)}
          onSaved={() => {
            setUpload(null);
            setNotice("فایل و پشتیبان ذخیره شدند؛ نسخه در انتظار بررسی است.");
            void load();
          }}
        />
      ) : null}
      {review ? (
        <DocumentReview
          initial={review}
          onClose={() => setReview(null)}
          onSaved={() => {
            setReview(null);
            setNotice("نتیجه بررسی ذخیره شد.");
            void load();
          }}
        />
      ) : null}
      {preview ? (
        <Dialog
          open
          onOpenChange={() => setPreview(null)}
          title={preview.title}
          description={`پیش‌نمایش نسخه ${preview.version}؛ فایل خصوصی است.`}
        >
          <div className="docs-preview">
            <Image
              src={`/api/documents/${preview.id}/file?preview=1`}
              alt={`مدرک ${preview.title}`}
              width={1000}
              height={1000}
              unoptimized
              onError={() =>
                setError(
                  "پیش‌نمایش دریافت نشد؛ دریافت فایل یا پشتیبان را امتحان کنید.",
                )
              }
            />
          </div>
          <a
            className="docs-download"
            href={`/api/documents/${preview.id}/file`}
          >
            دریافت فایل اصلی <Download size={15} />
          </a>
        </Dialog>
      ) : null}
    </section>
  );
}

type ReviewSelection = { doc: CaseDocument; status: "approved" | "rejected" };
/** Older versions stay visible and reviewable; only the newest row offers another replacement. */
function DocumentRow({
  doc,
  staff,
  canUpload,
  onUpload,
  onReview,
  onPreview,
}: {
  doc: CaseDocument;
  staff: boolean;
  canUpload: boolean;
  onUpload: (doc: CaseDocument) => void;
  onReview: (selection: ReviewSelection) => void;
  onPreview: (doc: CaseDocument) => void;
}) {
  return (
    <div className="docs-row">
      <div className="docs-file-icon">
        <FileText size={22} />
      </div>
      <div className="docs-file-info">
        <div className="docs-title">
          <h4>{doc.title}</h4>
          <span className={`docs-status docs-status-${doc.status}`}>
            {documentStatuses[doc.status]}
          </span>
        </div>
        <p>
          {documentRules.kinds[doc.kind]} ·{" "}
          {documentRules.roles[doc.applicant_role]} · نسخه {doc.version} ·{" "}
          {doc.source === "customer" ? "ارسال مشتری" : "ارسال کارشناس"}
        </p>
        <p>
          <bdi>{doc.filename}</bdi> · {Math.ceil(doc.byte_size / 1024)} کیلوبایت
          · {recordDate(doc.created_at)}
        </p>
        {doc.review_note ? (
          <p
            className={`docs-review-note ${doc.status === "rejected" ? "docs-rejected-note" : ""}`}
          >
            <strong>
              {doc.status === "rejected" ? "دلیل رد: " : "یادداشت بررسی: "}
            </strong>
            {doc.review_note}
          </p>
        ) : null}
        {doc.reviewed_at ? (
          <small>بررسی‌شده در {recordDate(doc.reviewed_at)}</small>
        ) : null}
        <div className="docs-row-actions">
          {doc.mime_type.startsWith("image/") ? (
            <Button variant="ghost" size="sm" onClick={() => onPreview(doc)}>
              <Eye size={15} /> مشاهده
            </Button>
          ) : null}
          <a className="docs-download" href={`/api/documents/${doc.id}/file`}>
            <Download size={15} /> دریافت{" "}
            {doc.mime_type === "application/pdf" ? "PDF" : "فایل"}
          </a>
          {staff ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onReview({ doc, status: "approved" })}
              >
                <Check size={15} /> تأیید
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onReview({ doc, status: "rejected" })}
              >
                <X size={15} /> رد با دلیل
              </Button>
              <a
                className="docs-download"
                href={`/api/documents/${doc.id}/file?backup=1`}
              >
                دریافت از پشتیبان
              </a>
            </>
          ) : null}
          {canUpload ? (
            <Button variant="outline" size="sm" onClick={() => onUpload(doc)}>
              <Upload size={15} /> نسخهٔ جدید
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** A stable ID survives upload retries; file selections and review drafts never enter browser storage. */
function DocumentUpload({
  caseId,
  previous,
  onClose,
  onSaved,
}: {
  caseId: string;
  previous: CaseDocument | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const uploadId = useRef<string | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  function close() {
    if (
      !busy &&
      (!dirty ||
        window.confirm("فرم بارگذاری بسته شود؟ فایل هنوز ارسال نشده است."))
    )
      onClose();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      !file.size ||
      file.size > documentRules.maxBytes
    ) {
      setError("فایل معتبر تا سقف ۵ مگابایت انتخاب کنید.");
      setBusy(false);
      return;
    }
    uploadId.current ||= crypto.randomUUID();
    form.set("id", uploadId.current);
    if (previous) form.set("group_id", previous.group_id);
    try {
      const response = await fetch(`/api/documents/cases/${caseId}`, {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setDirty(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "بارگذاری انجام نشد.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={close}
      title={previous ? `نسخهٔ جدید: ${previous.title}` : "افزودن مدرک"}
      description="نسخه‌های قبلی حفظ می‌شوند. فایل پس از ارسال در انتظار بررسی خواهد بود."
    >
      <form
        className="docs-form"
        onSubmit={submit}
        onChange={() => setDirty(true)}
      >
        <fieldset disabled={busy}>
          <div>
            <Label htmlFor="doc-title">عنوان مدرک</Label>
            <Input
              id="doc-title"
              name="title"
              required
              minLength={2}
              maxLength={120}
              defaultValue={previous?.title}
              readOnly={Boolean(previous)}
              placeholder="مثلاً عکس اصلاح‌شده متقاضی"
            />
          </div>
          <div className="docs-form-grid">
            <div>
              <Label htmlFor="doc-kind">نوع مدرک</Label>
              <select
                id="doc-kind"
                name="kind"
                defaultValue={previous?.kind || "general"}
                disabled={Boolean(previous)}
              >
                {Object.entries(documentRules.kinds).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              {previous ? (
                <input type="hidden" name="kind" value={previous.kind} />
              ) : null}
            </div>
            <div>
              <Label htmlFor="doc-role">صاحب مدرک</Label>
              <select
                id="doc-role"
                name="applicant_role"
                defaultValue={previous?.applicant_role || "applicant"}
                disabled={Boolean(previous)}
              >
                {Object.entries(documentRules.roles).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              {previous ? (
                <input
                  type="hidden"
                  name="applicant_role"
                  value={previous.applicant_role}
                />
              ) : null}
            </div>
          </div>
          <div>
            <Label htmlFor="doc-file">فایل مدرک</Label>
            <Input
              id="doc-file"
              name="file"
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              required
              onChange={() => {
                uploadId.current = null;
              }}
            />
            <p className="docs-footnote">
              PDF، JPEG یا PNG، حداکثر ۵ مگابایت. فقط مدرک درخواست‌شدهٔ کارشناس
              را ارسال کنید. محدودیت فایل به معنی تأیید الزامات رسمی عکس نیست.
            </p>
          </div>
          <p role="alert" className="bo-error">
            {error}
          </p>
          <Button type="submit">
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Upload size={16} />
            )}{" "}
            ارسال و ذخیرهٔ نسخه
          </Button>
        </fieldset>
      </form>
    </Dialog>
  );
}

/** Failed/conflicting writes preserve the expert's explanation until they explicitly close the dialog. */
function DocumentReview({
  initial,
  onClose,
  onSaved,
}: {
  initial: ReviewSelection;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [note, setNote] = useState(initial.doc.review_note),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/documents/${initial.doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: initial.status,
          note,
          revision: initial.doc.revision,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "بررسی ذخیره نشد.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={() => {
        if (
          !busy &&
          (note === initial.doc.review_note ||
            window.confirm("یادداشت بررسی ذخیره نشده است؛ فرم بسته شود؟"))
        )
          onClose();
      }}
      title={
        initial.status === "approved" ? "تأیید مدرک" : "رد مدرک و درخواست اصلاح"
      }
      description={`${initial.doc.title}، نسخه ${initial.doc.version}. نتیجه و توضیح برای مشتری قابل مشاهده است.`}
    >
      <form className="docs-form" onSubmit={submit}>
        <Label htmlFor="doc-review-note">
          {initial.status === "rejected"
            ? "دلیل رد و اصلاح موردنیاز (الزامی)"
            : "یادداشت بررسی (اختیاری)"}
        </Label>
        <Textarea
          id="doc-review-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
          minLength={initial.status === "rejected" ? 3 : undefined}
          required={initial.status === "rejected"}
          disabled={busy}
        />
        <p role="alert" className="bo-error">
          {error}
        </p>
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" size={16} /> : null}
          {initial.status === "approved" ? "ثبت تأیید" : "ثبت رد مدرک"}
        </Button>
      </form>
    </Dialog>
  );
}
