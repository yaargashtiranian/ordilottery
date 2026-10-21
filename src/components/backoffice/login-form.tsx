"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, LockKeyhole, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Passwords are sent once to the same-origin API and never saved in browser storage. */
export function LoginForm({ portal = false }: { portal?: boolean }) {
  const router = useRouter();
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setFailed(false);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(
        portal ? "/api/portal/session" : "/api/backoffice/session",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: form.get("email"),
            password: form.get("password"),
            action: register ? "register" : "login",
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "ورود انجام نشد.");
      if (result.confirmationRequired) {
        setMessage(
          "ایمیل تأیید حساب را باز کنید؛ سپس با رمز انتخابی خود وارد شوید.",
        );
        setRegister(false);
      } else {
        router.push(portal ? "/portal" : "/backoffice");
        router.refresh();
      }
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "ارتباط برقرار نشد.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="bo-login-form">
      <div>
        <Label htmlFor="admin-email">
          {portal ? "ایمیل ثبت‌شده در پرونده" : "ایمیل مدیریت"}
        </Label>
        <div className="bo-input-icon">
          <Mail size={17} />
          <Input
            id="admin-email"
            name="email"
            type="email"
            dir="ltr"
            autoComplete="username"
            placeholder="you@example.com"
            required
            maxLength={254}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="admin-password">رمز عبور</Label>
        <div className="bo-input-icon">
          <LockKeyhole size={17} />
          <Input
            id="admin-password"
            name="password"
            type="password"
            dir="ltr"
            autoComplete={register ? "new-password" : "current-password"}
            required
            minLength={8}
            maxLength={128}
          />
        </div>
      </div>
      <p
        className={failed ? "bo-error" : "bo-success"}
        role={failed ? "alert" : "status"}
        aria-live="polite"
      >
        {message}
      </p>
      <Button size="lg" disabled={busy} className="w-full" type="submit">
        {busy ? <Loader2 className="animate-spin" /> : null}
        {register
          ? portal
            ? "ساخت حساب مشتری"
            : "ساخت حساب مدیر"
          : portal
            ? "ورود به پرونده‌ها"
            : "ورود به بک‌آفیس"}
        <ArrowLeft />
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={busy}
        onClick={() => {
          setRegister(!register);
          setMessage("");
        }}
        className="w-full"
      >
        {register
          ? "حساب دارید؟ وارد شوید"
          : portal
            ? "اولین ورود؟ ساخت حساب مشتری"
            : "اولین ورود؟ ساخت حساب مدیر"}
      </Button>
      <p className="bo-login-hint">
        {portal
          ? "از همان ایمیل پرونده استفاده کنید؛ تأیید ایمیل برای مشاهده مدارک لازم است."
          : "ساخت حساب فقط برای ایمیل مدیر تعیین‌شده امکان‌پذیر است."}
      </p>
    </form>
  );
}
