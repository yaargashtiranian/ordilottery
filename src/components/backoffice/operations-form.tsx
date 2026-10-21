"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, Plus, Save } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  channels,
  fullName,
  priorities,
  reviewStatuses,
  serviceStatuses,
  paymentStatuses,
  ticketStatuses,
  type OperationRecord,
  type Customer,
  type CaseRecord,
} from "@/lib/operations-model";

export type OperationsFormState = {
  entity: "customers" | "cases" | "payments" | "support" | "notes";
  record?: OperationRecord;
  defaults?: Record<string, string>;
};
type Field = {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  max?: number;
  options?: Record<string, string>;
  lookup?: "customers" | "cases";
};

/** Expose only server-supported fields; receipts never offer gateway verification. */
function fieldsFor(
  entity: OperationsFormState["entity"],
  edit: boolean,
): Field[] {
  if (entity === "customers")
    return [
      { key: "firstName", label: "نام", required: true, max: 80 },
      { key: "lastName", label: "نام خانوادگی", required: true, max: 80 },
      { key: "email", label: "ایمیل", type: "email", required: true, max: 254 },
      {
        key: "phone",
        label: "شماره موبایل",
        type: "tel",
        required: true,
        max: 24,
      },
      { key: "notes", label: "یادداشت تیم", type: "textarea", max: 2000 },
    ];
  if (entity === "cases")
    return edit
      ? [
          {
            key: "service_status",
            label: "روند انجام خدمت",
            options: serviceStatuses,
          },
          {
            key: "review_status",
            label: "وضعیت بررسی مدارک",
            options: reviewStatuses,
          },
          { key: "priority", label: "اولویت", options: priorities },
          { key: "assigned_to", label: "مسئول پیگیری", max: 80 },
          { key: "follow_up_on", label: "تاریخ پیگیری (میلادی)", type: "date" },
          {
            key: "note",
            label: "شرح تغییر برای تاریخچه",
            type: "textarea",
            required: true,
            max: 2000,
          },
        ]
      : [
          {
            key: "customer_id",
            label: "مشتری",
            lookup: "customers",
            required: true,
          },
          {
            key: "plan",
            label: "بسته خدمات",
            options: { online: "همراهی آنلاین", inperson: "همراهی حضوری" },
          },
          { key: "cycle", label: "دوره پرونده (اختیاری)", max: 30 },
          {
            key: "note",
            label: "یادداشت آغاز پرونده",
            type: "textarea",
            max: 2000,
          },
        ];
  if (entity === "payments")
    return [
      { key: "case_id", label: "پرونده", lookup: "cases", required: true },
      { key: "amount", label: "مبلغ به تومان", required: true, max: 20 },
      {
        key: "reference",
        label: "شناسه رسید / مرجع پرداخت",
        required: true,
        max: 100,
      },
      { key: "status", label: "وضعیت ثبت دستی", options: paymentStatuses },
      { key: "notes", label: "شرح و روش دریافت", type: "textarea", max: 2000 },
    ];
  if (entity === "support")
    return edit
      ? [
          { key: "status", label: "وضعیت رسیدگی", options: ticketStatuses },
          { key: "priority", label: "اولویت", options: priorities },
        ]
      : [
          {
            key: "customer_id",
            label: "مشتری",
            lookup: "customers",
            required: true,
          },
          { key: "case_id", label: "پرونده مرتبط (اختیاری)", lookup: "cases" },
          { key: "subject", label: "موضوع درخواست", required: true, max: 160 },
          { key: "channel", label: "کانال تماس ثبت‌شده", options: channels },
          { key: "priority", label: "اولویت", options: priorities },
          {
            key: "body",
            label: "شرح درخواست",
            type: "textarea",
            required: true,
            max: 4000,
          },
        ];
  return [
    {
      key: "body",
      label: "یادداشت داخلی پشتیبانی",
      type: "textarea",
      required: true,
      max: 4000,
    },
  ];
}

