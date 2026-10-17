"use client";

import { useEffect, useState } from "react";
import { ArrowUpLeft, CalendarDays } from "lucide-react";
import { campaign, officialDvUrl, persianNumber } from "@/lib/site";
import { getCampaignState } from "@/lib/campaign";

/** Start the clock only for a sourced date; initial SSR has no time mismatch. */
export function CampaignStatus() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!campaign.startsAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const state = getCampaignState(campaign, now ?? 0);
  return (
    <div className="campaign-status">
      <span className="status-icon">
        <CalendarDays size={20} aria-hidden="true" />
      </span>
      <div>
        <strong>
          {state.kind === "upcoming"
            ? "تا زمان اعلام‌شده شروع ثبت‌نام"
            : state.kind === "elapsed"
              ? "زمان اعلام‌شده رسیده است"
              : "منتظر اعلام رسمی دوره جدید هستیم"}
        </strong>
        {state.kind === "upcoming" ? (
          <p className="countdown" role="timer">
            {persianNumber(Math.floor(state.remaining / 86400000))} روز و{" "}
            {persianNumber(Math.floor(state.remaining / 3600000) % 24)} ساعت و{" "}
            {persianNumber(Math.floor(state.remaining / 60000) % 60)} دقیقه
          </p>
        ) : (
          <p>
            {state.kind === "elapsed"
              ? "وضعیت باز شدن سامانه را از منبع رسمی بررسی کنید."
              : "برای آماده‌کردن اطلاعات و شناخت مسیر، همراه شما هستیم."}
          </p>
        )}
      </div>
      <a
        href={campaign.sourceUrl ?? officialDvUrl}
        target="_blank"
        rel="noreferrer"
        aria-label="بررسی اطلاعیه‌های رسمی DV، در صفحه جدید"
      >
        <ArrowUpLeft size={20} />
      </a>
    </div>
  );
}
