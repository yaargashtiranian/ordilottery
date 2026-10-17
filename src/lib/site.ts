/** One brand boundary: replace identity here without rewriting page components. */
export const brand = {
  name: "یارگشت",
  legalName: "یارگشت ایرانیان",
  latinName: "YAARGASHT",
  description: "همراه شما، از اولین قدم تا یک شروع تازه.",
  // The genuine logo/contact details are pending; no fabricated assets are used.
  logo: null as string | null,
  location: "تهران، زعفرانیه",
  support: "پشتیبانی تلفنی و پیام‌رسان",
};

/** Prices are integer tomans; only a future gateway adapter may convert to rials. */
export const plans = {
  online: {
    name: "همراهی آنلاین",
    price: 1_499_000,
    regularPrice: 1_999_000,
    description: "از هر کجا که هستید، با خیال راحت قدم بردارید.",
    features: [
      "بررسی اطلاعات و مدارک توسط متخصص",
      "راهنمایی برای آماده‌سازی عکس",
      "پیگیری از طریق تلفن و پیام‌رسان",
      "همراهی تا تکمیل درخواست خدمات",
    ],
  },
  inperson: {
    name: "همراهی حضوری",
    price: 2_999_000,
    regularPrice: 3_999_000,
    description: "برای وقتی که ترجیح می‌دهید کنار یک متخصص باشید.",
    features: [
      "خدمات بسته آنلاین",
      "بررسی و اسکن حضوری مدارک",
      "هماهنگی با متخصص برای تکمیل اطلاعات",
      "امکان هماهنگی عکاس با توافق جداگانه",
    ],
  },
} as const;

export type PlanId = keyof typeof plans;

/** Keep time-sensitive rules unset until an official source has been checked. */
export const campaign = {
  startsAt: null as string | null,
  sourceUrl: null as string | null,
  verifiedAt: null as string | null,
};

export const officialDvUrl =
  "https://travel.state.gov/content/travel/en/us-visas/immigrate/diversity-visa-program-entry.html";

/** Shared number formatting avoids inconsistent digits across SSR and clients. */
export function persianNumber(value: number) {
  return new Intl.NumberFormat("fa-IR").format(value);
}
