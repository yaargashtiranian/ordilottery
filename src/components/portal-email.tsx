"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
/** Upgrading a mock account still requires an actual email link controlled by Supabase Auth. */
export function PortalEmail({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch("/api/portal/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage("لینک تأیید را در ایمیل باز کنید.");
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "ارسال انجام نشد.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="bo-login-form portal-email-form" onSubmit={submit}>
      <Label htmlFor="portal-confirm-email">ایمیل پرونده</Label>
      <Input
        id="portal-confirm-email"
        type="email"
        dir="ltr"
        value={email}
        required
        maxLength={254}
        disabled={busy}
        onChange={(event) => setEmail(event.target.value)}
      />
      <Button disabled={busy} type="submit">
        تأیید ایمیل
      </Button>
      {message ? <p role={failed ? "alert" : "status"}>{message}</p> : null}
    </form>
  );
}
