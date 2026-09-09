# Yalla Nsafer — Phase 1 (Concierge MVP)

"Your Assistant to Travel" — a trilingual (Arabic / French / English) AI concierge
that helps Middle East job and immigration seekers find **real, verifiable**
opportunities. Forked from TrouvePro; all marketplace features were stripped.
See `DEVIN_BUILD_BRIEF.md` for the full build brief and guardrails.

## Stack

- Express 4 + Supabase (service-role key only; own `users` table, bcrypt + JWT — not Supabase Auth)
- Anthropic API for the concierge (guardrail system prompt in `lib/yf/systemPrompt.js` — do not redesign it)
- PayPal subscriptions (single $25/month "Basic" tier — PayPal only, never Stripe)
- Resend for transactional email
- Job feed: `JOB_API_PROVIDER` = `seed` (bundled `prototype/data/jobs.json`), `adzuna`, or `jooble`
- Node >= 22

## Setup

1. `npm install`
2. `cp .env.example .env` and fill it in:
   - `JWT_SECRET` (32+ chars)
   - `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — a **new** Supabase project,
     never the live trouvepro one
   - `ANTHROPIC_API_KEY` (without it the concierge runs in demo mode and returns
     the raw matching-engine shortlist)
   - `JOB_API_PROVIDER` + its credentials (or leave `seed`)
   - `PAYPAL_*` for the subscription tier (`npm run paypal:setup` provisions the
     product + plan and prints the IDs)
3. In the Supabase SQL editor, run `schema.sql` once.
4. `npm start` (or `JOBS=off npm start` to disable the scheduler)
5. `npm run jobs:refresh` to pull the first batch of jobs.

## API surface

- `POST /api/auth/register` — `{ email, password, name, confirmAge: true, acceptTerms: true, ... }`
  18+ age gate and terms acceptance are required; a `profiles` row is created at signup.
- `POST /api/auth/login` — returns a JWT.
- `POST /api/concierge` — the concierge. Authenticated + verified; `PAYWALL_ENFORCED=true`
  requires an active subscription (402 otherwise). Every turn is logged to
  `concierge_conversations` / `concierge_messages` (Section 6.2 audit trail) and
  charged to `daily_usage` (fair-use quota in `lib/usage.js`).
- `GET /api/concierge/diag` — admin-only upstream health check.
- `GET|POST /api/subscription/*` — PayPal checkout, status, webhook, cancel.
- `GET /api/health`, `GET /sitemap.xml`, `GET /robots.txt`.

## Tests

`npm test` — node:test suite; the DB is mocked (`test/helpers/mockDb.js`), no
Supabase needed.

## Explicitly out of scope for Phase 1

Voice messages, CV upload/parsing, the B2B marketplace, travel booking, and the
GCC/Iraq + Zone tracks.
