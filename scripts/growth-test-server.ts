/** Local-only Supabase HTTP test double backed by the actual migrations in PGlite.
 * This is NOT a production backend: Auth/Storage are test fixtures and no external service is contacted.
 * Keep the listener on loopback; synthetic keys/users intentionally have no real privileges anywhere.
 */
import { createServer } from "node:http";
import { growthDatabase } from "../tests/helpers/growth-db";
async function main() {
  const db = await growthDatabase();
  const uid = "00000000-0000-4000-8000-000000000001";
  const email = "growth-staff@example.invalid";
  const user = {
    id: uid,
    email,
    email_confirmed_at: "2026-01-01T00:00:00Z",
    confirmed_at: "2026-01-01T00:00:00Z",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: "2026-01-01T00:00:00Z",
  };
  const token = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: uid,
        email,
        role: "authenticated",
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 86400,
      }),
    ).toString("base64url"),
    "test-signature",
  ].join(".");
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
    [uid, email],
  );
  await db.query("insert into cms_editors(email) values($1)", [email]);
  for (const [code, percent] of [
    ["TEST100", 100],
    ["TEST50", 50],
  ] as const)
    await db.query(
      `insert into growth_campaigns(code,name,percent,max_uses,starts_at,ends_at,plan,mode) values($1,'کمپین تست مرورگر',$2,100,now()-interval '1 day',now()+interval '1 day','all','simulation')`,
      [code, percent],
    );
  const tables = new Set([
    "growth_campaigns",
    "growth_orders",
    "growth_conversations",
    "growth_messages",
    "cms_pages",
    "cms_editors",
  ]);
  const functions = new Set([
    "growth_limit",
    "growth_checkout",
    "growth_complete",
    "growth_send_message",
    "growth_staff_reply",
    "growth_campaign_stats",
  ]);
  const identifier = (value: string) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(value))
      throw new Error("Invalid test identifier");
    return `"${value}"`;
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://127.0.0.1:3301");
    function send(
      value: unknown,
      status = 200,
      headers: Record<string, string> = {},
    ) {
      res.writeHead(status, { "Content-Type": "application/json", ...headers });
      res.end(JSON.stringify(value));
    }
    try {
      if (url.pathname === "/health") return send({ ready: true });
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 200000) throw new Error("Too large");
      }
      const input = raw ? JSON.parse(raw) : {};
      const bearer = req.headers.authorization?.replace(/^Bearer /, "");
      if (url.pathname === "/auth/v1/token") {
        if (input.email !== email || input.password !== "synthetic-password")
          return send({ msg: "Invalid test credentials" }, 400);
        return send({
          access_token: token,
          refresh_token: "test-refresh-token",
          token_type: "bearer",
          expires_in: 86400,
          expires_at: Math.floor(Date.now() / 1000) + 86400,
          user,
        });
      }
      if (url.pathname === "/auth/v1/user")
        return bearer === token
          ? send(user)
          : send({ msg: "Invalid test session" }, 401);
      if (url.pathname === "/auth/v1/logout") return send({});
      if (!url.pathname.startsWith("/rest/v1/"))
        return send({ error: "Not implemented by test fixture" }, 404);
      const staff = bearer === token;
      const service = bearer === "synthetic-service-role-key";
      const role = service ? "service_role" : staff ? "authenticated" : "anon";
      const result = await db.transaction(async (tx) => {
        await tx.exec(`set local role ${role}`);
        await tx.query(`select set_config('request.jwt.claims',$1,true)`, [
          JSON.stringify(staff ? { sub: uid, email, role } : { role }),
        ]);
        const name = url.pathname.split("/").at(-1)!;
        if (url.pathname.includes("/rpc/")) {
          if (!functions.has(name)) throw new Error("Unknown test RPC");
          if (name === "growth_campaign_stats") {
            const result = await tx.query(
              "select * from growth_campaign_stats($1)",
              [input.p_ids],
            );
            return { body: result.rows };
          }
          const entries = Object.entries(input);
          const result = await tx.query<{ value: unknown }>(
            `select public.${identifier(name)}(${entries.map(([key], i) => `${identifier(key)} => $${i + 1}`).join(",")}) value`,
            entries.map(([, value]) => value),
          );
          return { body: result.rows[0].value };
        }
        if (!tables.has(name)) throw new Error("Unknown test table");
        const params: unknown[] = [];
        const where: string[] = [];
        for (const [key, value] of url.searchParams) {
          if (["select", "order", "limit", "offset"].includes(key)) continue;
          if (!value.startsWith("eq."))
            throw new Error("Unsupported test filter");
          params.push(value.slice(3));
          where.push(`${identifier(key)}=$${params.length}`);
        }
        const filters = where.length ? ` where ${where.join(" and ")}` : "";
        const selection = url.searchParams.get("select") || "*";
        const select =
          selection === "*"
            ? "*"
            : selection.split(",").map(identifier).join(",");
        const ordering = (url.searchParams.get("order") || "")
          .split(",")
          .filter(Boolean)
          .map((value) => {
            const [key, direction] = value.split(".");
            return `${identifier(key)} ${direction === "desc" ? "desc" : "asc"}`;
          })
          .join(",");
        let rows: unknown[] = [];
        let count = 0;
        if (req.method === "GET") {
          count = Number(
            (
              await tx.query<{ n: number }>(
                `select count(*) n from ${identifier(name)}${filters}`,
                params,
              )
            ).rows[0].n,
          );
          const range = String(req.headers.range || "")
            .split("-")
            .map(Number);
          const offset =
            Number(url.searchParams.get("offset")) || range[0] || 0;
          const limit = Math.min(
            1000,
            Number(url.searchParams.get("limit")) ||
              (range.length === 2 ? range[1] - offset + 1 : 1000),
          );
          rows = (
            await tx.query(
              `select ${select} from ${identifier(name)}${filters}${ordering ? ` order by ${ordering}` : ""} limit ${limit} offset ${offset}`,
              params,
            )
          ).rows;
        } else if (req.method === "POST") {
          const entries = Object.entries(input);
          rows = (
            await tx.query(
              `insert into ${identifier(name)}(${entries.map(([key]) => identifier(key)).join(",")}) values(${entries.map((_, i) => `$${i + 1}`).join(",")}) returning ${select}`,
              entries.map(([, value]) => value),
            )
          ).rows;
        } else if (req.method === "PATCH") {
          const entries = Object.entries(input);
          const sets = entries
            .map(([key, value]) => {
              params.push(value);
              return `${identifier(key)}=$${params.length}`;
            })
            .join(",");
          rows = (
            await tx.query(
              `update ${identifier(name)} set ${sets}${filters} returning ${select}`,
              params,
            )
          ).rows;
        } else throw new Error("Unsupported test method");
        const single = String(req.headers.accept).includes("vnd.pgrst.object");
        if (single && rows.length !== 1)
          return {
            body: {
              code: "PGRST116",
              details: `The result contains ${rows.length} rows`,
              message: "Cannot coerce to a single JSON object",
            },
            status: 406,
          };
        return {
          body: single ? rows[0] : rows,
          headers: {
            "Content-Range": `0-${Math.max(rows.length - 1, 0)}/${count}`,
          },
        };
      });
      send(result.body, result.status || 200, result.headers);
    } catch (error) {
      const failure = error as { code?: string; message?: string };
      send(
        {
          code: failure.code,
          message: failure.message || "Test backend failure",
        },
        400,
      );
    }
  });
  server.listen(3301, "127.0.0.1", () =>
    console.log("Isolated growth test backend ready on 127.0.0.1:3301"),
  );
  async function close() {
    server.close();
    await db.close();
    process.exit(0);
  }
  process.on("SIGTERM", () => void close());
  process.on("SIGINT", () => void close());
}
void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
