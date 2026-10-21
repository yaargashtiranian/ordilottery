/** Reject cross-site writes even when a browser would automatically attach cookies. */
export function isBackofficeOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const source = new URL(origin);
    const target = new URL(process.env.SITE_URL || request.url);
    // Next may reconstruct the internal URL with its bind host. The actual Host
    // header is browser-controlled; forwarded hosts never authorize a mutation.
    if (!process.env.SITE_URL && request.headers.get("host")) {
      target.host = request.headers.get("host")!;
    }
    return source.origin === target.origin;
  } catch {
    return false;
  }
}

/** Read a bounded body even when Content-Length is absent or inaccurate. */
export async function readBackofficeBody(
  request: Request,
  limit = 150_000,
): Promise<Record<string, unknown> | null> {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Avoid caching administrator data and keep errors separate from successful writes. */
export function backofficeJson(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
