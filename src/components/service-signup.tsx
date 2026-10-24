"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Check,
  Monitor,
  MapPin,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Guide } from "@/components/growth/guide";
import { plans, persianNumber, type PlanId } from "@/lib/site";
import {
  validateRegistration,
  type Applicant,
  type FieldErrors,
} from "@/lib/registration";
import { couponCode, type CommerceMode, type Quote } from "@/lib/growth/model";
import { experience, followCheckout, journeyEvent } from "@/lib/growth/client";

const fields = [
  {
    name: "firstName",
    label: "نام",
    autoComplete: "given-name",
    type: "text",
    placeholder: "نام شما",
  },
  {
    name: "lastName",
    label: "نام خانوادگی",
    autoComplete: "family-name",
    type: "text",
    placeholder: "نام خانوادگی شما",
  },
  {
    name: "email",
    label: "ایمیل",
    autoComplete: "email",
    type: "email",
    placeholder: "you@example.com",
  },
  {
    name: "phone",
    label: "شماره تماس",
    autoComplete: "tel",
    type: "tel",
    placeholder: "۰۹۱۲۳۴۵۶۷۸۹",
  },
] as const;
const labels = ["انتخاب همراهی", "آشنایی کوتاه", "مرور و تصمیم"];

/** Three reversible steps keep the four-field contract; nothing is submitted until explicit confirmation. */
export function ServiceSignup({
  mode,
  paymentsEnabled = false,
}: {
  mode: CommerceMode;
  paymentsEnabled?: boolean;
}) {
  const [step, setStep] = useState(0);
  const [resume, setResume] = useState("");
  useEffect(() => {
    if (mode === "disabled") return;
    const controller = new AbortController();
    fetch("/api/experience?resume=1", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        if (typeof data.order?.id === "string") setResume(data.order.id);
      })
      .catch(() => {
        /* Recovery is optional; the primary journey remains available. */
      });
    return () => controller.abort();
  }, [mode]);
  const [plan, setPlan] = useState<PlanId>("online");
  const [applicant, setApplicant] = useState<Applicant>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [code, setCode] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const attempt = useRef("");
  const lock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) heading.current?.focus({ preventScroll: true });
    mounted.current = true;
  }, [step]);
  const total = quote?.total_amount ?? plans[plan].price;
  function move(next: number) {
    setMessage("");
    setStep(next);
    journeyEvent((["plan", "contact", "review"] as const)[next]);
  }
  function changed() {
    attempt.current = "";
    setMessage("");
  }
  async function applyCoupon() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const normalized = couponCode(code);
      if (mode === "disabled")
        throw new Error(
          "بررسی کد پس از اتصال سرویس فعال می‌شود؛ اطلاعاتی ذخیره نشده است.",
        );
      const data = await experience({
        action: "quote",
        plan,
        code: normalized,
      });
      setQuote(data.quote);
      setCode(normalized);
      attempt.current = "";
      setMessage(
        normalized
          ? "تخفیف اعمال شد؛ ظرفیت هنگام تأیید سفارش نهایی می‌شود."
          : "کد تخفیف حذف شد.",
      );
    } catch (error) {
      setQuote(null);
      setMessage(
        error instanceof Error ? error.message : "بررسی کد انجام نشد.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    if (step === 0) {
      move(1);
      return;
    }
    const id = attempt.current || crypto.randomUUID();
    const validation = validateRegistration({
      ...applicant,
      plan,
      idempotencyKey: id,
    });
    if (!validation.valid) {
      setErrors(validation.fields);
      const field = Object.keys(validation.fields)[0];
      document.getElementById(field)?.focus();
      return;
    }
    setErrors({});
    if (step === 1) {
      move(2);
      return;
    }
    if (!consent) {
      setMessage("برای ادامه، شرایط خدمات و حریم خصوصی را تأیید کنید.");
      return;
    }
    if (mode === "disabled") {
      setMessage(
        "مسیر را کامل کردید. ثبت سفارش هنوز فعال نیست؛ اطلاعات شما ارسال یا ذخیره نشده و پرداختی انجام نمی‌شود.",
      );
      return;
    }
    if (code.trim() && !quote) {
      setMessage("ابتدا کد تخفیف را بررسی کنید یا آن را پاک کنید.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setMessage("");
    attempt.current = id;
    try {
      const data = await experience({
        action: "order",
        ...validation.data,
        code,
        consent,
        expectedTotal: total,
      });
      setResume(data.order.id);
      journeyEvent("complete");
      // A payable bank order goes straight to the provider; the saved order remains recoverable on failure.
      if (
        data.order.total_amount > 0 &&
        mode !== "simulation" &&
        paymentsEnabled
      ) {
        const payment = await experience({ action: "pay", id: data.order.id });
        followCheckout(payment.next);
      } else {
        followCheckout(data.next);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ارتباط برقرار نشد.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section id="services" className="journey-widget" aria-label="شروع تعاملی">
      <div id="registration" className="journey-anchor" />
      <div className="guide-intro">
        <Guide small />
        <div>
          <span className="eyebrow">راهنمای قدم اول</span>
          <p>
            {step === 0
              ? "سلام! دوست داری چطور همراهت باشیم؟"
              : step === 1
                ? "خوش اومدی! فعلاً همین چهار مورد کافیه."
                : "عالیه! قبل از تصمیم، همه‌چیز رو مرور کن."}
          </p>
        </div>
      </div>
      <ol className="journey-progress" aria-label="مراحل درخواست">
        {labels.map((label, index) => (
          <li
            key={label}
            aria-current={step === index ? "step" : undefined}
            data-done={step > index}
          >
            <span>
              {step > index ? <Check size={14} /> : persianNumber(index + 1)}
            </span>
            {label}
          </li>
        ))}
      </ol>
      <form noValidate onSubmit={submit} aria-busy={busy}>
        <h2 ref={heading} tabIndex={-1} className="journey-question">
          {
            [
              "روش همراهی‌ات را انتخاب کن",
              "چطور با تو در ارتباط باشیم؟",
              "همه‌چیز روشن؛ انتخاب با تو",
            ][step]
          }
        </h2>
        {step === 0 && (
          <>
            <p className="journey-hint">
              اول مسیر را بشناس؛ پرداخت فقط بعد از مرور سفارش.
            </p>
            <fieldset className="journey-options" disabled={busy}>
              <legend className="sr-only">شیوه همراهی شما</legend>
              {(
                Object.entries(plans) as [PlanId, (typeof plans)[PlanId]][]
              ).map(([id, item]) => (
                <label
                  key={id}
                  className="journey-choice"
                  data-selected={plan === id}
                >
                  <input
                    type="radio"
                    name="plan"
                    value={id}
                    checked={plan === id}
                    onChange={() => {
                      setPlan(id);
                      setQuote(null);
                      changed();
                    }}
                  />
                  {id === "online" ? (
                    <Monitor size={22} />
                  ) : (
                    <MapPin size={22} />
                  )}
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {id === "online"
                        ? "پیگیری تلفنی و پیام‌رسان، از هر جا"
                        : "کمک متخصص برای بررسی و اسکن مدارک"}
                    </small>
                    <b>
                      {persianNumber(item.price)} <small>تومان / نفر</small>
                    </b>
                  </span>
                </label>
              ))}
            </fieldset>
            <details className="journey-details">
              <summary>این خدمت چه چیزهایی دارد؟</summary>
              <ul>
                {plans[plan].features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <p>
                تعرفه عادی برنامه‌ریزی‌شده:{" "}
                {persianNumber(plans[plan].regularPrice)} تومان. هزینه احتمالی
                رسمی و خدمات پس از انتخاب جداست.
              </p>
            </details>
          </>
        )}
        {step === 1 && (
          <>
            <p className="journey-hint">
              از همان ایمیلی استفاده کن که برای ورود به پرونده خواهی داشت. مدارک
              هویتی برای مرحله بعد است.
            </p>
            <div className="form-fields">
              {fields.map((field) => (
                <div className="field-group" key={field.name}>
                  <Label htmlFor={field.name}>
                    {field.label}
                    <span className="sr-only"> (الزامی)</span>
                  </Label>
                  <Input
                    {...field}
                    id={field.name}
                    value={applicant[field.name]}
                    required
                    disabled={busy}
                    maxLength={
                      field.name === "email"
                        ? 254
                        : field.name === "phone"
                          ? 25
                          : 80
                    }
                    dir={field.type === "text" ? undefined : "ltr"}
                    aria-invalid={Boolean(errors[field.name])}
                    aria-describedby={
                      errors[field.name] ? `${field.name}-error` : undefined
                    }
                    onChange={(event) => {
                      setApplicant({
                        ...applicant,
                        [field.name]: event.target.value,
                      });
                      changed();
                    }}
                  />
                  {errors[field.name] && (
                    <span id={`${field.name}-error`} className="field-error">
                      {errors[field.name]}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <div className="journey-review">
              <strong>{plans[plan].name}</strong>
              <span>
                {applicant.firstName} {applicant.lastName}
              </span>
              <bdi>{applicant.email}</bdi>
              <bdi>{applicant.phone}</bdi>
              <button type="button" onClick={() => move(1)}>
                ویرایش اطلاعات
              </button>
            </div>
            <details className="journey-details">
              <summary>کد تخفیف داری؟</summary>
              <div className="coupon-row">
                <Label className="sr-only" htmlFor="coupon">
                  کد تخفیف
                </Label>
                <Input
                  id="coupon"
                  dir="ltr"
                  maxLength={32}
                  value={code}
                  disabled={busy}
                  placeholder="CAMPAIGN"
                  onChange={(event) => {
                    setCode(event.target.value);
                    setQuote(null);
                    changed();
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={applyCoupon}
                >
                  بررسی کد
                </Button>
              </div>
            </details>
            <dl className="journey-totals">
              <div>
                <dt>هزینه خدمات</dt>
                <dd>{persianNumber(plans[plan].price)} تومان</dd>
              </div>
              {quote && quote.discount_amount > 0 && (
                <div>
                  <dt>تخفیف کمپین</dt>
                  <dd>−{persianNumber(quote.discount_amount)} تومان</dd>
                </div>
              )}
              <div className="total">
                <dt>مبلغ نهایی</dt>
                <dd>
                  {total === 0
                    ? "بدون نیاز به پرداخت"
                    : `${persianNumber(total)} تومان`}
                </dd>
              </div>
            </dl>
            <label className="journey-consent">
              <input
                type="checkbox"
                checked={consent}
                disabled={busy}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <span>
                <a href="/terms" target="_blank" rel="noreferrer">
                  شرایط خدمات
                </a>{" "}
                و{" "}
                <a href="/privacy" target="_blank" rel="noreferrer">
                  حریم خصوصی
                </a>{" "}
                را می‌پذیرم. این درخواست، ثبت رسمی DV نیست.
              </span>
            </label>
          </>
        )}
        <div role="status" className="journey-message">
          {message}
        </div>
        <div className="journey-actions">
          {step > 0 && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => move(step - 1)}
              aria-label="مرحله قبل"
            >
              <ArrowRight />
            </Button>
          )}
          <Button className="journey-next" type="submit" disabled={busy}>
            {busy
              ? "در حال بررسی…"
              : step === 0
                ? "مسیر من را بساز"
                : step === 1
                  ? "دیدن خلاصه و قیمت"
                  : mode === "disabled"
                    ? "بررسی مسیر درخواست"
                    : total === 0
                      ? "تأیید سفارش بدون پرداخت"
                      : paymentsEnabled || mode === "simulation"
                        ? "تأیید و ادامه به پرداخت"
                        : "ثبت سفارش و دریافت کد پیگیری"}
            <ArrowLeft size={18} />
          </Button>
        </div>
        <p className="journey-footnote">
          <ShieldCheck size={14} />
          {mode === "disabled"
            ? "پیش‌نمایش مسیر؛ دریافت سفارش هنوز فعال نیست."
            : mode !== "live"
              ? "حالت آزمایشی؛ وجه و پرونده واقعی ایجاد نمی‌شود."
              : paymentsEnabled
                ? "پرداخت فقط برای خدمات شرکت؛ بدون تضمین انتخاب."
                : "سفارش شما ذخیره می‌شود؛ پرداخت بانکی فعلاً غیرفعال است."}
        </p>
      </form>
      {resume && (
        <Link className="journey-resume" href={`/checkout/${resume}`}>
          پیگیری آخرین درخواست این مرورگر ←
        </Link>
      )}
      <noscript>
        <p>
          برای استفاده از فرم تعاملی JavaScript را فعال کنید. توضیحات خدمات و
          شرایط در همین صفحه قابل مطالعه است.
        </p>
      </noscript>
    </section>
  );
}
