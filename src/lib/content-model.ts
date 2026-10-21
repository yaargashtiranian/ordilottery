import definitions from "./page-content.json";

export const pageDefinitions = definitions;
export type PageSlug = keyof typeof definitions;
export type PageContent = Record<string, string>;
export type ContentPage = {
  slug: PageSlug;
  draft_content: PageContent;
  published_content: PageContent;
  revision: number;
  updated_at: string;
  published_at: string;
};

/** Only the three existing pages can be edited; slugs never become arbitrary queries. */
export function isPageSlug(value: string): value is PageSlug {
  return Object.hasOwn(definitions, value);
}

export function defaultPageContent(slug: PageSlug): PageContent {
  return Object.fromEntries(
    definitions[slug].fields.map(({ key, value }) => [key, value]),
  );
}

/** Reject partial, oversized or unexpected fields before any database write. */
export function validatePageContent(
  slug: PageSlug,
  input: unknown,
): PageContent | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const fields = definitions[slug].fields;
  const record = input as Record<string, unknown>;
  if (Object.keys(record).length !== fields.length) return null;
  const result: PageContent = {};
  for (const { key } of fields) {
    const value = record[key];
    if (typeof value !== "string" || !value.trim() || value.length > 4000)
      return null;
    result[key] = value.trim();
  }
  return result;
}
