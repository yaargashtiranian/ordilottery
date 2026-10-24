"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileCheck2,
  Files,
  Loader2,
  MessagesSquare,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { BackofficeShell } from "@/components/backoffice/shell";
import { CaseDocuments } from "@/components/documents/case-documents";
import {
  OperationsForm,
  type OperationsFormState,
} from "@/components/backoffice/operations-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  channels,
  fullName,
  money,
  recordDate,
  sections,
  serviceStatuses,
  reviewStatuses,
  paymentStatuses,
  ticketStatuses,
  priorities,
  type Summary,
  type Activity,
  type OperationDetail,
  type OperationRecord,
  type OperationsSection,
  type Customer,
  type CaseRecord,
  type PaymentRecord,
  type TicketRecord,
} from "@/lib/operations-model";

type Payload = {
  summary: Summary | null;
  rows: OperationRecord[];
  activity: Activity[];
  total: number;
  page: number;
};
const introductions = {
  overview: "پرونده‌ها، پیگیری‌ها و ارتباط با مشتری؛ همه در یک نگاه.",
  cases: "از شروع درخواست تا پایان خدمت، هیچ قدمی از قلم نیفتد.",
  customers: "اطلاعات تماس و سوابق هر مشتری، کنار هم و قابل پیگیری.",
  payments: "رسیدهای دستی، مبالغ و سوابق مالی هر پرونده.",
  support: "درخواست‌های مشتریان را ثبت کنید و رسیدگی را ادامه دهید.",
};
const createLabels = {
  overview: "مشتری جدید",
  customers: "مشتری جدید",
  cases: "پرونده جدید",
  payments: "ثبت رسید",
  support: "درخواست جدید",
};

