"use client";

import { useRef, useState } from "react";
import {
  ArrowUpLeft,
  Check,
  Monitor,
  MapPin,
  ShieldCheck,
  MessageCircle,
  LoaderCircle,
  LockKeyhole,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { plans, persianNumber, type PlanId } from "@/lib/site";
import {
  validateRegistration,
  type Applicant,
  type FieldErrors,
} from "@/lib/registration";

/** Only contact details precede payment; identity documents belong to a later flow. */
const fields = [
  {
    name: "firstName",
    label: "نام",
    placeholder: "نام شما",
    autoComplete: "given-name",
    type: "text",
  },
  {
    name: "lastName",
    label: "نام خانوادگی",
    placeholder: "نام خانوادگی شما",
    autoComplete: "family-name",
    type: "text",
  },
  {
    name: "email",
    label: "ایمیل",
    placeholder: "you@example.com",
    autoComplete: "email",
    type: "email",
  },
  {
    name: "phone",
    label: "شماره تماس",
    placeholder: "۰۹۱۲۳۴۵۶۷۸۹",
    autoComplete: "tel",
    type: "tel",
  },
] as const;

/** Plan selection and four contact fields are the only client-side application state. */
export function ServiceSignup({
  checkoutEnabled,
}: {
  checkoutEnabled: boolean;
}) {
  const [plan, setPlan] = useState<PlanId>("online");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const idempotencyKey = useRef<string | null>(null);
  const submitting = useRef(false);

  /** Changing actual order input starts a new attempt; retries preserve the same key. */
  function resetAttempt() {
    idempotencyKey.current = null;
    setErrors({});
    setResult(null);
  }

  /** Validate locally; direct checkout stays disabled until its server integration is verified. */
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const data = new FormData(event.currentTarget);
    idempotencyKey.current ??= crypto.randomUUID();
    const validation = validateRegistration({
      ...Object.fromEntries(data),
      plan,
      idempotencyKey: idempotencyKey.current,
    });
    setResult(null);
    if (!validation.valid) {
      setErrors(validation.fields);
      const invalid = Object.keys(validation.fields)[0];
      if (invalid)
        form.current
          ?.querySelector<HTMLInputElement>(`[name="${invalid}"]`)
          ?.focus();
      else setResult({ message: validation.message, error: true });
      return;
    }
    setErrors({});
    if (!checkoutEnabled) {
      setResult({
        message:
          "اطلاعات از نظر ساختار معتبر است. دریافت درخواست هنوز فعال نشده؛ اطلاعات شما ارسال یا ذخیره نشده و پرداختی انجام نمی‌شود.",
        error: false,
      });
      return;
    }
    submitting.current = true;
    setPending(true);
    try {
      const response = await fetch("/api/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.data),
        signal: AbortSignal.timeout(15_000),
      });
      const body = await response.json();
      if (!response.ok) {
        setErrors(body.fields ?? {});
        setResult({
          message:
            typeof body.message === "string"
              ? body.message
              : "ثبت درخواست انجام نشد. دوباره تلاش کنید.",
          error: true,
        });
        return;
      }
      // The server has already restricted this URL to configured checkout origins.
      if (
        typeof body.checkoutUrl !== "string" ||
        !body.checkoutUrl.startsWith("https://")
      )
        throw new Error("Missing checkout URL");
      window.location.assign(body.checkoutUrl);
    } catch {
      setResult({
        message:
          "ارتباط کامل نشد. لطفاً با همین فرم دوباره تلاش کنید؛ این پیام تأیید ثبت درخواست نیست.",
        error: true,
      });
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <section
      id="services"
      className="services-section section"
      aria-labelledby="services-title"
    >
      <div className="shell">
        <div className="center-heading" data-reveal>
          <span className="eyebrow">
            <span className="section-number">۰۴</span> دو شیوه، یک همراهی
          </span>
          <h2 id="services-title">روشی که با زندگی شما جور است.</h2>
          <p>
            آنلاین یا حضوری؛ در هر دو مسیر، بررسی دقیق و همراهی متخصص را دارید.
          </p>
        </div>
        <div className="pricing-grid">
          {(Object.entries(plans) as [PlanId, (typeof plans)[PlanId]][]).map(
            ([id, item]) => (
              <article
                className={`plan-card ${id === "online" ? "featured" : ""}`}
                key={id}
                data-reveal
              >
                <div className="plan-top">
                  <span className="plan-icon">
                    {id === "online" ? (
                      <Monitor size={23} strokeWidth={1.4} />
                    ) : (
                      <MapPin size={23} strokeWidth={1.4} />
                    )}
                  </span>
                  <span className="plan-badge">تعرفه پیش‌ثبت‌نام</span>
                </div>
                <h3>{item.name}</h3>
                <p className="plan-description">{item.description}</p>
                <div className="regular-price">
                  <span>تعرفه عادی برنامه‌ریزی‌شده:</span>
                  <span>{persianNumber(item.regularPrice)} تومان</span>
                </div>
                <div className="price">
                  <strong>{persianNumber(item.price)}</strong>
                  <small>تومان / هر نفر</small>
                </div>
                <p className="offer-label">تعرفه پیشنهادی پیش‌ثبت‌نام خدمات</p>
                <ul className="plan-features">
                  {item.features.map((feature) => (
                    <li key={feature}>
                      <Check aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="plan-button"
                  variant={id === "online" ? "default" : "outline"}
                  asChild
                >
                  <a
                    href="#registration"
                    onClick={() => {
                      setPlan(id);
                      resetAttempt();
                    }}
                  >
                    انتخاب {item.name} <ArrowUpLeft aria-hidden="true" />
                  </a>
                </Button>
              </article>
            ),
          )}
        </div>
        <p className="pricing-note">
          مبالغ مربوط به خدمات شرکت هستند. هزینه احتمالی رسمی و خدمات پس از
          انتخاب شدن جداست. عکاسی با توافق جداگانه هماهنگ می‌شود. شرایط نهایی
          پیش از فعال‌شدن پرداخت اعلام خواهد شد.
        </p>

        {/* The preview explicitly avoids collecting data while integrations are unavailable. */}
        <div id="registration" className="registration">
          <div className="registration-intro" data-reveal>
            <span className="eyebrow">اولین قدم شما</span>
            <h2>بیایید آشنا شویم.</h2>
            <p>
              برای شروع، همین چهار مورد کافی است. اطلاعات تکمیلی را بعد از
              پرداخت تأییدشده و با راهنمایی تیم دریافت می‌کنیم.
            </p>
            <div className="registration-points">
              <span>
                <ShieldCheck /> اطلاعات اولیه محدود
              </span>
              <span>
                <MessageCircle /> پیگیری تلفنی و پیام‌رسان
              </span>
              <span>
                <LockKeyhole /> مدارک هویتی در مرحله بعد
              </span>
            </div>
          </div>
          <form
            ref={form}
            className="form-panel"
            onSubmit={submit}
            onChange={resetAttempt}
            noValidate
            aria-labelledby="form-title"
            aria-busy={pending}
          >
            <div className="form-heading">
              <h3 id="form-title">اطلاعات اولیه شما</h3>
              <span>
                <span className="form-step">۱</span> آشنایی و شروع
              </span>
            </div>
            {!checkoutEnabled && (
              <p className="form-preview-note">
                این فرم فعلاً برای بررسی مسیر است؛ ثبت درخواست و پرداخت فعال
                نیست و اطلاعات شما ارسال یا ذخیره نمی‌شود.
              </p>
            )}
            <fieldset className="plan-selector" disabled={pending}>
              <legend>شیوه همراهی شما</legend>
              {(
                Object.entries(plans) as [PlanId, (typeof plans)[PlanId]][]
              ).map(([id, item]) => (
                <label key={id}>
                  <input
                    type="radio"
                    name="selectedPlan"
                    value={id}
                    checked={plan === id}
                    onChange={() => setPlan(id)}
                  />
                  {item.name}
                </label>
              ))}
            </fieldset>
            <div className="form-fields">
              {fields.map((field) => (
                <div className="field-group" key={field.name}>
                  <Label htmlFor={field.name}>
                    {field.label}
                    <span className="sr-only"> (الزامی)</span>
                  </Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type={field.type}
                    autoComplete={field.autoComplete}
                    placeholder={field.placeholder}
                    required
                    disabled={pending}
                    maxLength={
                      field.name === "email"
                        ? 254
                        : field.name === "phone"
                          ? 25
                          : 80
                    }
                    dir={
                      field.type === "email" || field.type === "tel"
                        ? "ltr"
                        : undefined
                    }
                    inputMode={
                      field.type === "tel"
                        ? "tel"
                        : field.type === "email"
                          ? "email"
                          : "text"
                    }
                    aria-invalid={Boolean(
                      errors[field.name as keyof Applicant],
                    )}
                    aria-describedby={
                      errors[field.name] ? `${field.name}-error` : undefined
                    }
                  />
                  {errors[field.name] && (
                    <span id={`${field.name}-error`} className="field-error">
                      {errors[field.name]}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="form-total">
              <span>تعرفه خدمت انتخاب‌شده</span>
              <strong>
                {persianNumber(plans[plan].price)} <small>تومان</small>
              </strong>
            </div>
            <Button type="submit" className="submit-button" disabled={pending}>
              {pending ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" />{" "}
                  در حال ارتباط…
                </>
              ) : (
                <>
                  {checkoutEnabled
                    ? "ادامه و پرداخت هزینه خدمات"
                    : "بررسی اطلاعات فرم"}
                  <ArrowUpLeft aria-hidden="true" />
                </>
              )}
            </Button>
            <p className="form-policy">
              قبل از ادامه، <a href="/terms">شرایط خدمات</a> و{" "}
              <a href="/privacy">حریم خصوصی</a> را بخوانید. درخواست خدمات، به
              معنی ثبت در سامانه رسمی DV نیست.
            </p>
            <div aria-live="polite" aria-atomic="true">
              {result && (
                <p className="form-result" data-error={result.error}>
                  {result.message}
                </p>
              )}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
