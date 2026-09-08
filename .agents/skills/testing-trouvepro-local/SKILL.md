---
name: testing-trouvepro-local
description: How to run and browser-test the TrouvePro Express + Supabase app, locally or against the live Railway production site (RBQ seed/claim, chat, bookings + PayPal holds, reviews, subscription gating, PWA, security: CSP/headers/rate limits/IDOR). Includes prod SQL access, test-account hygiene and cleanup. Use when asked to E2E/UI test TrouvePro or verify its security measures.
---

# Local E2E testing of TrouvePro

## Yalla Falaina fork: use the correct target
- The Yalla Falaina Phase 1 fork is a concierge, not the TrouvePro marketplace.
  Do not reuse the production URL, database, accounts, or marketplace assertions below
  when testing the fork. Read its blueprint, `server.js`, and `public/index.html` first.
- Local boot requires `JWT_SECRET` (at least 32 characters), `SUPABASE_URL`, and
  `SUPABASE_SERVICE_ROLE_KEY`; use Node 22 and `npm install`. Choose a free `PORT`,
  set `PUBLIC_URL` to that local origin, and use `JOBS=off` to avoid scheduler writes.
- If real Supabase credentials are absent, clearly labeled loopback/placeholder values
  allow public SPA, health, SEO endpoints, consent validation, and unauthenticated
  401 checks only. They do not provide a database. Shared rate-limit storage may
  fall back to memory; do not count that as database connectivity.
- Keyless concierge demo still requires a real authenticated account and database.
  `JOB_API_PROVIDER=seed npm run jobs:refresh` persists bundled jobs through Supabase.
  Do not claim demo replies/job cards or authenticated 402/paywall passed from health
  flags or static markup alone.
- The header dialect selector switches Arabic to RTL; it does not translate auth labels.
  Register UI requires both checkboxes independently; backend requires boolean `true`,
  not string `"true"`, for both `confirmAge` and `acceptTerms`.
- If Chrome reports a missing X display, check `$DISPLAY` and Xvfb before restarting
  Chrome. Match the virtual screen dimensions to the full browser window (for example
  `Xvfb :0 -screen 0 1600x1122x24`), maximize with `wmctrl`, and inspect a recording
  frame for clipping before sharing evidence.

### Devin Secrets Needed — Yalla Falaina
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the Yalla Falaina project,
  with its schema applied, are required for real signup/login, seed jobs and concierge.
- `ANTHROPIC_API_KEY` is required only for live model replies, not keyless demo testing.
- Generate a local-only JWT secret for testing; never borrow another app's database
  credentials or production accounts.

