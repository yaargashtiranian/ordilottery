import { handleRegistration } from "@/lib/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public collection stays unavailable until the direct provider and Supabase order flow are verified. */
export async function POST(request: Request) {
  return handleRegistration(request, null, fetch, process.env.SITE_URL);
}
