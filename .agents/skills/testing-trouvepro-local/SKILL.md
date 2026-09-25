---
name: testing-trouvepro-local
description: How to run and browser-test the TrouvePro Express + Supabase app, locally or against the live Railway production site (RBQ seed/claim, chat, bookings + PayPal holds, reviews, subscription gating, PWA, security: CSP/headers/rate limits/IDOR). Includes prod SQL access, test-account hygiene and cleanup. Use when asked to E2E/UI test TrouvePro or verify its security measures.
---

# Local E2E testing of TrouvePro

## Yalla Nsafer fork: use the correct target
- The Yalla Nsafer Phase 1 fork is a concierge, not the TrouvePro marketplace.
  Do not reuse the production URL, database, accounts, or marketplace assertions below
  when testing the fork. Read its blueprint, `server.js`, and `public/index.html` first.
- Local boot requires `JWT_SECRET` (at least 32 characters), `SUPABASE_URL`, and
  `SUPABASE_SERVICE_ROLE_KEY`; use Node 22 and `npm install`. Choose a free `PORT`,
  set `PUBLIC_URL` to that local origin, and use `JOBS=off` to avoid scheduler writes.
- If real Supabase credentials are absent, clearly labeled loopback/placeholder values
  allow public SPA, health, SEO endpoints, consent validation, and unauthenticated
  401 checks only. They do not provide a database. Shared rate-limit storage may
  fall back to memory; do not count that as database connectivity.
- For local-only testing, inherited Supabase secrets may point at production even
  when there is no .env file. Tool-level environment overrides may be superseded
  by secret bindings. Before opening the first page, set overrides in the actual
  child-process environment and verify the listening server's effective DB URL
  is loopback/nonproduction and JOBS is off (print booleans, never credentials).
  Public landing-page news requests can still read the database; avoiding login
  alone is not sufficient isolation.
- Keyless concierge demo still requires a real authenticated account and database.
  `JOB_API_PROVIDER=seed npm run jobs:refresh` persists bundled jobs through Supabase.
  Do not claim demo replies/job cards or authenticated 402/paywall passed from health
  flags or static markup alone.
- For public SEO/share-card checks, restart the server after shell edits: server.js
  reads public/index.html once at boot. Inspect the actual HTTP head for each
  locale, not just client DOM or helper output. With PUBLIC_URL unset, use port
  3000 to exercise the localhost default. Decode the served image and compare
  dimensions/MIME/bytes to the asset; local checks do not prove social crawler
  reachability or cached previews on external platforms.
- SEO injection precedes nonce stamping. Check every served script nonce against
  that response's CSP and verify nonces differ between requests. Observe browser
  exceptions and CSP errors across locale navigation; verbose DOM recommendations
  (such as password inputs outside a form) are not console errors.
- Google OAuth public-UI testing can use the isolated loopback database setup.
  The button appears only when health reports `google:true`; configure both
  GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the local process, never log values.
  Keep PUBLIC_URL local. The configured Google client may authorize only production:
  a local redirect_uri_mismatch does not prove production failure. Do not change
  PUBLIC_URL to production or register callbacks without explicit authorization.
  Test `?lang=en|fr|ar&googleError=failed|blocked` and bogus `?google=garbage`;
  assert translated errors, removal of Google params, preservation of lang,
  absence of a session token, and functioning auth controls on those same loads.
  Observe exceptions continuously: a translated shell alone can hide aborted init.
  With placeholder Supabase, `/api/news` can return HTTP500; disclose that setup
  limitation separately from OAuth 401s and actual JS/CSP exceptions.
- Test UI language separately from chat dialect: header EN/FR/عربي links translate
  chrome and set document direction, while the dialect dropdown sets input and
  non-system bubble direction. Verify opposite-direction pairs and existing bubbles
  after a mid-conversation dialect change; system messages should inherit UI direction.