/** Private operational state is loaded through the API; errors never become fabricated empty success. */
export function OperationsWorkspace({
  email,
  section,
  initialData,
  initialError = "",
  initialId,
}: {
  email: string;
  section: OperationsSection;
  initialData: unknown;
  initialError?: string;
  initialId?: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(
    initialData as Payload | null,
  );
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialId ?? null,
  );
  const [detail, setDetail] = useState<OperationDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailBusy, setDetailBusy] = useState(false);
  const [form, setForm] = useState<OperationsFormState | null>(null);
  const first = useRef(true);
  const listRequest = useRef<AbortController | null>(null);
  const detailRequest = useRef<AbortController | null>(null);
  const load = useCallback(
    async (q: string, p: number, s: string) => {
      listRequest.current?.abort();
      const controller = new AbortController();
      listRequest.current = controller;
      setBusy(true);
      setError("");
      try {
        const params = new URLSearchParams({ q, page: String(p), status: s });
        const response = await fetch(
          `/api/backoffice/operations/${section}?${params}`,
          { signal: controller.signal },
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setData(result);
      } catch (err) {
        if (!controller.signal.aborted)
          setError(
            err instanceof Error ? err.message : "دریافت اطلاعات انجام نشد.",
          );
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    },
    [section],
  );
  const loadDetail = useCallback(
    async (id: string) => {
      detailRequest.current?.abort();
      const controller = new AbortController();
      detailRequest.current = controller;
      setDetailBusy(true);
      setDetailError("");
      try {
        const response = await fetch(
          `/api/backoffice/operations/${section}/${id}`,
          { signal: controller.signal },
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setDetail(result);
      } catch (err) {
        if (!controller.signal.aborted) {
          setDetail(null);
          setDetailError(
            err instanceof Error ? err.message : "دریافت جزئیات انجام نشد.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setDetailBusy(false);
      }
    },
    [section],
  );
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => void load(query, page, status), 300);
    return () => clearTimeout(timer);
  }, [query, page, status, load]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedId) void loadDetail(selectedId);
    }, 0);
    return () => {
      clearTimeout(timer);
      detailRequest.current?.abort();
    };
  }, [selectedId, loadDetail]);
  useEffect(
    () => () => {
      listRequest.current?.abort();
      detailRequest.current?.abort();
    },
    [],
  );
  function create() {
    setForm({ entity: section === "overview" ? "customers" : section });
  }
  function saved(entity: string, id: string) {
    setForm(null);
    setMessage("اطلاعات با موفقیت ذخیره شد.");
    void load(query, page, status);
    if (entity === "notes") {
      if (selectedId) void loadDetail(selectedId);
      return;
    }
    if (entity !== section) {
      router.push(`/backoffice/${entity}?id=${id}`);
      return;
    }
    setSelectedId(id);
    if (selectedId === id) void loadDetail(id);
  }
  function select(id: string) {
    setDetail(null);
    setDetailError("");
    setSelectedId(id);
    setMessage("");
  }
  const count = data?.total ?? 0;
  const states =
    section === "cases"
      ? serviceStatuses
      : section === "support"
        ? ticketStatuses
        : paymentStatuses;
  return (
    <BackofficeShell email={email} title={sections[section]} active={section}>
      <main className="bo-content ops-content">
        <div className="bo-page-heading">
          <div>
            <span className="bo-overline">میز کار تیم یارگشت</span>
            <h1>{sections[section]}</h1>
            <p>{introductions[section]}</p>
          </div>
          <div className="ops-heading-actions">
            <Button
              aria-label="تازه‌سازی اطلاعات"
              variant="outline"
              size="icon"
              disabled={busy}
              onClick={() => {
                void load(query, page, status);
                if (selectedId) void loadDetail(selectedId);
              }}
            >
              <RefreshCw className={busy ? "animate-spin" : ""} />
            </Button>
            <Button onClick={create}>
              <Plus />
              {createLabels[section]}
            </Button>
          </div>
        </div>
        {error ? (
          <div className="bo-error-banner" role="alert">
            {error}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load(query, page, status)}
            >
              تلاش دوباره
            </Button>
          </div>
        ) : null}
        {message ? (
          <div className="bo-success-banner" role="status">
            <CheckCircle2 size={17} />
            {message}
          </div>
        ) : null}
        {selectedId ? (
          <>
            <button
              className="bo-editor-back"
              onClick={() => {
                setSelectedId(null);
                setDetail(null);
                setMessage("");
              }}
            >
              <ArrowLeft size={15} />
              بازگشت به فهرست
            </button>
            {detailBusy ? (
              <div className="ops-loading" role="status">
                <Loader2 className="animate-spin" />
                در حال دریافت جزئیات…
              </div>
            ) : detailError ? (
              <div className="bo-error-banner" role="alert">
                {detailError}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void loadDetail(selectedId)}
                >
                  تلاش دوباره
                </Button>
              </div>
            ) : detail ? (
              <Detail section={section} data={detail} onForm={setForm} />
            ) : null}
          </>
        ) : section === "overview" ? (
          <Overview data={data} onCreate={create} />
        ) : (
          <>
            {section === "payments" ? (
              <div className="ops-service-notice">
                <ShieldCheck size={19} />
                <div>
                  <strong>رسیدهای دستی</strong>
                  <p>درگاه متصل نیست؛ ثبت بازپرداخت وجهی منتقل نمی‌کند.</p>
                </div>
              </div>
            ) : null}
            <Card className="bo-page-list ops-list">
              <div className="bo-list-heading">
                <div>
                  <h2>
                    {sections[section]} <span>{data ? money(count) : "—"}</span>
                  </h2>
                </div>
                <div className="ops-filters">
                  <div className="bo-search">
                    <Search size={16} />
                    <Input
                      aria-label="جست‌وجوی رکوردها"
                      placeholder={
                        section === "cases"
                          ? "نام مشتری یا کد پرونده…"
                          : section === "payments"
                            ? "شناسه رسید…"
                            : "جست‌وجو…"
                      }
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                  {section !== "customers" ? (
                    <select
                      aria-label="فیلتر وضعیت"
                      value={status}
                      onChange={(event) => {
                        setStatus(event.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">همه وضعیت‌ها</option>
                      {Object.entries(states).map(([key, label]) => (
                        <option value={key} key={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              </div>
              {busy ? (
                <div className="ops-inline-loading" role="status">
                  در حال دریافت…
                </div>
              ) : null}
              {data?.rows.length ? (
                <RecordTable
                  section={section}
                  rows={data.rows}
                  onSelect={select}
                />
              ) : !error ? (
                <Empty
                  title={
                    query || status
                      ? "نتیجه‌ای پیدا نشد"
                      : "هنوز رکوردی ثبت نشده است"
                  }
                  description={
                    query || status
                      ? "عبارت جست‌وجو یا وضعیت را تغییر دهید."
                      : "از دکمه بالا برای ثبت اولین رکورد استفاده کنید."
                  }
                />
              ) : null}
              <div className="ops-pagination">
                <span>
                  {data
                    ? `${money(count)} رکورد · صفحه ${money(page)}`
                    : "اطلاعات دریافت نشده است"}
                </span>
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || busy}
                    onClick={() => setPage(page - 1)}
                  >
                    <ChevronRight />
                    قبلی
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page * 20 >= count || busy}
                    onClick={() => setPage(page + 1)}
                  >
                    بعدی
                    <ChevronLeft />
                  </Button>
                </div>
              </div>
            </Card>
          </>
        )}
        {form ? (
          <OperationsForm
            key={`${form.entity}-${form.record?.id ?? "new"}`}
            state={form}
            onClose={() => setForm(null)}
            onSaved={saved}
          />
        ) : null}
      </main>
    </BackofficeShell>
  );
}

/** Counts and amounts reflect only the database response, including honest zero-record states. */
function Overview({
  data,
  onCreate,
}: {
  data: Payload | null;
  onCreate: () => void;
}) {
  const summary = data?.summary;
  return (
    <>
      <section className="ops-hero">
        <div>
          <Badge className="bo-light-badge">
            <span className="bo-dot" />
            میز کار امروز
          </Badge>
          <h2>
            هر پرونده، یک مسیر.
            <br />
            هر قدم، قابل پیگیری.
          </h2>
          <p>
            از اولین تماس تا تکمیل خدمت، تصویر روشنی از کار تیم داشته باشید.
          </p>
          <Link href="/backoffice/cases">
            رفتن به پرونده‌ها
            <ArrowLeft size={17} />
          </Link>
        </div>
        <div className="ops-hero-art" aria-hidden="true">
          <div className="ops-folder">
            <Files size={54} strokeWidth={1} />
            <span />
            <span />
            <i>
              <CheckCircle2 size={18} />
              قدم بعد مشخص است
            </i>
          </div>
          <span className="ops-hero-ring" />
        </div>
      </section>
      <section className="ops-metrics" aria-label="آمار واقعی فضای کاری">
        <Metric
          label="مشتریان"
          value={summary?.customers}
          icon={<UsersRound />}
          detail="مخاطبان ثبت‌شده تیم"
        />
        <Metric
          label="پرونده‌های فعال"
          value={summary?.active_cases}
          icon={<Files />}
          detail={
            summary
              ? `${money(summary.needs_review)} پرونده نیازمند بررسی`
              : "اطلاعات دریافت نشده"
          }
        />
        <Metric
          label="پشتیبانی باز"
          value={summary?.open_tickets}
          icon={<MessagesSquare />}
          detail="در انتظار ادامه رسیدگی"
        />
        <Metric
          label="خالص رسیدهای دستی"
          value={summary?.recorded_amount}
          icon={<WalletCards />}
          detail="تومان · بدون تأیید بانکی"
          moneyValue
        />
      </section>
      <div className="ops-overview-grid">
        <Card className="bo-page-list">
          <div className="bo-list-heading">
            <div>
              <h2>آخرین پرونده‌ها</h2>
              <p>تازه‌ترین تغییرات در مسیر خدمت</p>
            </div>
            <Link className="ops-text-link" href="/backoffice/cases">
              همه پرونده‌ها
              <ArrowLeft size={14} />
            </Link>
          </div>
          {data?.rows.length ? (
            <div className="ops-recent-cases">
              {(data.rows as CaseRecord[]).map((record) => (
                <a key={record.id} href={`/backoffice/cases?id=${record.id}`}>
                  <span className="ops-record-symbol">
                    <Files size={20} />
                  </span>
                  <div>
                    <strong>{fullName(record.customer)}</strong>
                    <small>
                      <bdi>YG-{record.case_number}</bdi> ·{" "}
                      {recordDate(record.updated_at)}
                    </small>
                  </div>
                  <Status
                    value={record.service_status}
                    labels={serviceStatuses}
                  />
                  <ChevronLeft size={15} />
                </a>
              ))}
            </div>
          ) : (
            <Empty
              title="اولین پرونده از یک مشتری شروع می‌شود"
              description="اطلاعات تماس مشتری را ثبت کنید و سپس پرونده‌اش را بسازید."
              action={
                <Button variant="outline" size="sm" onClick={onCreate}>
                  <Plus />
                  ثبت مشتری
                </Button>
              }
            />
          )}
        </Card>
        <Card className="ops-activity-card">
          <div className="bo-list-heading">
            <div>
              <h2>نبض فضای کاری</h2>
              <p>تاریخچه تغییرات ثبت‌شده تیم</p>
            </div>
            <Clock3 size={19} />
          </div>
          <Timeline events={data?.activity ?? []} />
        </Card>
      </div>
    </>
  );
}

function Metric({
  label,
  value,
  detail,
  icon,
  moneyValue = false,
}: {
  label: string;
  value?: number;
  detail: string;
  icon: React.ReactNode;
  moneyValue?: boolean;
}) {
  return (
    <Card className="ops-metric">
      <div>
        <span>{label}</span>
        <strong className={moneyValue ? "is-money" : ""}>
          {value === undefined ? "—" : money(value)}
        </strong>
        <small>{detail}</small>
      </div>
      <span className="bo-stat-icon">{icon}</span>
    </Card>
  );
}

/** Text accompanies status colors so workflow state is never communicated by color alone. */
function Status({
  value,
  labels,
}: {
  value: string;
  labels: Record<string, string>;
}) {
  return (
    <Badge
      className={`ops-status ${["completed", "approved", "resolved", "recorded"].includes(value) ? "is-green" : ["high", "needs_correction", "failed", "cancelled"].includes(value) ? "is-warm" : "is-neutral"}`}
    >
      <span className="bo-dot" />
      {labels[value] ?? value}
    </Badge>
  );
}
function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="ops-empty">
      <span>
        <Files size={27} strokeWidth={1.3} />
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

/** Each row links to its private detail view; mobile users can use the record title directly. */
function RecordTable({
  section,
  rows,
  onSelect,
}: {
  section: OperationsSection;
  rows: OperationRecord[];
  onSelect: (id: string) => void;
}) {
  const headings =
    section === "customers"
      ? ["مشتری", "شماره تماس", "ایمیل", "آخرین تغییر"]
      : section === "cases"
        ? [
            "پرونده / مشتری",
            "روند خدمت",
            "بررسی مدارک",
            "اولویت",
            "آخرین تغییر",
          ]
        : section === "payments"
          ? [
              "رسید / پرونده",
              "مبلغ (تومان)",
              "وضعیت دستی",
              "تأیید درگاه",
              "تاریخ ثبت",
            ]
          : ["درخواست / مشتری", "وضعیت", "اولویت", "کانال", "آخرین تغییر"];
  return (
    <div className="bo-table-scroll">
      <table>
        <thead>
          <tr>
            {headings.map((label) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (section === "customers") {
              const record = row as Customer;
              return (
                <tr key={record.id}>
                  <td>
                    <button
                      className="ops-record-title"
                      onClick={() => onSelect(record.id)}
                    >
                      <span className="ops-avatar">{record.first_name[0]}</span>
                      <strong>{fullName(record)}</strong>
                    </button>
                  </td>
                  <td>
                    <bdi>{record.phone}</bdi>
                  </td>
                  <td>
                    <bdi>{record.email}</bdi>
                  </td>
                  <td>{recordDate(record.updated_at)}</td>
                </tr>
              );
            }
            if (section === "cases") {
              const record = row as CaseRecord;
              return (
                <tr key={record.id}>
                  <td>
                    <button
                      className="ops-record-title"
                      onClick={() => onSelect(record.id)}
                    >
                      <span className="ops-record-symbol">
                        <Files size={17} />
                      </span>
                      <div>
                        <strong>
                          <bdi>YG-{record.case_number}</bdi>
                        </strong>
                        <small>{fullName(record.customer)}</small>
                      </div>
                    </button>
                  </td>
                  <td>
                    <Status
                      value={record.service_status}
                      labels={serviceStatuses}
                    />
                  </td>
                  <td>
                    <Status
                      value={record.review_status}
                      labels={reviewStatuses}
                    />
                  </td>
                  <td>
                    <Status value={record.priority} labels={priorities} />
                  </td>
                  <td>{recordDate(record.updated_at)}</td>
                </tr>
              );
            }
            if (section === "payments") {
              const record = row as PaymentRecord;
              return (
                <tr key={record.id}>
                  <td>
                    <button
                      className="ops-record-title"
                      onClick={() => onSelect(record.id)}
                    >
                      <span className="ops-record-symbol">
                        <WalletCards size={17} />
                      </span>
                      <div>
                        <strong>
                          <bdi>{record.reference}</bdi>
                        </strong>
                        <small>
                          {fullName(record.case?.customer)} ·{" "}
                          <bdi>YG-{record.case?.case_number}</bdi>
                        </small>
                      </div>
                    </button>
                  </td>
                  <td className="ops-amount">{money(record.amount)}</td>
                  <td>
                    <Status value={record.status} labels={paymentStatuses} />
                  </td>
                  <td>
                    <Badge className="ops-status is-neutral">ثبت دستی</Badge>
                  </td>
                  <td>{recordDate(record.created_at)}</td>
                </tr>
              );
            }
            const record = row as TicketRecord;
            return (
              <tr key={record.id}>
                <td>
                  <button
                    className="ops-record-title"
                    onClick={() => onSelect(record.id)}
                  >
                    <span className="ops-record-symbol">
                      <MessagesSquare size={17} />
                    </span>
                    <div>
                      <strong>{record.subject}</strong>
                      <small>
                        <bdi>TK-{record.ticket_number}</bdi> ·{" "}
                        {fullName(record.customer)}
                      </small>
                    </div>
                  </button>
                </td>
                <td>
                  <Status value={record.status} labels={ticketStatuses} />
                </td>
                <td>
                  <Status value={record.priority} labels={priorities} />
                </td>
                <td>{channels[record.channel]}</td>
                <td>{recordDate(record.updated_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Contact, review and accounting remain separate; a recorded receipt never claims bank verification. */
function Detail({
  section,
  data,
  onForm,
}: {
  section: OperationsSection;
  data: OperationDetail;
  onForm: (state: OperationsFormState) => void;
}) {
  const record = data.record;
  if (section === "customers") {
    const customer = record as Customer;
    return (
      <>
        <div className="ops-detail-header">
          <div className="ops-person">
            <span className="ops-avatar large">{customer.first_name[0]}</span>
            <div>
              <h2>{fullName(customer)}</h2>
              <p>عضو از {recordDate(customer.created_at)}</p>
            </div>
          </div>
          <div className="ops-detail-actions">
            <Button
              variant="outline"
              onClick={() => onForm({ entity: "customers", record: customer })}
            >
              ویرایش مشتری
            </Button>
            <Button
              onClick={() =>
                onForm({
                  entity: "cases",
                  defaults: { customer_id: customer.id },
                })
              }
            >
              <Plus />
              پرونده جدید
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                onForm({
                  entity: "support",
                  defaults: { customer_id: customer.id },
                })
              }
            >
              <MessagesSquare />
              پشتیبانی
            </Button>
          </div>
        </div>
        <div className="ops-detail-grid">
          <div>
            <Card className="ops-info-card">
              <h3>اطلاعات تماس</h3>
              <dl>
                <Info label="شماره تماس">
                  <bdi>{customer.phone}</bdi>
                </Info>
                <Info label="ایمیل">
                  <bdi>{customer.email}</bdi>
                </Info>
                <Info label="یادداشت تیم">
                  {customer.notes || "یادداشتی ثبت نشده است."}
                </Info>
              </dl>
            </Card>
            <Card className="ops-info-card">
              <h3>
                آخرین پرونده‌های مشتری <small>حداکثر ۵۰ مورد</small>
              </h3>
              <RelatedCases cases={data.cases} />
            </Card>
            <Card className="ops-info-card">
              <h3>
                پشتیبانی مشتری <small>۵۰ درخواست آخر</small>
              </h3>
              {data.tickets.length ? (
                data.tickets.map((ticket) => (
                  <a
                    className="ops-linked-row"
                    key={ticket.id}
                    href={`/backoffice/support?id=${ticket.id}`}
                  >
                    <span>{ticket.subject}</span>
                    <Status value={ticket.status} labels={ticketStatuses} />
                  </a>
                ))
              ) : (
                <p className="ops-hint">درخواست پشتیبانی ثبت نشده است.</p>
              )}
            </Card>
          </div>
          <Card className="ops-info-card">
            <h3>
              تاریخچه ارتباط و تغییرات <small>۱۰۰ رویداد آخر</small>
            </h3>
            <Timeline events={data.activity} />
          </Card>
        </div>
      </>
    );
  }
  if (section === "cases") {
    const item = record as CaseRecord;
    const net = data.financials?.net_recorded ?? 0;
    // Campaign credit is not cash; count verified web receipts independently of manual receipts.
    const discount = data.financials?.discount_amount ?? 0;
    const gateway = data.financials?.gateway_amount ?? 0;
    const balance = item.quoted_amount - discount - gateway - net;
    return (
      <>
        <div className="ops-detail-header">
          <div>
            <span className="bo-overline">{fullName(item.customer)}</span>
            <h2>
              پرونده <bdi>YG-{item.case_number}</bdi>
            </h2>
          </div>
          <div className="ops-detail-actions">
            <Button onClick={() => onForm({ entity: "cases", record: item })}>
              <FileCheck2 />
              به‌روزرسانی پرونده
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                onForm({ entity: "payments", defaults: { case_id: item.id } })
              }
            >
              <Plus />
              ثبت رسید
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                onForm({
                  entity: "support",
                  defaults: { customer_id: item.customer_id, case_id: item.id },
                })
              }
            >
              <MessagesSquare />
              پشتیبانی
            </Button>
          </div>
        </div>
        <div className="ops-case-status">
          <div>
            <span>روند خدمت</span>
            <Status value={item.service_status} labels={serviceStatuses} />
          </div>
          <div>
            <span>بررسی مدارک</span>
            <Status value={item.review_status} labels={reviewStatuses} />
          </div>
          <div>
            <span>اولویت</span>
            <Status value={item.priority} labels={priorities} />
          </div>
          <div>
            <span>پیگیری بعدی</span>
            <strong>
              {item.follow_up_on ? recordDate(item.follow_up_on) : "تعیین نشده"}
            </strong>
          </div>
        </div>
        <CaseDocuments key={item.id} caseId={item.id} />
        <div className="ops-detail-grid">
          <div>
            <Card className="ops-info-card">
              <h3>مشخصات و پیگیری</h3>
              <dl>
                <Info label="مشتری">
                  <a href={`/backoffice/customers?id=${item.customer_id}`}>
                    {fullName(item.customer)}
                    <ArrowUpLeft size={14} />
                  </a>
                </Info>
                <Info label="بسته خدمات">
                  {item.plan === "online" ? "همراهی آنلاین" : "همراهی حضوری"}
                </Info>
                <Info label="دوره">{item.cycle || "تعیین نشده"}</Info>
                <Info label="مسئول پیگیری">
                  {item.assigned_to || "تعیین نشده"}
                </Info>
                <Info label="آخرین یادداشت">
                  {item.last_note || "یادداشتی ثبت نشده است."}
                </Info>
              </dl>
              <p className="ops-hint">
                وضعیت کلی بررسی، نتیجه ثبت‌شده کارشناس است؛ هر فایل در بخش مدارک
                جداگانه بررسی می‌شود. تکمیل خدمت، تأیید ثبت رسمی DV نیست.
              </p>
            </Card>
            <Card className="ops-info-card">
              <h3>خلاصه مالی پرونده</h3>
              <dl>
                <Info label="مبلغ توافق‌شده">
                  {money(item.quoted_amount)} تومان
                </Info>
                <Info label="خالص رسیدهای دستی">{money(net)} تومان</Info>
                <Info label="تخفیف کمپین">{money(discount)} تومان</Info>
                <Info label="پرداخت تأییدشده درگاه">
                  {money(gateway)} تومان
                </Info>
                <Info
                  label={
                    balance >= 0
                      ? "مانده نسبت به مبلغ پرونده"
                      : "بستانکاری ثبت‌شده"
                  }
                >
                  {money(Math.abs(balance))} تومان
                </Info>
              </dl>
              <p className="ops-hint">
                جمع مالی شامل همه {money(data.financials?.receipt_count ?? 0)}{" "}
                سابقه است؛ فهرست زیر حداکثر ۵۰ رسید اخیر را نشان می‌دهد. تطبیق
                بانکی جداگانه انجام می‌گیرد.
              </p>
              {data.payments.map((payment) => (
                <div className="ops-linked-row" key={payment.id}>
                  <bdi>{payment.reference}</bdi>
                  <span>{money(payment.amount)} تومان</span>
                  <Status value={payment.status} labels={paymentStatuses} />
                </div>
              ))}
            </Card>
            <Card className="ops-info-card">
              <h3>پشتیبانی مرتبط</h3>
              {data.tickets.length ? (
                data.tickets.map((ticket) => (
                  <a
                    className="ops-linked-row"
                    key={ticket.id}
                    href={`/backoffice/support?id=${ticket.id}`}
                  >
                    <span>{ticket.subject}</span>
                    <Status value={ticket.status} labels={ticketStatuses} />
                  </a>
                ))
              ) : (
                <p className="ops-hint">درخواست پشتیبانی ثبت نشده است.</p>
              )}
            </Card>
          </div>
          <Card className="ops-info-card">
            <h3>
              روند پرونده <small>۱۰۰ رویداد آخر</small>
            </h3>
            <Timeline events={data.activity} />
          </Card>
        </div>
      </>
    );
  }
  if (section === "payments") {
    const payment = record as PaymentRecord;
    return (
      <Card className="ops-info-card">
        <div className="ops-detail-header">
          <h2>
            سابقه رسید <bdi>{payment.reference}</bdi>
          </h2>
          <Status value={payment.status} labels={paymentStatuses} />
        </div>
        <dl>
          <Info label="مبلغ">{money(payment.amount)} تومان</Info>
          <Info label="پرونده">
            <a href={`/backoffice/cases?id=${payment.case_id}`}>
              <bdi>YG-{payment.case?.case_number}</bdi>
              <ArrowUpLeft size={14} />
            </a>
          </Info>
          <Info label="مشتری">{fullName(payment.case?.customer)}</Info>
          <Info label="تاریخ ثبت">{recordDate(payment.created_at)}</Info>
          <Info label="منبع">ثبت دستی تیم · بدون تأیید درگاه</Info>
          <Info label="شرح">{payment.notes || "شرحی ثبت نشده است."}</Info>
        </dl>
        <p className="ops-hint">
          سوابق رسید حذف یا بازنویسی نمی‌شوند. اصلاح مالی را با یک سابقه مستقل و
          شرح مرجع آن ثبت کنید. ثبت بازپرداخت در این نما، وجهی جابه‌جا نمی‌کند.
        </p>
      </Card>
    );
  }
  const ticket = record as TicketRecord;
  return (
    <>
      <div className="ops-detail-header">
        <div>
          <span className="bo-overline">
            <bdi>TK-{ticket.ticket_number}</bdi> · {fullName(ticket.customer)}
          </span>
          <h2>{ticket.subject}</h2>
        </div>
        <div className="ops-detail-actions">
          <Button
            variant="outline"
            onClick={() => onForm({ entity: "support", record: ticket })}
          >
            تغییر وضعیت
          </Button>
          <Button
            onClick={() =>
              onForm({ entity: "notes", defaults: { ticket_id: ticket.id } })
            }
          >
            <Plus />
            یادداشت جدید
          </Button>
        </div>
      </div>
      <div className="ops-detail-grid">
        <Card className="ops-info-card">
          <h3>
            یادداشت‌ها و شرح درخواست <small>۱۰۰ مورد آخر</small>
          </h3>
          <p className="ops-hint">
            این یادداشت‌ها داخلی هستند؛ پیامی از این صفحه برای مشتری ارسال
            نمی‌شود.
          </p>
          <div className="ops-messages">
            {data.messages.map((note) => (
              <article key={note.id}>
                <header>
                  <span>یادداشت تیم</span>
                  <time dateTime={note.created_at}>
                    {recordDate(note.created_at)}
                  </time>
                </header>
                <p>{note.body}</p>
              </article>
            ))}
          </div>
        </Card>
        <div>
          <Card className="ops-info-card">
            <h3>اطلاعات رسیدگی</h3>
            <dl>
              <Info label="وضعیت">
                <Status value={ticket.status} labels={ticketStatuses} />
              </Info>
              <Info label="اولویت">
                <Status value={ticket.priority} labels={priorities} />
              </Info>
              <Info label="کانال تماس">{channels[ticket.channel]}</Info>
              <Info label="مشتری">
                <a href={`/backoffice/customers?id=${ticket.customer_id}`}>
                  {fullName(ticket.customer)}
                  <ArrowUpLeft size={14} />
                </a>
              </Info>
              {ticket.case_id ? (
                <Info label="پرونده">
                  <a href={`/backoffice/cases?id=${ticket.case_id}`}>
                    مشاهده پرونده
                    <ArrowUpLeft size={14} />
                  </a>
                </Info>
              ) : null}
            </dl>
          </Card>
          <Card className="ops-info-card">
            <h3>روند رسیدگی</h3>
            <Timeline events={data.activity} />
          </Card>
        </div>
      </div>
    </>
  );
}

function Info({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ops-info-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
function RelatedCases({ cases }: { cases: CaseRecord[] }) {
  return cases.length ? (
    <div>
      {cases.map((item) => (
        <a
          href={`/backoffice/cases?id=${item.id}`}
          className="ops-linked-row"
          key={item.id}
        >
          <bdi>YG-{item.case_number}</bdi>
          <span>{recordDate(item.created_at)}</span>
          <Status value={item.service_status} labels={serviceStatuses} />
        </a>
      ))}
    </div>
  ) : (
    <p className="ops-hint">هنوز پرونده‌ای برای این مشتری ثبت نشده است.</p>
  );
}

/** Immutable events are rendered as text; operational notes cannot inject HTML. */
function Timeline({ events }: { events: Activity[] }) {
  return events.length ? (
    <ol className="ops-timeline">
      {events.map((event) => (
        <li key={event.id}>
          <span className="ops-timeline-dot" />
          <div>
            <strong>{event.label}</strong>
            <time dateTime={event.created_at}>
              {recordDate(event.created_at)}
            </time>
            {typeof event.details.note === "string" && event.details.note ? (
              <p>{event.details.note}</p>
            ) : null}
            {typeof event.details.service_status === "string" ? (
              <span className="ops-timeline-state">
                {
                  serviceStatuses[
                    event.details.service_status as keyof typeof serviceStatuses
                  ]
                }{" "}
                ·{" "}
                {
                  reviewStatuses[
                    event.details.review_status as keyof typeof reviewStatuses
                  ]
                }
              </span>
            ) : null}
            {event.case_id ? (
              <a href={`/backoffice/cases?id=${event.case_id}`}>
                مشاهده پرونده
                <ArrowUpLeft size={12} />
              </a>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  ) : (
    <div className="ops-no-activity">
      <Clock3 size={24} />
      <p>با ثبت اولین تغییر، تاریخچه اینجا شکل می‌گیرد.</p>
    </div>
  );
}
