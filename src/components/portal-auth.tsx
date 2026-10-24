"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { customerProfile } from "@/lib/customer-verification";
import { verifyCustomer } from "./customer-verification";

/** Real email signup and explicitly local test-phone signup remain distinct identity paths. */
export function PortalAuth() {
  const router = useRouter();
  const [register, setRegister] = useState(false),
    [identifier, setIdentifier] = useState(""),
    [password, setPassword] = useState("");
  const [profile, setProfile] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [testPhone, setTestPhone] = useState(false),
    [phone, setPhone] = useState(false),
    [phoneVerified, setPhoneVerified] = useState(false),
    [method, setMethod] = useState("email"),
    [challenge, setChallenge] = useState(""),
    [code, setCode] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/portal/verification", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        if (!controller.signal.aborted) {
          setTestPhone(data.testPhone === true);
          setPhone(data.phone === true);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const normalized = register ? customerProfile(profile) : null;
      if (register && !normalized)
        throw new Error("نام، ایمیل و موبایل را بررسی کنید.");
      if (register && (method === "test_phone" || method === "mobile")) {
        if (!challenge) {
          const data = await verifyCustomer({
            action: "start",
            profile: normalized,
            channel: method,
          });
          setProfile(normalized!);
          setChallenge(data.challenge);
          return;
        }
        if (!phoneVerified) {
          await verifyCustomer({ action: "confirm", challenge, code });
          setPhoneVerified(true);
        }
      }
      const response = await fetch("/api/portal/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          register
            ? { action: "register", ...normalized, password, method }
            : { action: "login", identifier, password },
        ),
        signal: AbortSignal.timeout(30000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "ورود انجام نشد.");
      if (result.confirmationRequired) {
        setMessage("لینک تأیید را در ایمیل باز کنید.");
        setRegister(false);
        setIdentifier(normalized!.email);
        setPassword("");
      } else {
        router.push("/portal");
        router.refresh();
      }
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "ارتباط برقرار نشد.");
    } finally {
      setBusy(false);
    }
  }
  function reset() {
    setRegister(!register);
    setChallenge("");
    setPhoneVerified(false);
    setCode("");
    setPassword("");
    setMessage("");
  }
  return (
    <form className="bo-login-form" onSubmit={submit}>
      {register ? (
        <fieldset
          disabled={busy || Boolean(challenge)}
          className="portal-profile-fields"
        >
          {(
            [
              ["firstName", "نام", "given-name"],
              ["lastName", "نام خانوادگی", "family-name"],
              ["email", "ایمیل", "email"],
              ["phone", "شماره موبایل", "tel"],
            ] as const
          ).map(([key, label, autoComplete]) => (
            <div key={key}>
              <Label htmlFor={`portal-${key}`}>{label}</Label>
              <Input
                id={`portal-${key}`}
                value={profile[key]}
                type={
                  key === "email" ? "email" : key === "phone" ? "tel" : "text"
                }
                dir={["email", "phone"].includes(key) ? "ltr" : undefined}
                autoComplete={autoComplete}
                required
                maxLength={key === "email" ? 254 : key === "phone" ? 25 : 80}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
              />
            </div>
          ))}
        </fieldset>
      ) : (
        <div>
          <Label htmlFor="customer-identifier">ایمیل یا موبایل</Label>
          <Input
            id="customer-identifier"
            autoComplete="username"
            dir="ltr"
            required
            maxLength={254}
            value={identifier}
            disabled={busy}
            onChange={(event) => setIdentifier(event.target.value)}
          />
        </div>
      )}
      <div>
        <Label htmlFor="customer-password">رمز عبور</Label>
        <Input
          id="customer-password"
          type="password"
          autoComplete={register ? "new-password" : "current-password"}
          dir="ltr"
          required
          minLength={8}
          maxLength={128}
          disabled={busy || Boolean(challenge)}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {register && !challenge ? (
        <fieldset disabled={busy} className="portal-verification-method">
          <legend>روش تأیید</legend>
          <Label>
            <input
              type="radio"
              name="verification-method"
              checked={method === "email"}
              onChange={() => setMethod("email")}
            />
            ایمیل
          </Label>
          {testPhone ? (
            <Label>
              <input
                type="radio"
                name="verification-method"
                checked={method === "test_phone"}
                onChange={() => setMethod("test_phone")}
              />
              موبایل (آزمایشی)
            </Label>
          ) : null}
          {phone && (
            <Label>
              <input
                type="radio"
                name="verification-method"
                checked={method === "mobile"}
                onChange={() => setMethod("mobile")}
              />
              موبایل
            </Label>
          )}
        </fieldset>
      ) : null}
      {challenge ? (
        <div>
          {method === "test_phone" ? (
            <p>
              کد آزمایشی: <bdi>123456</bdi>
            </p>
          ) : null}
          <Label htmlFor="portal-code">کد تأیید</Label>
          <Input
            id="portal-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            maxLength={method === "mobile" ? 10 : 6}
            value={code}
            disabled={busy}
            onChange={(event) => setCode(event.target.value)}
          />
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setChallenge("");
              setPhoneVerified(false);
              setCode("");
            }}
          >
            ویرایش اطلاعات
          </Button>
          {method === "mobile" && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setMessage("");
                setFailed(false);
                try {
                  const result = await verifyCustomer({
                    action: "start",
                    profile,
                    channel: "mobile",
                  });
                  setChallenge(result.challenge);
                  setPhoneVerified(false);
                  setCode("");
                } catch (error) {
                  setFailed(true);
                  setMessage(
                    error instanceof Error ? error.message : "ارسال انجام نشد.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              ارسال دوباره
            </Button>
          )}
        </div>
      ) : null}
      {message ? (
        <p
          role={failed ? "alert" : "status"}
          className={failed ? "bo-error" : "bo-success"}
        >
          {message}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={
          busy ||
          (Boolean(challenge) &&
            !phoneVerified &&
            (method === "mobile"
              ? !/^[0-9۰-۹٠-٩]{4,10}$/.test(code)
              : code.length !== 6))
        }
      >
        {busy
          ? "در حال بررسی…"
          : register
            ? challenge
              ? "تأیید و ساخت حساب"
              : "ساخت حساب مشتری"
            : "ورود به پرتال"}
      </Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={reset}>
        {register ? "حساب دارید؟ وارد شوید" : "ساخت حساب مشتری"}
      </Button>
      {register ? (
        <p className="bo-login-hint">
          با ثبت‌نام،{" "}
          <a href="/terms" target="_blank" rel="noreferrer">
            شرایط خدمات
          </a>{" "}
          و{" "}
          <a href="/privacy" target="_blank" rel="noreferrer">
            حریم خصوصی
          </a>{" "}
          را می‌پذیرم.
        </p>
      ) : null}
    </form>
  );
}
