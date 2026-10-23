import { handleRegistration } from "@/lib/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The retired bridge stays closed; the interactive journey uses the scoped /api/experience flow. */
export async function POST(request: Request) {
  return handleRegistration(request, null, fetch, process.env.SITE_URL);
}
