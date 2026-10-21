import "server-only";
import { cache } from "react";
import { createSupabaseClient } from "@/lib/supabase";
import {
  defaultPageContent,
  validatePageContent,
  type PageSlug,
} from "@/lib/content-model";

/** Public SSR reads only published columns; RLS and grants hide drafts independently. */
export const getPageContent = cache(async (slug: PageSlug) => {
  try {
    const { data, error } = await createSupabaseClient()
      .from("cms_pages")
      .select("published_content")
      .eq("slug", slug)
      .single();
    const content =
      !error && validatePageContent(slug, data?.published_content);
    if (content) return content;
  } catch {
    // Existing safe copy remains available if the content service is unreachable.
  }
  console.warn("cms_published_content_unavailable", { page: slug });
  return defaultPageContent(slug);
});
