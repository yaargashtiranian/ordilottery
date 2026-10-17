# Agent instructions

## Scope and source of truth

- Read `context.md` before changing this project. It records confirmed requirements, proposals, open decisions, and verification limits.
- Repository: `yaargashtiranian/ordilottery`. Work in the existing checkout; cloud tasks are already isolated. Do not create a worktree unless the user requests one.
- Current stage: implementation authorized. Build and verify independent frontend features; keep live payment, document collection and unresolved backend behavior disabled until their prerequisites are available.
- Every meaningful code unit needs a useful comment explaining its purpose, assumptions or non-obvious behavior. Avoid comments that merely repeat syntax.
- Maintain `document.md` continuously: task status, implementation, commands, verification evidence, limitations and next steps. Complete a bounded review/improvement pass after each task; fix concrete issues without endless speculative polishing.
- Communicate with the user in Persian. Keep product text Persian and RTL unless requirements change. Code identifiers can remain English.
- Update the context when product decisions change. Do not silently promote a proposal into a confirmed requirement.

## Build the smallest maintainable solution

- Intended stack: Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, limited GSAP, and headless WordPress.
- Prefer Server Components. Add client components only where interaction requires them. Keep animation code scoped and clean up GSAP effects on unmount.
- Use compatible supported versions at implementation time, one package manager, and a committed lockfile. Do not copy dependency versions from the reference repository without checking them.
- Use existing shadcn primitives and native platform capabilities before adding packages or abstractions.
- Keep application code organized by actual features. No speculative frameworks, microservices, multi-tenant system, custom page builder, or separate admin dashboard.
- Centralize brand identity, contact details, assets and design tokens. Support a configurable brand, not a multi-tenant runtime.
- Keep provider-specific payment and WordPress calls behind small server-side boundaries. Do not create a general plugin framework.
- Existing WordPress and the owner's gateway plugins are the intended payment foundation. Do not add a parallel direct gateway integration in Next.js. Inspect plugin compatibility before deciding whether WooCommerce or another order mechanism is necessary.
- Sites, GitHub, and Vercel are requested tools, not evidence that their connectors or deployment credentials are available. Verify capabilities when needed.

## Visual and interaction requirements

- Use the Ordibehesht Group repository as inspiration only. Do not copy its business content, contact details, typography-heavy composition, or 3D implementation.
- Design for Persian reading, RTL controls, moderate heading sizes and mobile use. Favor useful illustrations, process steps and balanced text/image composition.
- Use logical spacing and alignment. Handle email, identifiers and other LTR values deliberately.
- Preserve native scroll, keyboard navigation, visible focus, form labels and accessible error messages. Honor `prefers-reduced-motion`.
- Content and calls to action must remain usable without animation. Do not hide important content behind scroll progress or animation-only rendering.
- Serve public narrative content as indexable HTML. Keep animation bundles limited; avoid 3D and unnecessary smooth-scroll packages.

## WordPress, payments and applicant documents

- WordPress manages public content and private requests. Public content endpoints must not expose applicant records or media.
- Do not assume ordinary WordPress media uploads are private. Verify private storage and authorized download behavior before collecting real documents.
- Do not use Vercel ephemeral disk, browser localStorage or Git as durable storage for applicant records, payments or documents.
- Keep WordPress credentials, payment keys and private storage credentials on the server. Never include them in `NEXT_PUBLIC_*`, logs, fixtures or committed files.
- Validate all input on the server. Normalize Persian/Arabic digits where appropriate without corrupting names or identifiers.
- The pre-payment form has exactly four applicant fields: first name, last name, email and phone. Carry the selected service package separately; defer identity/family details to the post-payment supplementary form.
- Online service follow-up uses messaging and phone calls. In-person scanning and possible photographer support are owner requirements, but location and price inclusions remain unresolved. Do not invent a visit-booking system or assume photography is included.
- Persist a request before creating its payment. Derive prices server-side, explicitly record currency units, and retain the order's price snapshot.
- Verify payment server-to-server through the actual WordPress gateway integration, including amount and request identity. Next.js must obtain an authoritative status, not trust browser redirects.
- Handle duplicate callbacks and retries idempotently. Keep payment, document review and service fulfillment states distinct.
- Melipayamak is the SMS provider. Keep its credentials server-side, use approved service templates, and send only after a durable WordPress notification claim. Never send SMS from the preview form or expose an unauthenticated SMS endpoint. Record provider acceptance separately from delivery; do not automatically retry uncertain sends or assume an expired claim permits resending. OTP is outside the current implemented scope.
- Report actual persistence and integration failures. Never show a fake success or mark an application officially submitted because payment succeeded.
- Enforce request ownership for viewing, updating and uploading. A guessable order number is not authentication.
- Keep document requirements centralized by document type, applicant role and DV cycle. Enforce real file type, size and relevant image constraints server-side as well as client-side.
- Collect only needed personal information. Do not send sensitive fields or document URLs to analytics. Agree on storage, retention and recovery before real collection.
- Choose the smallest supported WordPress integration after inspecting the actual installation and owner's gateway plugins. Do not add GraphQL, OTP providers or another database by default. Use WooCommerce only if the real integration needs it.

## Claims and content accuracy

- Treat current DV dates, passport requirements, official fees and photo rules as unverified until checked against authoritative sources for the specific cycle.
- Record source URLs, applicable cycle and verification date. Distinguish proposed rules from effective requirements.
- Do not present a service preorder as an open official DV application window.
- Separate the company's service price from any official fee. Do not imply increased selection chances, guaranteed visas or official US government affiliation.
- Mention optional specialist support after selection as a separate service with scope and fees to be agreed. Do not imply it is included in initial registration or guarantees a visa.
- Treat license, experience and support statements as owner-provided claims; obtain exact public details where necessary. Do not invent metrics, testimonials, logos or certifications.
- The initial prices in `context.md` are provisional. Do not call them a market average or enable real charging before amounts and inclusions are resolved.
- Never claim research, live integration, deployment or tests succeeded without observed evidence. A proxy 403 is a connectivity limit, not factual verification.

## Validation and delivery

- Once the app exists, document real setup and verification commands in README/package scripts. Do not report nonexistent scripts as available.
- Run appropriate lint, typecheck, build and meaningful tests for changed behavior. Test payment verification/idempotency, validation, persistence failure and private document access where relevant.
- Check the public page on mobile/desktop, in RTL, with keyboard navigation and reduced motion. Verify actual behavior, not merely a running process.
- Clearly distinguish mocked provider tests from live sandbox/integration checks. Never send real charges, official submissions or applicant documents as routine tests.
- Preserve existing work. Never commit secrets or real identity documents. Request missing credentials through secure environment settings, not chat.
- Keep the implementation within agreed scope; raise concrete blockers while continuing independent work. Do not deploy or publish without authorization.
- Report what changed, what was verified, and any remaining integration or product decisions concisely.

## Skills

No project-specific skill is needed yet. Add one only for a concrete repeated workflow that benefits from it; do not create a boilerplate `skills.md` to restate these instructions.
