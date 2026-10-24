"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Applicant } from "@/lib/registration";

/** Passwords and proof codes travel only to same-origin server endpoints; nothing enters browser storage. */
export async function verifyCustomer(input: Record<string, unknown>) {
  const response = await fetch("/api/portal/verification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "تأیید انجام نشد.");
  return data;
}

/** A separate contact check keeps the service selection reversible and the original four fields intact. */
export function CustomerVerification({
  profile,
  onVerified,
  onBack,
}: {
  profile: Applicant;
  onVerified: () => void;
  onBack: () => void;
}) {
  const [testPhone, setTestPhone] = useState(false),
    [phone, setPhone] = useState(false),
    [challenge, setChallenge] = useState(""),
    [channel, setChannel] = useState("");
  const [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const codeInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/portal/verification", {
      signal: controller.signal,
      cache: "no-store",
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
  useEffect(() => {
    if (channel === "test_phone" || channel === "mobile")
      codeInput.current?.focus();
  }, [channel]);
  async function start(next: string) {
    setBusy(true);
    setError("");
    try {
      const data = await verifyCustomer({
        action: "start",
        profile,
        channel: next,
      });
      setChallenge(data.challenge);
      setChannel(next);
      setCode("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "ارتباط برقرار نشد.");
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      if (channel === "test_phone" || channel === "mobile")
        await verifyCustomer({ action: "confirm", challenge, code });
      else {
        const response = await fetch("/api/portal/verification", {
          cache: "no-store",
        });
        const data = await response.json();
        if (
          !response.ok ||
          !data.check?.verified ||
          data.check.profile.email !== profile.email.toLowerCase() ||
          data.check.profile.phone !== profile.phone
        )
          throw new Error("ایمیل هنوز تأیید نشده است.");
      }
      onVerified();
    } catch (error) {
      setError(error instanceof Error ? error.message : "تأیید انجام نشد.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="customer-verification">
      <h3>تأیید اطلاعات تماس</h3>
      {!challenge ? (
        <>
          <p>
            <bdi>{profile.email}</bdi>
            <br />
            <bdi>{profile.phone}</bdi>
          </p>
          <div className="journey-actions">
            <Button
              type="button"
              disabled={busy}
              onClick={() => void start("email")}
            >
              تأیید با ایمیل
            </Button>
            {testPhone ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void start("test_phone")}
              >
                تأیید موبایل (آزمایشی)
              </Button>
            ) : null}
            {phone && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void start("mobile")}
              >
                تأیید با پیامک
              </Button>
            )}
          </div>
        </>
      ) : channel === "test_phone" || channel === "mobile" ? (
        <>
          {channel === "test_phone" ? (
            <p>
              کد آزمایشی: <bdi>123456</bdi>
            </p>
          ) : null}
          <Label htmlFor="customer-check-code">کد تأیید</Label>
          <Input
            ref={codeInput}
            id="customer-check-code"
            autoComplete="one-time-code"
            inputMode="numeric"
            dir="ltr"
            maxLength={channel === "mobile" ? 10 : 6}
            value={code}
            disabled={busy}
            onChange={(event) => setCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void confirm();
              }
            }}
          />
          <Button
            type="button"
            disabled={
              busy ||
              (channel === "mobile"
                ? !/^[0-9۰-۹٠-٩]{4,10}$/.test(code)
                : code.length !== 6)
            }
            onClick={() => void confirm()}
          >
            تأیید و ادامه
          </Button>
          {channel === "mobile" && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void start("mobile")}
            >
              ارسال دوباره
            </Button>
          )}
        </>
      ) : (
        <>
          <p>لینک تأیید را در ایمیل باز کنید.</p>
          <Button type="button" disabled={busy} onClick={() => void confirm()}>
            تأیید کردم
          </Button>
        </>
      )}
      {error ? (
        <p role="alert" className="field-error">
          {error}
        </p>
      ) : null}
      <Button type="button" variant="ghost" disabled={busy} onClick={onBack}>
        ویرایش اطلاعات
      </Button>
      <p className="chat-disclosure">
        <a href="/privacy" target="_blank" rel="noreferrer">
          حریم خصوصی
        </a>
      </p>
    </div>
  );
}
