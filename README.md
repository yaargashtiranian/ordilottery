# Ordilottery — یارگشت

Persian RTL, single-page DV service website using Next.js App Router, TypeScript,
Tailwind CSS, official shadcn/ui primitives, local Vazirmatn fonts and limited GSAP.

Product decisions: [context.md](context.md). Development instructions:
[AGENTS.md](AGENTS.md). Implementation, review evidence and outstanding work:
[document.md](document.md).

## Run locally

Use Node.js 24 and npm, in the existing checkout. No worktree is required.

```bash
cd /workspace/ordilottery
npm ci
npm run dev
```

If the home npm cache is not writable, prefix npm commands with
`npm_config_cache=/workspace/.npm-cache`. The default development port is 3000.
Create `.env.local` from `.env.example` only when actual configuration is available;
the unconfigured site works without credentials in an explicitly labeled form preview.

## Validation

### Private case documents

Open a case under `/backoffice/cases` to use **مدارک و بررسی کارشناس**.
Staff can preview images, download PDFs, approve/reject with a customer-visible
explanation, and upload new documents or immutable versions. Older versions retain
their own review state. Overall case review remains a separate expert decision.

Staff enable customer intake per case. Customers visit `/portal`, create an email/password
Supabase account with their case email, confirm their email, then sign in. Account
creation does not grant staff membership or create a CRM record. Configure Supabase
Auth redirect allowlists for the deployed `/auth/callback` URL. No SMS/OTP provider is added.

Configure `DOCUMENTS_ENCRYPTION_KEY` securely on the application server: 64 hex
characters representing 32 random bytes. Local setup generated this key in ignored
`.env.local`; its value is never logged or committed. Back up this key separately:
it is required to recover every encrypted version. Do not rotate by replacing it
without a migration/re-encryption procedure. Missing key disables uploads.

Files (JPEG/PNG/PDF, maximum 5 MiB before encryption) are authenticated with AES-256-GCM,
bound to case/version IDs and SHA-256 checked on download. The private `case-documents`
bucket stores a primary ciphertext and a recovery ciphertext. Both must persist before
an upload succeeds. Staff can **دریافت از پشتیبان** if the primary is unavailable.
These are copies in the same Supabase project, not an independent disaster-recovery backup.
Never use the public Storage URL or send document URLs to analytics. PDFs are downloaded
as attachments; image previews use the authenticated, uncached API. Technical checks
are not malware scanning or official DV photo validation.

Completion/cancellation starts a 90-day deadline; reopening clears it. Storage and API
use the database clock for expiry. Access closes at the deadline; staff use the expired
case's **پاک‌سازی فایل‌های منقضی** action to delete both copies through the Storage API.
No automatic purge scheduler has been deployed. Metadata/review audit remains after
file erasure. Never delete Storage metadata directly as a substitute for the Storage API.

`supabase/tests/documents_access.sql` checks ownership/reviews/versioning with a full rollback.
`scripts/qa-documents-live.ts` provides an explicitly controlled synthetic integration harness
(`setup`, `verify`, `expire`, `purge`, `cleanup-sql`): setup/expire/cleanup print SQL for the
authorized operator, while verify/purge use localhost:3000 and native Auth/Storage.
Run with `node --env-file=.env.local --import tsx scripts/qa-documents-live.ts <mode>`.
It never sends signup emails or uses identity documents. Apply setup SQL before verify,
expire SQL before purge, and cleanup SQL only after the Storage purge. Temporary credentials
and screenshots are under ignored `test-results/`; remove the JSON after cleanup.

### Supabase connection

The app connects to Supabase project `Yaargashtirania` through the server-only
client in `src/lib/supabase.ts`. Configure `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY` in `.env.local` (ignored by Git); use the same variables
in your hosting environment. Never substitute a secret or service-role key.

