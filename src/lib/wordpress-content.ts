import "server-only";
import { brand } from "@/lib/site";

export type PublicContent = { eyebrow: string; description: string };

const defaultContent: PublicContent = {
  eyebrow: `همراه یک شروع تازه، با ${brand.name}`,
  description:
    "برای یک فرصت تازه، لازم نیست مسیر را تنها بروید. از شناخت لاتاری تا آماده‌سازی و بررسی درخواست، قدم‌به‌قدم همراه شما هستیم.",
};

/** Small JSON content boundary; no arbitrary HTML, personal data or hidden fallback claims. */
export async function getPublicContent(): Promise<PublicContent> {
  const endpoint = process.env.WORDPRESS_CONTENT_URL;
  if (!endpoint) return defaultContent;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password)
      return defaultContent;
    const response = await fetch(url, {
      next: { revalidate: 300 },
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return defaultContent;
    const content: unknown = await response.json();
    if (!content || typeof content !== "object") return defaultContent;
    const { eyebrow, description } = content as Record<string, unknown>;
    if (
      typeof eyebrow !== "string" ||
      !eyebrow.trim() ||
      eyebrow.length > 100 ||
      typeof description !== "string" ||
      !description.trim() ||
      description.length > 600
    )
      return defaultContent;
    return { eyebrow: eyebrow.trim(), description: description.trim() };
  } catch {
    return defaultContent;
  }
}