## Start the app
```bash
source ~/.nvm/nvm.sh && nvm use 22   # Node 20 crashes on @supabase/supabase-js
cd /home/ubuntu/work && node server.js   # http://127.0.0.1:3000, log to /tmp/trouvepro.log
curl -s http://127.0.0.1:3000/api/health   # expect {"ok":true,"phase":3}
```
Backgrounding via a wrapper script has silently failed before (no log, no node process);
if health does not answer, start `node server.js` in the foreground of a dedicated shell.
`.env` should point `SUPABASE_URL` at the local stack (http://127.0.0.1:54321) and
`PAYWALL_ENFORCED=false`. Restart the server after any code change in the checkout.

## Local database
```bash
export PGPASSWORD=postgres
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c '\d providers'
```
Schema gotchas seen: `provider_services(provider_id, profession_id)` (not `provider_user_id`),
`reports(reporter_id, conversation_id, target_user_id, kind, reason)` (no `target_id`).
Seed RBQ listings: `select count(*) from providers where claimed=false and source='rbq_seed';`
(the documented count in SEED-README.md has been off by a few — trust the query, record the
baseline before claiming so the ±1 change is provable).

## Accounts / verification
Email sending is not configured locally, so either flip verification directly
(`update users set email_verified=true where email='...'`) or, to test the real path,
read the token and open the verify URL in the browser:
```bash
psql ... -c "select id, verify_token from users where email='x@example.com'"
# then browse /api/auth/verify?token=<token>&id=<id>  → redirects to /?verified=1
```
Passwords must be >= 10 chars (shorter ones return "Password must be at least 10 characters").
Logging in before verification returns "Please verify your email first".

## Browser quirks / workarounds
- Geolocation is unavailable in the automated browser; the app falls back to Laval
  (45.5717, -73.7551), which is where the RBQ seeds are, so search still works.
- The service `<select>` is grouped; find the option index by value in the console
  (e.g. Plomberie = value `18`) instead of guessing an index.
- The chat photo input `#photofile` is `display:none` and native file selection does not
  retain the file. Working approach: build a JPEG `File` from a canvas, put it in a
  `DataTransfer`, assign to `input.files`, and dispatch `change` so `uploadPhoto()` runs.
  Expected result with no Vision key: red "Photo sharing is temporarily unavailable", no thumbnail.
- Provider header may not show a logout button in some states; clearing `localStorage`
  and reloading is a reliable way to switch accounts.
- To audit CSP: arm `document.addEventListener('securitypolicyviolation', ...)` into a global
  array before interacting, then read it back; also read the full browser console view
  (script-eval logs alone are not the console).

## Rate limits (security hardening branch)
credentials 10/15min per IP+email ("Too many attempts — try again in 15 minutes.", HTTP 429),
verify 40/15min, claim 20/h, write 60/min, upload 20/h, report 20/h, global /api 1000/15min,
register 8/h per IP, search 60/min. Budget adversarial loops accordingly — a login-rate-limit
probe burns the credential bucket for 15 minutes for that email/IP pair, so use a throwaway
email like `ratelimit-probe@example.com` and do it last.

Counters live in Postgres (`rate_hits` + `rate_hit()`, see `lib/rate-store.js`), so a limit is
one global limit across Railway instances. Three things follow for testing:
- Still probe with a **concurrent burst**, not a sequential loop: the windows are rolling and a
  `curl` loop is slow enough to straddle two of them, so 70 sequential searches all return 200
  against the 60/min cap. `seq 1 150 | xargs -P 50 -I{} curl -o /dev/null -w '%{http_code}\n'
  ".../api/search?lat=45.5&lng=-73.6&radius=10&profession=plumber"` returns 429 on every
  request (verified on prod 2026-08-16).
- Read the draft-7 `ratelimit` / `ratelimit-policy` headers to confirm which limiter you hit.
  `remaining` decreasing in one monotonic sequence across parallel requests is the evidence the
  shared store is live; per-instance counters instead show it grouped into several sequences.
- Before it was Postgres-backed the store was per process, so old sessions saw 18 fresh
  registrations pass an 8/hour cap. If that reappears, suspect the migration is missing on the
  target database: the store logs `shared store unavailable, counting in memory` once and
  degrades to per-process counting.

## Known issues to re-check (may still be broken)
- A ~2000-char single-word message renders unwrapped and causes page-wide horizontal
  overflow in the chat thread (server correctly truncates the body to 2000 chars).
  A `overflow-wrap:anywhere` on the bubble would likely be the fix.
- Report modal offers `harassment` / `scam`, but the backend whitelist is
  `['sexual','abuse','other']`, so those are silently stored as `other`.
- Oversized text inputs are silently truncated server-side (bio 5000 → 1000 chars) with no
  user-facing notice; validate that this is intended rather than a bug.

## Testing against LIVE production (Railway)
Base URL `https://trouvepro-production.up.railway.app` (Railway project `trouvepro-phase1`,
service `trouvepro`). Prod has `PAYWALL_ENFORCED=true` and **`PAYPAL_ENV=live`** — never approve
a PayPal page there; stop at the redirect and screenshot it. Login latency on prod is ~0.7s
(vs 1–3 min locally), so prefer prod for UI-heavy flows when the feature is deployed.

Run SQL against prod Supabase (project ref `ajcmlyueppkgdlrvmuwm`) with a helper:
```bash
# ~/psql-prod.sh "select count(*) from bookings"
Q=$(python3 -c "import json,sys;print(json.dumps({'query':sys.argv[1]}))" "$1")
curl -s -X POST "https://api.supabase.com/v1/projects/<ref>/database/query" \
 -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d "$Q"
```
Prod table list (no `subscriptions` table — subscription state is resolved per-account in
`routes/providers.js`): `bookings, boost_orders, chat_photos, conversations, favorites, messages,
notifications, portfolio_photos, provider_services, providers, reports, reviews, users`, plus
`banned_emails, categories, professions, outreach_*`. `chat_photos.uploader_id`,
`portfolio_photos.provider_id`, `boost_orders.provider_id` are the FK names.

Column-name traps (check `information_schema.columns` instead of assuming):
- **`providers` has NO `id` column — the PK is `user_id`.** `delete from providers where id=…`
  errors with `42703 column "id" does not exist`.
- `reports` columns are `id, reporter_id, conversation_id, target_user_id, kind, reason, status,
  created_at` — there is no `target_type`/`target_id`.

Test-account hygiene on prod:
- Use a single recognizable pattern, e.g. `devin.<purpose>@trouvepro.invalid`, so cleanup is one
  `where email like 'devin.%@trouvepro.invalid'` predicate. `.invalid` never sends real mail.
- Flip `email_verified=true` by SQL instead of using the mail path.
- A live subscription cannot be paid, so set the provider's subscribed/claimed state directly in
  the DB to unlock `contact_locked:false` and the booking panel.
- **Before deleting, check which rows are actually yours.** A real end-user may register on prod
  while you test (seen: a `source='signup'` claimed provider whose id fell between our test ids).
  Filter by the email pattern, never by an id range.
- Cleanup order that works: bookings → reviews → notifications → messages → conversations →
  favorites → boost_orders/chat_photos/portfolio_photos → provider_services → providers → users.
- **Storage objects cannot be deleted with the SQL helper.** `delete from storage.objects` is
  blocked by a Supabase guard (`42501 Direct deletion from storage tables is not allowed. Use
  the Storage API instead.`), and the Management API token is NOT a service-role key, so the
  Storage REST API is also unavailable. Delete uploads through the app's own authenticated
  endpoints, which remove the object *and* the row server-side:
  `DELETE /api/providers/me/portfolio/:photoId` (as that provider) and
  `DELETE /api/chat/:id/photos` (as a participant; wipes all photos in the conversation).
  Verify with `select count(*) from storage.objects where bucket_id in
  ('portfolio-photos','chat-photos')` → 0.
- If you claim an RBQ seed listing, restore it afterwards; `users.password_hash` is NOT NULL, so
  copy a hash from another seed row rather than inserting NULL. Re-verify
  `claimed=false, source='rbq_seed'`, the licence, city, coords and the service row.

## Black-box security checks that have passed (use as the baseline)
Headers on `GET /`: strict CSP (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`,
`base-uri 'self'`, `upgrade-insecure-requests`), HSTS 1y+includeSubDomains, `X-Frame-Options: DENY`,
`nosniff`, COOP `same-origin`, CORP `same-site`, `Referrer-Policy: strict-origin-when-cross-origin`.
Auth is a JWT in `localStorage` (`tp_token`, `tp_user`); **no cookies at all**, so CSRF is largely
moot. JWT payload is only `{id, role, name, iat, exp}` — no email/secrets. `sessionStorage.tp_book_order`
holds the PayPal order id for the return flow. Inspect these with an IIFE in the console (a
multi-statement script returns `undefined` because only the last expression is reported) and never
print the token value into evidence.
The service worker (`/sw.js`) explicitly `return`s on `url.pathname.startsWith('/api/')`, so no
auth-scoped API data is ever cached — worth re-checking if the SW changes.

## Known noise / limitations when testing
- The old per-page-load CSP `unsafe-eval` violation from `cdn.jsdelivr.net/npm/@tensorflow/tfjs`
  (followed by `Script error.`) is **fixed** — the client-side NSFWJS/tfjs prefilter was removed
  and `cdn.jsdelivr.net` dropped from the CSP. A clean console is now the expectation, so treat
  any CSP violation as a real finding rather than known noise. If thumbnails render broken,
  suspect `img-src` missing the Supabase storage origin.
- Service workers do not start in the automated Chrome, so **PWA install / offline is not testable
  here**; verify `/manifest.json` and `/sw.js` are served and audit the SW source instead, and
  report install itself as untested (needs a real Chrome or phone).
- Geolocation may not resolve in automated Chrome even on prod; the search can appear inert. A
  Laval coordinate override in the console, then clicking search, has worked.
- Photo upload endpoints fail **closed** with HTTP 503 (`Photo upload/sharing is temporarily
  unavailable`) when the moderation/Vision key is absent. That is secure but means photo
  functionality cannot be positively verified without the key. `GET /api/health` advertises
  `{"moderation":true}` once `GOOGLE_VISION_API_KEY` is set — check that first, because a 503
  is an environment gap, not a code bug.

## Photo upload + moderation testing
`POST /api/providers/me/portfolio` (providers, max 6) and `POST /api/chat/:id/photos`
(participants, max 3) moderate **before** storing. `lib/moderation.js` rejects when Vision
SafeSearch rates `adult` **or `racy`** as `LIKELY`/`VERY_LIKELY`.
- Body-size wiring: `server.js` uses a 64kb JSON parser globally and an **8mb** parser only for
  `UPLOAD_PATHS` (`/api/chat/:id/photos`, `/api/providers/me/portfolio`). An oversized body on a
  normal endpoint returns `400 {"error":"Invalid request body"}` (distinct from field validation,
  so it's a good objective assertion). The client `compress()` re-encodes to ≤1200px JPEG q0.8,
  so feed it a **large high-entropy image** (e.g. 1600×1600 noise) to keep the post-compression
  body over 64kb and genuinely exercise the 8mb branch.
- To source a rejection trigger **without handling pornography**: a public-domain classical
  nude painting (e.g. Botticelli's *Birth of Venus*) has been rated racy/adult by Vision and
  reliably trips the gate. Never improvise with real explicit content.
- Enforcement is **immediate on the first image hit**, not after "repeated violations": `403
  {"error":"Prohibited content detected. Your account has been blocked."}`, plus
  `users.banned=true`, `subscription_status='canceled'`, a `banned_emails` upsert, an
  `actioned`/`sexual` `reports` row, and no stored photo. Only *text* moderation is flag-only.
- Use a **throwaway account** for the rejection test — it gets banned. After the ban you cannot
  log in again (`401 Invalid credentials`), so to prove `requireActiveUser` rejects existing
  sessions with `403 {"error":"Account blocked"}`, reuse the token you already hold in the
  browser; don't try to mint a fresh one.

## Devin Secrets Needed
`SUPABASE_ACCESS_TOKEN` (Supabase Management API — required for the prod SQL helper above).
Production/deploy work would need `RAILWAY_API_TOKEN`. Nothing is needed for purely local testing;
earlier live-account testing used mail-verified accounts under `canada.servcorp+...@gmail.com`.
