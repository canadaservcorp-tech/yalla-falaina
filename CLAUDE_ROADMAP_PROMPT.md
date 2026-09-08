# Yalla Falaina — Development Roadmap Prompt for Claude

Paste the block below into Claude at the start of a coding session. It gives Claude the repo state, the non-negotiable guardrails, and a step-ordered roadmap. Work through it ONE step at a time — each step ends with a PR.

---

You are developing **Yalla Falaina** ("Your Assistant to Travel") — a trilingual (ar/fr/en) AI concierge connecting Middle East job/immigration seekers with real, verifiable opportunities.

**Repo:** `github.com/canadaservcorp-tech/yalla-falaina` — a stripped trouvepro fork. Spec + guardrails: `DEVIN_BUILD_BRIEF.md`. Companion context file: `CLAUDE_PROMPT.md` (architecture + hard rules — treat it as binding).

**Current state (as of 2026-09-08):** Phase 1 MVP merged — concierge live on real Supabase + Anthropic, seeded jobs feed, age/terms-gated signup, $25 PayPal tier wired, trilingual UI chrome, resend-verification endpoint. 46/46 tests pass.

## Working protocol — follow every step

1. Work on ONE roadmap step per session. Open a `claude/<slug>` branch off `origin/main`, implement, add tests, open a PR, stop.
2. NEVER redesign `lib/yf/systemPrompt.js` or the matching semantics — legal-safety surfaces. Flag any change there explicitly.
3. Never commit secrets, never touch trouvepro's Supabase, PayPal only (never Stripe), `confirmAge`/`acceptTerms` strict-boolean gates are untouchable, every concierge turn must stay logged.
4. If a step needs a credential/decision you don't have (marked ⛔), do NOT fake or stub around it — stop, write what's needed in the PR description, move to the next unblocked step only if told.
5. Tests must pass: `npm test`. Match existing style; minimal diffs.
6. After each step, report: PR link, what changed, what env vars or SQL it needs, and which step you recommend next.

## Roadmap — do these in order

### Step 0 — Merge & verify baseline ⛔(human merges PRs)
Wait for open PRs to merge, then verify `npm test` is green on `main`. Nothing to code here — report green and continue.

### Step 1 — Error-code contract for API responses
Server error strings are English-only because the client can't safely map message text. Add a stable `code` field to all 4xx/5xx JSON responses in `routes/auth.js`, `routes/concierge.js`, `routes/subscription.js` (e.g. `ERR_INVALID_CREDENTIALS`, `ERR_UNVERIFIED`, `ERR_PAYWALL`, `ERR_QUOTA`, `ERR_BAD_INPUT`), then map codes → translated strings in `public/i18n.js`. Keep the English `error` field as fallback.

### Step 2 — Email delivery ⛔(needs Resend domain or a recipient that can receive)
Verify the `MAIL_FROM` domain in Resend or confirm a working sender. Then: test the full verify-email → click-link → `email_verified=true` flow end-to-end. Add a `/api/auth/resend-verification` rate-limit check against the credential limiter. Do not mark done until a real email is received and the link verifies.

### Step 3 — PayPal checkout live ⛔(needs PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_PLAN_ID, PAYPAL_WEBHOOK_ID)
Run `npm run paypal:setup` to provision the $25/month Basic plan, wire env vars, test checkout → webhook → `subscription_status='active'` → concierge unlocked. Verify webhook signature verification rejects tampered calls. If creds aren't provided, skip and note it.

### Step 4 — Licensed job feed ⛔(needs one API key — recommend Adzuna free tier)
Set `JOB_API_PROVIDER=adzuna` + `JOB_API_ID`/`JOB_API_KEY`, run `npm run jobs:refresh`, verify real rows land in `jobs` with correct `track`/`source_type`/`expires_at`. Confirm the concierge's system prompt still says it does NOT do live lookups (don't overclaim freshness).

### Step 5 — Informal listing moderation path
`informal_listing_submissions` exists but nothing reviews it. Add a minimal admin endpoint (`GET /api/submissions`, `POST /api/submissions/:id/review`) gated by `role==='admin'` that approves → creates a `jobs` row with `source_type='informal_unverified'` + `track` from country, or rejects with `rejection_reason` (incl. `prohibited_category` per Section 6.6). Wire the public submit form into `informal_listing_submissions`.

### Step 6 — Profile completeness gate (Section 10)
Before matching, a seeker should fill required intake fields. Implement the conversational intake: concierge asks for missing `seeker_profiles` required fields (work history summary, languages, passport/visa/residency/host-abroad booleans), persists answers, and only marks `is_complete=true` when all required fields exist. Gate job-card display (not conversation) on `is_complete` OR a per-profile n unanswered-question budget — per the brief's "required-field gate before matching".

### Step 7 — Deployment prep
Write `DEPLOY.md` + verify the app boots with the real env set on a clean port. Produce the exact env-var list for the host (Railway/Render/Fly), confirm `PUBLIC_URL` drives SEO/robots/links, and add a `/api/health` field showing which integrations are live (`anthropic`, `paypal`, `jobsFeed`, `email`). Deployment itself needs the human to create the service.

### Step 8 — Phase 2 gate review
Do NOT start Phase 2 features (voice, CV parsing, B2B marketplace, travel booking, extra payment rails for Lebanon/Iraq/Jordan/Syria). These are blocked on external answers: Whish Money merchant eligibility for a Canadian business, Syria sanctions-compliance sign-off, Iraq/Jordan rail research. If asked to build them anyway, stop and ask for the compliance/merchant confirmations first.

## Definition of done per step
PR open, tests green, no secrets in diff, guardrails intact, and a report naming blockers. If everything above is done, stop and report — do not invent new scope.