- Geo-first-page testing needs a bare URL with no lang query and a fresh visitor:
  the client automatically stores yf_lang after its first render. Clear that
  preference only for fresh-visitor cases, then set country request headers via a
  persistent CDP session or browser-context extraHTTPHeaders before navigation.
  Test returning visitors by clicking a language link, navigating back to bare /,
  and reloading with the conflicting country header still applied. Check visible
  translations and direction, not only server lang: metadata may retain the geo
  language while stored preference changes the client UI. Verify served-language
  metadata separately from canonical language, and compare sequential responses
  with the same Accept-Language and different countries. Local origin isolation
  does not establish shared/CDN cache safety; inspect cache policy and Vary inputs.
- For Hindi or another newly added script, check actual pixels before recording:
  correct DOM strings can still render as missing-glyph boxes on minimal Linux.
  Use `fc-list :lang=hi` to check Devanagari support. If absent, install a suitable
  font (e.g. Ubuntu `fonts-lohit-deva`, or extract its TTF into
  `~/.local/share/fonts`), run `fc-cache -f`, and restart Chrome before recapturing
  evidence. This is runner setup, not proof that the application's translations
  are wrong. Hindi UI (`hi`) remains LTR; the chat dialect option uses `Hindi`,
  while signup preferred language uses `hi`.
- Language persistence requires same-tab navigation without `?lang` (including a
  payment-return-shaped URL), not merely reloading a URL that still has `?lang`.
  Exercise this while signed in too, and send another message afterward. A translated
  shell alone does not prove chat initialized. If fresh login works but reload makes
  controls inert, inspect startup errors; sign-out/fresh-login can unblock independent
  checks but must be reported as a workaround, not a passing reload test.
- Register UI requires both checkboxes independently; backend requires boolean `true`,
  not string `"true"`, for both `confirmAge` and `acceptTerms`.
- Check the current build's JWT storage: older Yalla builds used sessionStorage;
  the Google OAuth build uses localStorage key `yf_token`.
  Preserve the same JWT_SECRET across local server restarts to keep browser login
  while switching PAYWALL_ENFORCED or removing ANTHROPIC_API_KEY.
- Resend test credentials can reject example.com recipients. Registration should
  still persist the user/profile and return success with emailSent:false, with a
  visible delivery warning. If authorized to bypass delivery, PATCH only the exact
  test user's email_verified via service-role REST; do not count this as email-link
  verification coverage.
- An inactive account may see the Basic banner even with PAYWALL_ENFORCED=false.
  Prove enforcement by observing the UI-originated concierge HTTP 402 and unchanged
  daily_usage, not merely by seeing the banner.
- On newer builds, `PAYWALL_ENFORCED=false` intentionally hides purchase controls
  and the preview gate. Verify UI against the actual health/API flag; do not count
  four free matching replies as proof of the enabled three-reply paywall.
- For explicitly authorized local display-only paywall previews without Supabase,
  `PAYWALL_ENFORCED=true` alone may not expose the banner: appMain is hidden until
  `enter()`. A deliberately invalid local-only `yf_token` marker can exercise the
  existing returning-session entry path without mocking banner text or backend
  responses. Verify current behavior first; backend calls should reject the marker.
  Label all evidence as a UI preview, disclose expected 401s/news500s, and do not
  claim authenticated subscriber-state gating or payment correctness. Never use
  this setup on production; clear the marker after testing.
  For country prices, compare the actual served `data-sub-price` attribute to the
  visible banner, then switch `?lang=` under the same country header to prove
  currency follows country rather than UI language. Do not click payment buttons.
- Distinguish `users.free_preview_used` from `daily_usage.units_used`. With
  enforcement disabled, the preview counter should not increment, but completed
  profiles still consume the daily tier quota. Read current `lib/usage.js` limits,
  exercise the last allowed turn and first rejected turn, and verify the rejected
  request does not add usage or a persisted user-message audit row.
- With enforcement enabled, also compare the daily quota to FREE_PREVIEW_LIMIT
  (unset currently defaults to eight). A smaller daily quota can stop matching
  before the lifetime preview boundary. Do not reset counters to hide that
  conflict; report HTTP429 ERR_QUOTA separately from HTTP402 ERR_PAYWALL.
