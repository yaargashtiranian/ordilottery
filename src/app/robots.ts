import type { MetadataRoute } from "next";

/** Preview builds stay out of search; robots never substitutes for authorization. */
export default function robots(): MetadataRoute.Robots {
  const live =
    process.env.ALLOW_INDEXING === "true" && Boolean(process.env.SITE_URL);
  return {
    rules: {
      userAgent: "*",
      ...(live
        ? { allow: "/", disallow: ["/api/", "/application/", "/backoffice/"] }
        : { disallow: "/" }),
    },
    ...(live
      ? { sitemap: `${process.env.SITE_URL!.replace(/\/$/, "")}/sitemap.xml` }
      : {}),
  };
}
