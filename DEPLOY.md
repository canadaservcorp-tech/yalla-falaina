# Deploying Yalla Falaina (Roadmap Step 7)

This is a single Express process (`server.js`) with the recurring jobs run
in-process by `lib/scheduler.js` — one service is enough on Railway, Render,
or Fly. It needs outbound HTTPS (Anthropic, PayPal, Stripe if enabled,
Resend, Adzuna/Jooble) and a Postgres database via Supabase; it does not
need a separate worker, a queue, or sticky sessions.

Deploying the service itself — creating it on the host, wiring the domain,
setting the env vars below, and confirming the first boot — is a human step;
this doc is what to hand whoever does that.

## 1. Build a fresh Supabase project

Never point this at trouvepro's Supabase project — Yalla Falaina's `users`
table and RLS posture are its own. Create a new project, then run `schema.sql`
once in its SQL editor.

## 2. Environment variables

Every variable below comes from `.env.example`; nothing here should be
invented — copy the file and fill it in on the host's env-var UI.

| Variable | Required | Notes |
|---|---|---|
| `PORT` | no | Most hosts inject this themselves; the app reads it and falls back to 3000. |
| `PUBLIC_URL` | **yes** | The service's real public URL (e.g. `https://yallafalaina.com`), no trailing slash. Drives `robots.txt`, `sitemap.xml`, and every canonical/hreflang link `lib/seo.js` emits — wrong here means wrong SEO tags and a sitemap pointing at the wrong host. |
| `JWT_SECRET` | **yes** | 32+ chars; the app refuses to boot below that. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Rotating it invalidates every issued session. |
| `SUPABASE_URL` | **yes** | The new project's URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Service-role key — this app manages its own `users` table/auth, it does not use Supabase Auth. Treat as a secret; it bypasses RLS. |
| `RESEND_API_KEY` | recommended | Without it, verification/receipt emails print to the server log instead of sending (dev-safe fallback — do not leave this unset in production). |
| `MAIL_FROM` | no | Defaults to a Resend sandbox address; set to a domain-verified sender before launch. |
| `PAYWALL_ENFORCED` | **yes** | `true` in production once PayPal is live; `false` only for a pre-launch/demo deploy. |
| `GA_MEASUREMENT_ID` | no | Omit for no analytics. |
| `ANTHROPIC_API_KEY` | **yes** | Without it the concierge runs in demo mode (raw shortlist, no model reply) — fine for a preview deploy, not for production. |
| `ANTHROPIC_MODEL` | no | Defaults to a current Claude Sonnet model. |
| `JOB_API_PROVIDER` | **yes** | `seed` \| `adzuna` \| `jooble`. `seed` ships the bundled demo data — do not launch on `seed`. |
| `JOB_API_ID` | if adzuna | Adzuna `app_id`. |
| `JOB_API_KEY` | if adzuna/jooble | Adzuna `app_key`, or the Jooble API key. |
| `JOB_API_COUNTRY` | if adzuna | Adzuna country code (e.g. `ca`); confirm it's one `lib/jobsIngest.js`'s `ADZUNA_COUNTRY_NAMES` maps, or track assignment silently falls back to `demand-led`. |
| `JOB_API_KEYWORDS` / `JOB_API_LOCATION` | if jooble | Jooble query filters. |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | **yes** | From the PayPal app; `npm run paypal:setup` also needs these to provision the plan. |
| `PAYPAL_PLAN_ID` | **yes** | Printed by `npm run paypal:setup`. |
| `PAYPAL_WEBHOOK_ID` | **yes** | The webhook Id PayPal assigns once the endpoint (`/api/subscription/webhook`) is registered against the live `PUBLIC_URL`. |
| `PAYPAL_ENV` | **yes** | `live` for production, `sandbox` for testing. |
| `STRIPE_SECRET_KEY` | recommended | The second payment rail — specifically covers Iraq and Lebanon subscribers, whom PayPal's own supported-country list excludes. Leave unset to launch PayPal-only; the Stripe button simply won't appear healthy in `/api/health` and its checkout route returns `ERR_PAYMENT_UNAVAILABLE`. Use an `sk_test_...` key against Stripe's test mode before switching to `sk_live_...`. |
| `STRIPE_WEBHOOK_SECRET` | if Stripe set | The signing secret Stripe issues when you register the webhook endpoint (step 6a below) — not the same kind of value as `PAYPAL_WEBHOOK_ID`, but the same role. |
| `STRIPE_PRICE_ID` | if Stripe set | The recurring $25/month Price id. Created directly in the Stripe Dashboard (Product catalog → add a product with a recurring monthly price) — unlike PayPal, there's no setup script for this; Stripe's own dashboard is the simpler path. |
| `JOBS` | no | Leave unset (`on`) on the single service. Set `JOBS=off` on any *additional* instance so the recurring jobs (job-feed refresh, subscription lapse, retention sweeps) run exactly once. |

## 3. Boot check on a clean port

With every required variable above set:

```
PORT=3100 npm start
curl -s http://localhost:3100/api/health | jq .
```

Expect `{"ok":true,...}` and every integration boolean (`concierge`, `paypal`,
`stripe`, `email`) `true` (`stripe` only if you've set `STRIPE_SECRET_KEY` —
Stripe is optional, PayPal-only is a valid launch configuration) — a `false`
there means that variable is missing or empty, not that the integration
failed a live call (`/api/health` never makes one: it's a configuration
check, same as before Step 7 added these fields).
`jobsFeed` should read `adzuna` or `jooble`, never `seed`, before launch.

## 4. First data load

```
npm run jobs:refresh
```

Confirm real rows land in `jobs` with the correct `track` (not everything
defaulting to `demand-led`) and a `source_type` of `licensed_api`, and that
`expires_at` is ~30 days out. The scheduler (`lib/scheduler.js`) then reruns
this automatically every 24h — the manual run is only to seed the first batch.

## 5. Confirm the concierge still tells the truth about itself

`lib/yf/systemPrompt.js` is guardrail-tested and untouched by this step — it
already states the concierge does not do live lookups. Nothing here should
make that stale; the job feed is a periodic batch refresh, never a live
per-message API call, so the prompt's claim stays accurate as-is.

## 6. Register the payment webhooks

**6a. PayPal.** Point PayPal's webhook config at
`https://<PUBLIC_URL>/api/subscription/webhook` and copy the resulting
webhook ID into `PAYPAL_WEBHOOK_ID`. This has to happen after `PUBLIC_URL` is
live and stable — a preview/staging URL that later changes needs the webhook
re-pointed.

**6b. Stripe** (only if `STRIPE_SECRET_KEY` is set). In the Stripe Dashboard,
add a webhook endpoint at `https://<PUBLIC_URL>/api/subscription/stripe/webhook`
listening for at least: `checkout.session.completed`,
`customer.subscription.updated`, `customer.subscription.deleted`. Copy the
endpoint's signing secret into `STRIPE_WEBHOOK_SECRET`. Same re-pointing
caveat as PayPal if `PUBLIC_URL` changes later.

## What's still a human decision

- Which host (Railway/Render/Fly) and its domain/TLS setup.
- The actual Supabase project creation and its billing tier.
- PayPal going live (business account verification, real bank payout details).
- Stripe account activation (business verification) if the second rail is enabled — this is the piece the founder does directly with Stripe, separate from anything in this repo.
- A Resend-verified sending domain.
