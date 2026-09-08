# Prompt for Claude — Yalla Falaina coding assistant

Paste the block below into Claude (claude.ai or Claude Code) when you want help coding on this project.

---

You are working on **Yalla Falaina** — "Your Assistant to Travel" — a trilingual (Arabic / French / English) AI concierge that helps Middle East job and immigration seekers find **real, verifiable** opportunities. Repo: `github.com/canadaservcorp-tech/yalla-falaina` (a stripped fork of trouvepro). The product spec and guardrails live in `DEVIN_BUILD_BRIEF.md` — read it before changing behavior.

## Architecture (as of Phase 1 MVP)

- **Backend**: Express 4 (`server.js`), Node ≥22, CommonJS. Supabase Postgres accessed ONLY via the service-role key through `db.js` — never Supabase Auth; the app has its own `users` table with bcrypt + JWT (`routes/auth.js`, `lib/auth-mw.js`).
- **Concierge**: `routes/concierge.js` → rate-limit → `authenticate` → `requireActiveUser` → subscription gate (402 when `PAYWALL_ENFORCED=true`) → fair-use quota (`lib/usage.js`, `daily_usage` table) → `retrieveJobs` (`lib/yf/matching.js`) → Anthropic call → `logTurn` into `concierge_conversations`/`concierge_messages` + `usage.charge`.
- **System prompt**: `lib/yf/systemPrompt.js` — **DO NOT redesign it.** It is tested, encodes the legal guardrails (no live government-source claims in Phase 1, honesty flags, "retrieve, don't recall"). Changes to matching/prompt semantics need a product decision, not a refactor.
- **Jobs feed**: `lib/jobsIngest.js` dispatches on `JOB_API_PROVIDER` (`seed` = bundled `prototype/data/jobs.json`, `adzuna`, `jooble`); upserts on `unique(external_source, external_id)`; runs on the 24h scheduler (`lib/scheduler.js`) and `npm run jobs:refresh`. Never scrape — licensed feeds only.
- **Payments**: two rails for the single $25/month "Basic" tier, side by side — PayPal (`lib/paypal.js`, `scripts/paypal-setup.js`) and **Stripe** (`lib/stripe.js`; added after DEVIN_BUILD_BRIEF.md's own §1 flagged "no Stripe" as needing confirmation — Hicham's Sept 2026 call: PayPal's supported-country list excludes Iraq and Lebanon entirely, neither of which is under comprehensive sanctions or on Stripe's own restricted list, so Stripe is what actually reaches those subscribers). Both routes live in `routes/subscription.js`; PayPal's webhook verifies via `verify-webhook-signature`, Stripe's via local HMAC (`lib/stripe.js`'s `verifyWebhookSignature`); `lib/subscription-events.js` (PayPal) and `lib/stripe-events.js` (Stripe) each map their provider's events to the same account-state patch shape. `payment_provider` on `users` tells the two apart; every other subscription_* column and every downstream job (lapse, retention) is shared and provider-agnostic — this is a genuinely different rule from trouvepro's own "Stripe removed" decision for that product, not an override of it.
- **DB schema**: `schema.sql` — `users`(+`subscription_tier`,`terms_*`), `profiles` (1:1, `age_confirmed_18_plus`, language/country/sector), `seeker_profiles`, `jobs` (track, source_type, expires_at), `concierge_*`, `daily_usage`, `document_uploads` (retention via `scripts/document-retention.js`), `informal_listing_submissions`, `b2b_partners`. RLS enabled with NO policies on personal tables — service-role only access.
- **Frontend**: single dark-theme SPA `public/index.html` (vanilla JS, sessionStorage `yf_token`), PWA (`manifest.json`, `sw.js`), trilingual SEO via `lib/seo.js` (`ar` → `dir="rtl"`).
- **Email**: Resend via `lib/email.js` — send failures must be non-fatal (register returns `emailSent:false` rather than 500).

## Hard rules

- Never commit secrets; env vars only (see `.env.example`). Never point at trouvepro's Supabase project — YF has its own.
- Signup requires `confirmAge === true` AND `acceptTerms === true` (strict booleans, not strings) — the 18+ gate is legal-critical.
- A concierge `conversationId` is honored only when the row's `profile_id` equals the caller — never relax this.
- Logging every concierge turn is mandatory and best-effort (never fails the user reply).
- Tests: `npm test` (node:test, DB mocked via `test/helpers/mockDb.js` + `test/helpers/appHarness.js`). New routes need tests; don't weaken tests to pass.
- Minimal diffs, match existing style, no new deps without pinning and justification.
- Out of scope for Phase 1: voice messages, CV upload/parsing, B2B marketplace, travel booking, GCC/Iraq + Zone tracks.

## Known gaps / next tasks (pick the one I name, or ask)

1. Email delivery: verify `MAIL_FROM` domain in Resend, add a "resend verification" endpoint.
2. PayPal checkout E2E: needs `PAYPAL_CLIENT_ID`/`PAYPAL_SECRET`/`PAYPAL_PLAN_ID`/`PAYPAL_WEBHOOK_ID`.
3. Trilingual UI: Arabic selector currently flips RTL but doesn't translate auth labels — build the i18n pass.
4. Render assistant Markdown in the chat pane (currently literal).
5. Hide the subscription banner when `PAYWALL_ENFORCED=false`.
6. Wire a licensed job API (Adzuna recommended: `JOB_API_ID`/`JOB_API_KEY`).
7. Deployment: point a Railway/other service at this repo's `main` with the env vars from `.env.example`.

## How to work with me

- I give you a task (e.g. "add a resend-verification endpoint"). You: state the plan in 3 bullets, write the minimal diff, update/add tests, and tell me exactly which env vars or SQL a change needs. Assume Supabase service-role access exists; never print secret values.
- If a change touches `lib/yf/systemPrompt.js`, the `jobs` honesty flags, the age/terms gates, or conversation logging, flag it explicitly — those are legal-safety surfaces.

Start by replying with: which task you're taking, your 3-bullet plan, and any question you need answered first.
