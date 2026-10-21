"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
/** Explicit failure feedback prevents presenting a failed sign-out as success. */
export function PortalSignOut() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <Button
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const response = await fetch("/api/portal/session", {
              method: "DELETE",
            });
            if (!response.ok) throw new Error();
            router.replace("/portal");
            router.refresh();
          } catch {
            setError("خروج انجام نشد.");
            setBusy(false);
          }
        }}
      >
        خروج از حساب
      </Button>
      <p role="alert">{error}</p>
    </div>
  );
}