/** Search private API results instead of downloading every customer's contact information. */
function RecordLookup({
  field,
  value,
  onChange,
  customerId,
}: {
  field: Field;
  value: string;
  onChange: (value: string) => void;
  customerId?: string;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<{ id: string; label: string }[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      setError("");
      try {
        const params = new URLSearchParams({
          q: query,
          ...(customerId && field.lookup === "cases"
            ? { customer_id: customerId }
            : {}),
        });
        const response = await fetch(
          `/api/backoffice/operations/${field.lookup}?${params}`,
          { signal: controller.signal },
        );
        const result = await response.json();
        if (!response.ok) throw new Error();
        setOptions(
          result.rows.map((record: Customer | CaseRecord) => ({
            id: record.id,
            label:
              field.lookup === "customers"
                ? fullName(record as Customer)
                : `YG-${(record as CaseRecord).case_number} · ${fullName((record as CaseRecord).customer)}`,
          })),
        );
      } catch {
        if (!controller.signal.aborted)
          setError("دریافت گزینه‌ها انجام نشد؛ دوباره جست‌وجو کنید.");
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, field.lookup, customerId]);
  return (
    <div className="ops-lookup">
      <Input
        aria-label={`جست‌وجوی ${field.label}`}
        placeholder="جست‌وجو بر اساس نام یا کد…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <select
        id={`ops-${field.key}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={field.required}
      >
        <option value="">{busy ? "در حال دریافت…" : "انتخاب کنید"}</option>
        {value && !options.some((item) => item.id === value) ? (
          <option value={value}>رکورد مرتبط انتخاب‌شده</option>
        ) : null}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <span role="alert" className="bo-error">
          {error}
        </span>
      ) : (
        <small>حداکثر ۲۰ نتیجه؛ برای یافتن رکورد دیگر جست‌وجو کنید.</small>
      )}
    </div>
  );
}

/** Preserve form values and retry IDs after failure; success requires a server acknowledgement. */
export function OperationsForm({
  state,
  onClose,
  onSaved,
}: {
  state: OperationsFormState;
  onClose: () => void;
  onSaved: (entity: string, id: string) => void;
}) {
  const edit = !!state.record;
  const record = state.record as
    (OperationRecord & Partial<Customer> & Record<string, unknown>) | undefined;
  const fields = fieldsFor(state.entity, edit);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((field) => [
        field.key,
        String(
          state.defaults?.[field.key] ??
            (field.key === "firstName"
              ? record?.first_name
              : field.key === "lastName"
                ? record?.last_name
                : field.key === "note"
                  ? ""
                  : record?.[field.key]) ??
            (field.options
              ? Object.keys(field.options)[field.key === "priority" ? 1 : 0]
              : ""),
        ),
      ]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const retryId = useRef<string | null>(null);
  const labels = {
    customers: "مشتری",
    cases: "پرونده",
    payments: "رسید پرداخت",
    support: "درخواست پشتیبانی",
    notes: "یادداشت",
  };
  function close() {
    if (
      !busy &&
      (!dirty || window.confirm("اطلاعات فرم ذخیره نشده است. فرم بسته شود؟"))
    )
      onClose();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    retryId.current ??= crypto.randomUUID();
    try {
      const response = await fetch(
        `/api/backoffice/operations/${state.entity}${edit ? `/${record!.id}` : ""}`,
        {
          method: edit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...values,
            ...(state.defaults?.ticket_id
              ? { ticket_id: state.defaults.ticket_id }
              : {}),
            ...(edit
              ? { revision: record!.revision }
              : { id: retryId.current }),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "ذخیره انجام نشد.");
      setDirty(false);
      onSaved(state.entity, result.record.id);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "ارتباط برقرار نشد؛ اطلاعات فرم حفظ شده است.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={
        state.entity === "notes"
          ? "ثبت یادداشت داخلی"
          : `${edit ? "ویرایش" : "ثبت"} ${labels[state.entity]}`
      }
      description={
        state.entity === "payments"
          ? "این ثبت، سابقه دستی است و تأیید بانکی یا اجرای بازپرداخت نیست."
          : state.entity === "notes"
            ? "یادداشت برای تیم ثبت می‌شود؛ پیامی به مشتری ارسال نخواهد شد."
            : "اطلاعات پس از ذخیره در فضای خصوصی تیم در دسترس خواهد بود."
      }
    >
      <form onSubmit={submit} className="ops-form">
        <fieldset disabled={busy}>
          {fields.map((field) => (
            <div
              className={`ops-form-field ${field.type === "textarea" || field.lookup ? "wide" : ""}`}
              key={field.key}
            >
              <Label htmlFor={`ops-${field.key}`}>
                {field.label}
                {field.required ? <span aria-hidden="true"> *</span> : null}
              </Label>
              {field.lookup ? (
                <RecordLookup
                  field={field}
                  value={values[field.key]}
                  customerId={
                    state.entity === "support" ? values.customer_id : undefined
                  }
                  onChange={(value) => {
                    setDirty(true);
                    setValues((previous) => ({
                      ...previous,
                      [field.key]: value,
                      ...(field.key === "customer_id" ? { case_id: "" } : {}),
                    }));
                  }}
                />
              ) : field.options ? (
                <select
                  id={`ops-${field.key}`}
                  value={values[field.key]}
                  onChange={(event) => {
                    setDirty(true);
                    setValues((previous) => ({
                      ...previous,
                      [field.key]: event.target.value,
                    }));
                  }}
                >
                  {Object.entries(field.options).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : field.type === "textarea" ? (
                <Textarea
                  id={`ops-${field.key}`}
                  value={values[field.key]}
                  required={field.required}
                  maxLength={field.max}
                  rows={4}
                  onChange={(event) => {
                    setDirty(true);
                    setValues((previous) => ({
                      ...previous,
                      [field.key]: event.target.value,
                    }));
                  }}
                />
              ) : (
                <Input
                  id={`ops-${field.key}`}
                  type={field.type || "text"}
                  dir={
                    ["email", "tel", "date"].includes(field.type ?? "")
                      ? "ltr"
                      : undefined
                  }
                  value={values[field.key]}
                  maxLength={field.max}
                  required={field.required}
                  onChange={(event) => {
                    setDirty(true);
                    setValues((previous) => ({
                      ...previous,
                      [field.key]: event.target.value,
                    }));
                  }}
                />
              )}
            </div>
          ))}
        </fieldset>
        {error ? (
          <p role="alert" className="bo-error-banner">
            {error}
          </p>
        ) : null}
        <footer>
          <Button
            type="button"
            variant="outline"
            onClick={close}
            disabled={busy}
          >
            انصراف
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? (
              <Loader2 className="animate-spin" />
            ) : edit ? (
              <Save />
            ) : (
              <Plus />
            )}
            ذخیره {labels[state.entity]}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}
