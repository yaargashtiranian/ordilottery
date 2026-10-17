import type { MetadataRoute } from "next";

/** Do not publish placeholder localhost domains or private workflow URLs. */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!process.env.SITE_URL || process.env.ALLOW_INDEXING !== "true") return [];
  return [
    {
      url: `${process.env.SITE_URL.replace(/\/$/, "")}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