- For an authorized exact Gmail-plus smoke account, report emailSent separately
  from inbox arrival/rendering (user-only). If authorized to read the token,
  use scoped users REST reads and visit the real `/api/auth/verify?token=...&id=...`
  link without logging the token; check email_verified and token clearing.
  Retain user and unapproved PayPal object only when explicitly requested for
  payment follow-up; never approve, log in, pay, or cancel on the user's behalf.
- Production email verification requires an inbox you can inspect, `emailSent:true`,
  and an actual delivered link. Health `email:true` only means a key is configured.
  A real disposable inbox may still be rejected by Resend sender-domain restrictions.
- With explicit authorization only, initiate checkout through a same-browser
  authenticated API request when purchase controls are intentionally hidden.
  A live PayPal approval URL proves checkout creation, not login, payment or returns.
  Human-verification challenges may prevent login. Manually visiting success/cancel
  URLs is only a routing smoke test, never proof of provider-configured redirects.
- For subscriber-control inspection on production, change only the authorized
  disposable user's status, open Cancel and dismiss Never mind while observing
  zero cancellation requests. Never call the real provider cancellation endpoint
  without specific authorization. Delete/restore the exact fixture afterward.
- To inspect cancellation grace periods, retain active status and set future
  `subscription_cancel_at` and `subscription_period_end` on only the authorized
  disposable account. A status-only active fixture does not exercise grace.
  Check ending-versus-renewing copy and Resume controls independently; a missing
  cancellation timestamp in the status response can make grace look like renewal.
- Start CDP Log/Runtime observation before the first app navigation for full-pass
  console coverage. Separate expected quota HTTP errors from app exceptions and
  third-party mailbox/payment errors. Sanitize URLs in exception stack descriptions
  too, since provider approval tokens can appear there even if navigation URLs
  themselves have been sanitized.
- Public informal listings are independent of user foreign keys. Track the exact
  submission ID and unique contact/title, assert `review_status=pending`, and delete
  that row explicitly during cleanup. Preserve and compare the seed-job snapshot.
- Seed Canada matches have no honesty flags. A Ghana shawarma/cook query exercises
  informal_unverified and honesty badges. Seed postings are fixtures, not verified
  live vacancies; do not describe successful model calls as proof of job validity.
- For exact-user cleanup, resolve conversation IDs by concierge_conversations.profile_id,
  then delete daily_usage (profile_id) → concierge_messages (by conversation_id) →
  concierge_conversations → seeker_profiles (profile_id) → profiles → users.
  Re-query each scoped table; keep jobs.
- For live conversational intake, inspect browser-originated responses and database
  state after each turn. A clean prose summary is not proof of extraction or
  completeness. Check profiles plus seeker_profiles, missing fields, explicit
  confirmation timing, daily_usage, and user-message units_charged (free intake = 0).
- To verify a block-only stripping fallback with the real model, ask for only its
  mandatory machine-readable update with no prose before explicit confirmation.
  A temporary server fetch observer can record only block presence, stripped prose
  length, status, and stop_reason without changing the response or logging raw data.
  Require observed block-only shape plus clean API/UI/stored assistant content;
  absence of visible markers alone does not establish that the fallback ran.
- When testing lenient model-extraction normalization, extend the shape-only
  observer with field names and types (array/string/null/object), never raw values.
  Pair the upstream type with the persisted database type to establish that
  normalization was actually exercised. Check whether missing-list labels were
  incorrectly emitted as JSON keys (for example sector_or_role_type rather than
  sector or role_type); a prose acknowledgement does not prove a valid key landed.
- If Chrome reports a missing X display, check `$DISPLAY` and Xvfb before restarting
  Chrome. Match the virtual screen dimensions to the full browser window (for example
  `Xvfb :0 -screen 0 1600x1122x24`), maximize with `wmctrl`, and inspect a recording
  frame for clipping before sharing evidence.
- If `wmctrl` cannot identify the active window, use CDP `Browser.getWindowForTarget`
  and `Browser.setWindowBounds` with `windowState: "maximized"`; still inspect the
  actual recording frame because viewport screenshots omit browser chrome.

