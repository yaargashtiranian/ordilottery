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

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
npm run start
```

Browser checks use Playwright and the host Chromium in this cloud environment.
Build the preview variant explicitly so tests cannot contact a real CMS or collect
applications. Playwright starts its own production server and refuses to reuse an
existing process on its test port:

```bash
ENABLE_CHECKOUT=false ENABLE_MELIPAYAMAK=false WORDPRESS_CONTENT_URL= SITE_URL= ALLOW_INDEXING=false npm run build
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
- `src/lib/checkout.ts`: bounded JSON input and proposed WordPress bridge request.
- `src/lib/wordpress-content.ts`: small optional JSON content integration with
  five-minute revalidation and safe local fallback.

The actual WordPress installation and the owner's gateway plugins have not been
provided. No application, payment or document is currently stored. A successful
local form check is explicitly not a submitted request. No supplementary form is
publicly accessible without verified payment and applicant authorization.

## Proposed WordPress bridge (not implemented on WordPress)

Configure only after inspecting the owner's existing plugins. The Next.js server
expects `POST {WORDPRESS_API_URL}/requests` with server-only Bearer authentication
and `Idempotency-Key`. The JSON includes `applicant` (firstName, lastName, email,
phone), `plan`, integer `amount`, `currency: "IRT"` (tomans), and `idempotencyKey`.

The bridge must authorize the call, validate the package and current price,
persist the request before payment, and reuse the same request/checkout for the
same key. Reject reuse of a key with a different payload. Successful responses:

```json
{
  "requestId": "persisted-private-id",
  "checkoutUrl": "https://your-allowed-checkout.example/path"
}
```

Only an exact configured HTTPS checkout origin is accepted. Redirects from the
authenticated bridge fetch are refused. Next.js never accepts a browser price or
uses a redirect as proof of payment. The real WordPress plugin remains responsible
for provider verification, callback idempotency, amount matching and persistent
status. Its verified status/authenticated applicant flow must be implemented
before unlocking the supplementary form or documents. Never expose ordinary
public WordPress media URLs for identity documents.

Do not enable checkout merely by adding values: first complete privacy/refund
terms, private storage, durable rate limiting/abuse controls, plugin compatibility
and sandbox verification. This bridge is a preparation boundary, not a payment
system that is ready to charge users.

## Transactional SMS — Melipayamak

The first supported event is **request received**, after WordPress persists the
request and returns a validated checkout URL. It is not a payment confirmation,
official DV submission, or OTP. The preview never sends SMS. No public arbitrary
recipient/message endpoint is exposed, and no new npm dependency was added.

`src/lib/melipayamak.ts` calls the shared service template API at
`https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber` with HTTPS form
encoding. The interface was checked against the provider's official Node SDK:
https://github.com/Melipayamak/melipayamak-node/blob/378e2c47e4b45e8ae699f93744a1e95acde6de5b/src/sms/restAsync.js

Enter `MELIPAYAMAK_USERNAME`, `MELIPAYAMAK_PASSWORD` (web-service/API credential),
and `MELIPAYAMAK_REGISTRATION_BODY_ID` securely on the server. Do not use
`NEXT_PUBLIC_*` or paste credentials into chat/Git. The approved template takes
two variables, in this order: first name, public request reference. For example,
the approved wording should state that the **service request was received**,
including the current brand, without claiming payment or official DV success.
The reference must not be an access token. Allow HTTPS egress to
`rest.payamak-panel.com` in the deployment network policy.

### Required WordPress bridge extension

These endpoints are a proposed backend contract; they are not installed on the
owner's WordPress yet. They use the same server-only Bearer authentication:

1. `POST /requests/{requestId}/notifications/registration/claim`, body `{}`.
   Atomically mark the request's notification as attempted, with one unique
   durable record per request/event, **before** returning `201`:

   ```json
   {
     "notificationId": "sms-unique-id",
     "to": "09123456789",
     "firstName": "سارا",
     "reference": "YG-1001"
   }
   ```

   Read recipient/parameters from the persisted request. Return `204` for an
   existing claim, including accepted, unknown or interrupted attempts. Replays
   must not issue a new claim. Missing endpoints, errors or malformed claims
   prevent sending. Claims do not expire into automatic resend authorization.

2. `POST /requests/{requestId}/notifications/registration/result`, body containing
   `notificationId`, `status` and either `providerId` for `accepted` or a sanitized
   `reason` for `rejected`/`unknown`. Validate ownership and update idempotently
   using `Idempotency-Key: sms-result:{notificationId}`. Only this authenticated
   service may mutate notification state; request/notification IDs alone confer
   no authorization.

Next.js `after()` schedules the notification after returning the checkout response,
so notification latency/failure does not interrupt checkout. Deploy on a host
supporting the Node Next.js post-response lifecycle (30-second route budget).
Persistent claims prevent repeated send attempts, but cannot guarantee delivery:
a crash between claiming/sending or an uncertain response needs manual
reconciliation. There is no automatic resend worker. Failure to write a result
does not release the original claim. The WordPress dashboard must show attempted
and uncertain notifications for operator review.

`accepted` means provider acceptance, **not handset delivery**. HTTP failures,
timeouts and malformed responses are uncertain and never automatically retried.
Large provider IDs remain strings. The server logs only a generic bridge failure
status when claiming/recording fails, never recipients, message bodies or secrets.

After the bridge, approved template and real account have been checked, enable
`ENABLE_MELIPAYAMAK=true`. Merely setting credentials does not implement the WP
extension. No live SMS has been sent or delivery verified. Other status messages
and OTP require separate event/authentication design; they are not claimed here.

## Content and launch

No official DV date is configured. A sourced future date enables an informational
countdown; expiry never automatically opens official registration. Passport and
official fee changes have not been independently verified in this environment.

Regular and preregistration package prices are the owner's planned tariffs, not
historical sales or independently researched market averages. No fake discount
deadline or scarcity is generated.

Set the final `SITE_URL`, review the logo/contact details, current DV sources,
prices, legal terms and integrations before launch. Keep `ALLOW_INDEXING=false`
for previews. Rebuild after changing environment settings used in server-rendered
pages. No external deployment or publication has been performed.