Run `npm run check:supabase` to verify Data API access to the CMS table, or request
`GET /api/health/supabase` from the running app. It returns HTTP 200 with
`{"supabase":"connected"}` or HTTP 503 with `{"supabase":"unavailable"}`.
The check selects one public page slug without reading drafts or creating records.
CMS tables and administrator authentication are configured; applicant persistence
is not part of this content management flow.
Public checkout defaults to disabled; the interactive journey has explicit simulation, sandbox and live modes described below. Automatic SMS remains disabled.

The client follows the official [initialization guide](https://supabase.com/docs/reference/javascript/initializing)
and uses [select](https://supabase.com/docs/reference/javascript/select)
for the connectivity check.

### Backoffice and page content

Open `/backoffice` (unauthenticated visitors go to `/backoffice/login`). The Persian
RTL content editor at `/backoffice/content` uses the existing shadcn/ui components to edit the home,
privacy and terms pages. Saving a draft does not change the live page; publishing
atomically updates its public copy. Concurrent edits return HTTP 409 and retain
the editor's unsaved text. Published content is server-rendered on each request;
no rebuild is needed after publication. If Supabase is temporarily unavailable,
public pages retain the bundled original copy and log a sanitized warning.

For the first administrator, configure `BACKOFFICE_ADMIN_EMAIL` in `.env.local`
and insert that lowercase email into `public.cms_editors` through the Supabase SQL
editor. The requested owner's email is already allowed in the connected project.
Choose **اولین ورود؟ ساخت حساب مدیر** on the login screen, use that email, choose
your password privately, and confirm the email before signing in. This workflow
does not create an account or send email until you submit the form. The same email
must appear in Supabase Auth and the editor allowlist. Supabase Dashboard account
administrators and app content editors are separate identities.

In Supabase Auth, allow your actual site's `/backoffice/login` redirect URL under
URL Configuration and configure your email provider for production delivery.
Local development uses `http://localhost:3000/backoffice/login`. Session cookies
are HTTP-only and SameSite=Lax, with Secure enabled in production. For deliberate
local production testing over HTTP only, `BACKOFFICE_LOCAL_HTTP=true` disables
Secure; do not set this on hosted deployments. No service-role key is used.

Database migration: `supabase/migrations/20261021133642_backoffice_content.sql`.
It is already applied to the connected project; it seeds the original public
copy without storing user emails in Git. Both tables use RLS. Anonymous users can
select only published columns; authenticated non-editors cannot read drafts or
update pages, and users cannot grant themselves editor membership.
`supabase/tests/content_access.sql` checks these rules and draft/publish/version
behavior in a transaction that rolls back all synthetic changes.

API endpoints (all private responses use `Cache-Control: no-store`):

- `POST /api/backoffice/session`: login or initial-owner registration.
- `DELETE /api/backoffice/session`: local session sign-out.
- `GET /api/backoffice/pages`: authenticated editor's drafts and publication state.
- `PATCH /api/backoffice/pages/{home|privacy|terms}`: authenticated save/publish,
  with `{ action: "save" | "publish", content, revision }`.

Writes validate origin, bounded JSON, known fields and revision. Page copy is
rendered as text, never executable HTML. Layout, prices, campaign verification,
payments, SMS and applicant forms remain outside the page-copy editor.

### Project checks

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
npm run start
```

Browser checks use Playwright and the host Chromium in this cloud environment.
Disable payment and applicant collection for browser checks. Public CMS reads may
contact Supabase; tests do not sign up users, send email or publish content.
Playwright starts its own production server and refuses to reuse an
existing process on its test port:

```bash
ENABLE_CHECKOUT=false ENABLE_MELIPAYAMAK=false SITE_URL= ALLOW_INDEXING=false npm run build
npm run test:e2e
```

On another machine, install the Playwright browser first (`npx playwright install
chromium`) and set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to that browser path, or
adjust the documented executable setting in `playwright.config.ts`.

## Boundaries

- `src/lib/site.ts`: brand identity, package prices and verified campaign settings.
- `src/app/page.tsx`: server-rendered narrative; client islands handle navigation,
  FAQ, selection, form validation and optional scroll effects.
- `src/lib/registration.ts`: shared four-field input contract and Persian digits.
- `src/lib/checkout.ts`: bounded public-form validation and injectable provider-contract tests.
- `src/lib/content-store.ts`: published Supabase copy with safe original-copy fallback.
- `src/lib/content-model.ts` and `page-content.json`: fixed editable page fields.
- `src/app/backoffice`: administrator workspace and sign-in.
- `src/app/api/backoffice`: authenticated content/session API.

## Operational workspace

The main dashboard at `/backoffice` now opens the operational workspace. Page
content management remains available at `/backoffice/content`. Other sections:

- `/backoffice/customers`: private contact records, edit history and related cases.
- `/backoffice/cases`: service/review states, assignee, follow-up date and timeline.
- `/backoffice/payments`: immutable manual receipts and financial history.
- `/backoffice/support`: support requests, status and internal team notes.

All data is persisted in Supabase through authenticated API routes under
`/api/backoffice/operations`. No WordPress integration is used or required.
Lists are searched/filtered server-side and paginated in sets of 20. Detail
history is bounded and the exact financial total is computed separately.
Only existing administrator allowlist members can read or change these records.
No customer-facing access is enabled, and no applicant document is uploaded.

The operational schema is applied in migrations
`20261021141102_operations_workspace.sql` and
`20261021142153_operations_financial_totals.sql`. Re-run
`supabase/tests/operations_access.sql` through the SQL editor/MCP for the
transactional access, audit, receipt immutability and idempotency checks. All its
synthetic data is rolled back; PostgreSQL sequence gaps after tests are normal.

With the existing development server running at `http://localhost:3000`, run
`npm run test:operations-ui` for the isolated workspace/form browser checks.
It temporarily mounts a development-only route containing synthetic fixtures,
intercepts operational API calls, and removes the route in `finally`. It does not
create real customers, issue charges, send messages or bypass actual route auth.
An existing file at the fixture path is never overwritten. Use
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when needed; Windows Chrome is detected
automatically. This is separate from `npm run test:e2e`, which checks real
production-route access and the public site.

Customer/case/ticket edits use optimistic revisions. History and receipts have
no update/delete grants. Database triggers append the event history atomically;
initial support requests and notes use idempotent database functions. Create
requests carry stable UUIDs to prevent duplicates on retries. Case prices are
set server-side and stored in tomans (IRT), separately from receipt records.

## Payment integration and legacy endpoint

The interactive journey uses `/api/experience` and the server-only Zarinpal boundary.
Live activation still requires the configuration and staging checks in
[docs/growth-setup.md](docs/growth-setup.md). The retired `/api/registration` bridge
continues returning 503; stale legacy flags cannot enable it. Its retained injectable
contract tests do not exercise the new gateway or establish live connectivity.
Manual receipts are not bank verification; a refund record does not transfer money.

The server-side Melipayamak adapter and its isolated provider tests remain, but
public registration no longer invokes the retired external notification bridge.
Automatic messaging needs a durable Supabase claim and provider verification
before activation. Support notes are internal; they do not send email or SMS.

## Interactive journey, campaigns and chat

The public entry flow now supports reversible steps, server-priced campaign discounts,
zero-balance completion, an explicit payment simulator and a Zarinpal boundary. Staff manage
campaigns, website orders and customer chat in `/backoffice/campaigns`, `/backoffice/orders`
and `/backoffice/chat`. Internal support notes stay separate from customer messages.

Run `npm run demo` for an isolated local review without real service credentials. Setup,
synthetic demo credentials, migration order, environment modes and verification limits are
in [docs/growth-setup.md](docs/growth-setup.md). The marketing review and measurement plan are
in [docs/conversion-review.md](docs/conversion-review.md).