### Bonus access, letter downloads, and acquisition-source checks
- For a bonus-only countdown fixture, inspect the browser's subscription-status
  response: future `bonusAccessUntil` plus null `periodEnd` reaches the free-access
  copy. A paid fixture with both dates may instead take the renewal-copy branch.
  Subscription and bonus fields live on `users`; `profiles` uses `id`, whereas
  `seeker_profiles` uses `profile_id`. Do not guess a separate subscriptions table.
- Check subscribe deep links after health/subscription initialization settles.
  URL scrubbing and sustained paywall visibility are separate assertions; a later
  state refresh may undo a panel opened by the query handler. Never initiate a
  real payment merely to prove the deep link.
- CV/letter controls need subscribed access and substantive CV content. Read the
  actual `/api/cv/preview` readiness response; complete synthetic conversational
  education/work intake and explicit confirmation through the UI rather than
  manufacturing ready DOM. Test controls for visibility and hit-testability:
  opening Menu can expose the CV pane while also placing a popover above it.
- Browser automation may immediately accept native JavaScript prompts with empty
  text. Capture the real `Page.javascriptDialogOpening` event passively, but do
  not claim visible prompt pixels, named-target entry, or cancellation unless
  actually observed. Avoid racing a second CDP dialog handler; handle a
  "No dialog is showing" rejection without losing network/error observation.
- If the browser wrapper is unavailable or retains a closed PDF target, native
  CDP mouse/keyboard input is a viable GUI fallback. Prefer the existing Chrome;
  if a fresh launch is necessary, use an isolated temporary profile and a free
  debugging port, retaining the real app/backend. Maximize and dismiss Chrome's
  password-saving popup before recording. Log in via native input, never by
  injecting a token or bypassing authentication.
  CDP `Input.dispatchMouseEvent` can remain pending while a native prompt is
  open. Keep dialog handling on a concurrent connection/request, and allow the
  click call to finish after accepting/cancelling rather than timing it out.
  Capture native dialog pixels from the desktop, since Page.captureScreenshot
  captures the web page rather than browser chrome/dialogs.
- For a local bootstrap that sets environment variables before loading Express,
  `require('./server')` returns the app without listening. Explicitly call
  `app.listen(port)`; leave the scheduler unstarted for UI-only tests. Confirm
  runtime health flags for disabled mail/analytics; `/proc/<pid>/environ` may
  not reflect environment values changed inside the running Node process.
- For a letter suggestion chip, mark the network baseline immediately before the
  click. Require the correct prompt/type, a real letter response/download, and no
  new concierge POST. A visible chip alone does not prove action routing.
- Verify actual downloaded PDF bytes, not just MIME, filename, or HTTP200.
  CDP `Network.getResponseBody` can return an empty body for a download even when
  the browser saved a valid file. Parse the browser download and check recipient,
  purpose, and target: a scholarship heading alone does not prove scholarship
  prose. The installed pdf-parse API may be
  `new PDFParse({data:new Uint8Array(buffer)}).getText()`; `getScreenshot()` can
  render evidence without opening a local PDF viewer tab that may disrupt tools.
- For source forwarding without creating an account, visit `?src=instagram`
  before opening signup, submit a synthetic `.invalid` email with a deliberately
  short password and checked consent, and observe the registration payload.
  Expected weak-password rejection proves no successful signup, not persistence.
  A placeholder local Google client can expose first-party source/ref forwarding;
  its provider `invalid_client` error is an environment limitation, not evidence
  of successful OAuth. Never complete OAuth for this routing-only check.

### Devin Secrets Needed — Yalla Nsafer
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the Yalla Nsafer project,
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
Google OAuth local public-UI checks need `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` as process configuration to expose the button; authorized
Railway variables may supply them. No Google account password is needed when
testing stops before login. A successful local account flow additionally requires
an authorized isolated Supabase environment.
`SUPABASE_ACCESS_TOKEN` (Supabase Management API — required for the prod SQL helper above).
Production/deploy work would need `RAILWAY_API_TOKEN`. Nothing is needed for purely local testing;
earlier live-account testing used mail-verified accounts under `canada.servcorp+...@gmail.com`.
