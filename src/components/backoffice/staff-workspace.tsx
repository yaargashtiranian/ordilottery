"use client";
import { useCallback, useState, type FormEvent } from "react";
import { BackofficeShell } from "./shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  normalizeStaffPermissions,
  staffSections,
  type StaffAccess,
  type StaffSection,
} from "@/lib/backoffice-permissions";

type Member = StaffAccess & {
  email: string;
  display_name: string;
  revision: number;
};
type Log = { id: number; email: string; created_at: string };
const blank = {
  email: "",
  display_name: "",
  enabled: true,
  permissions: [] as string[],
  is_owner: false,
  revision: 0,
};

/** Register an email before first sign-up; password creation and confirmation belong to the account holder. */
export function StaffWorkspace({
  email,
  access,
  initialMembers,
  initialLog,
  initialError,
}: {
  email: string;
  access: StaffAccess;
  initialMembers: Member[];
  initialLog: Log[];
  initialError: string;
}) {
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [log, setLog] = useState<Log[]>(initialLog);
  const [form, setForm] = useState<Member>(blank);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(initialError);
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/backoffice/users", { signal });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setMembers(result.members);
    setLog(result.log);
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/backoffice/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          name: form.display_name,
          enabled: form.enabled,
          permissions: form.permissions,
          revision: form.revision,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setForm(blank);
      setMessage("کاربر ذخیره شد.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ذخیره انجام نشد.");
    } finally {
      setBusy(false);
    }
  }
  function toggle(section: StaffSection, checked: boolean) {
    const next = checked
      ? [...form.permissions, section]
      : form.permissions.filter((p) => p !== section);
    setForm({ ...form, permissions: normalizeStaffPermissions(next) ?? [] });
  }
  return (
    <BackofficeShell
      email={email}
      access={access}
      title="کاربران و دسترسی‌ها"
      active="users"
    >
      <div className="ops-workspace staff-workspace">
        <div className="ops-page-heading">
          <h1>کاربران و دسترسی‌ها</h1>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => load().catch((e) => setError(e.message))}
          >
            تازه‌سازی
          </Button>
        </div>
        {error && (
          <p className="bo-error" role="alert">
            {error}
          </p>
        )}
        <p className="bo-success" role="status">
          {message}
        </p>
        <div className="staff-grid">
          <Card className="ops-info-card">
            <h2>اعضای تیم</h2>
            {members.map((member) => (
              <div className="staff-member" key={member.email}>
                <div>
                  <strong>{member.display_name || member.email}</strong>
                  <small dir="ltr">{member.email}</small>
                  <span>
                    {member.is_owner
                      ? "مالک"
                      : member.enabled
                        ? "فعال"
                        : "غیرفعال"}
                  </span>
                  <p>
                    {member.is_owner
                      ? "همه بخش‌ها"
                      : member.permissions
                          .map((p) => staffSections[p as StaffSection])
                          .join("، ")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={busy || member.is_owner || member.email === email}
                  onClick={() => {
                    setForm(member);
                    setError("");
                    setMessage("");
                  }}
                >
                  ویرایش
                </Button>
              </div>
            ))}
          </Card>
          <Card className="ops-info-card">
            <form onSubmit={save} className="staff-form">
              <h2>{form.revision ? "ویرایش کاربر" : "افزودن کاربر"}</h2>
              <Label htmlFor="staff-name">نام و نام خانوادگی</Label>
              <Input
                id="staff-name"
                required
                minLength={2}
                maxLength={100}
                value={form.display_name}
                disabled={busy}
                onChange={(e) =>
                  setForm({ ...form, display_name: e.target.value })
                }
              />
              <Label htmlFor="staff-email">ایمیل</Label>
              <Input
                id="staff-email"
                type="email"
                dir="ltr"
                required
                maxLength={254}
                value={form.email}
                disabled={busy || form.revision > 0}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <fieldset disabled={busy}>
                <legend>بخش‌های مجاز</legend>
                <div className="staff-permissions">
                  {Object.entries(staffSections).map(([key, label]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={form.permissions.includes(key)}
                        onChange={(e) =>
                          toggle(key as StaffSection, e.target.checked)
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <small>
                بخش‌های وابسته خودکار انتخاب می‌شوند. دسترسی هر بخش شامل مشاهده
                و مدیریت است.
              </small>
              {form.permissions.includes("users") && (
                <small>
                  مدیریت کاربران امکان واگذاری همهٔ دسترسی‌ها را می‌دهد.
                </small>
              )}
              <label className="staff-check">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  disabled={busy}
                  onChange={(e) =>
                    setForm({ ...form, enabled: e.target.checked })
                  }
                />
                حساب فعال
              </label>
              <div className="flex gap-2">
                <Button disabled={busy} type="submit">
                  {busy ? "در حال ذخیره…" : "ذخیره کاربر"}
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => setForm(blank)}
                >
                  فرم جدید
                </Button>
              </div>
              <small>
                کاربر جدید از «ساخت حساب مدیر» در صفحه ورود، رمز می‌سازد و
                ایمیلش را تأیید می‌کند. حساب موجود با همان رمز وارد می‌شود.
              </small>
            </form>
          </Card>
        </div>
        <Card className="ops-info-card">
          <h2>تغییرات دسترسی</h2>
          {log.map((event) => (
            <div className="staff-log" key={event.id}>
              <bdi>{event.email}</bdi>
              <time>{new Date(event.created_at).toLocaleString("fa-IR")}</time>
            </div>
          ))}
        </Card>
      </div>
    </BackofficeShell>
  );
}
