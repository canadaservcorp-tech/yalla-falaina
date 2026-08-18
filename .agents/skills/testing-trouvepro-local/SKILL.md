---
name: testing-trouvepro-local
description: How to run and browser-test the TrouvePro Express + Supabase app locally (RBQ seed/claim flow, chat, security hardening: CSP, rate limits, validation). Use when asked to E2E/UI test TrouvePro without touching production.
---

# Local E2E testing of TrouvePro

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
verify 40/15min, claim 20/h, write 60/min, upload 20/h, report 20/h, global /api 1000/15min.
Budget adversarial loops accordingly — a login-rate-limit probe burns the credential bucket
for 15 minutes for that email/IP pair, so use a throwaway email like
`ratelimit-probe@example.com` and do it last.

## Known issues to re-check (may still be broken)
- A ~2000-char single-word message renders unwrapped and causes page-wide horizontal
  overflow in the chat thread (server correctly truncates the body to 2000 chars).
  A `overflow-wrap:anywhere` on the bubble would likely be the fix.
- Report modal offers `harassment` / `scam`, but the backend whitelist is
  `['sexual','abuse','other']`, so those are silently stored as `other`.
- Oversized text inputs are silently truncated server-side (bio 5000 → 1000 chars) with no
  user-facing notice; validate that this is intended rather than a bug.

## Devin Secrets Needed
None for local testing. Production/deploy work would need `RAILWAY_API_TOKEN`; live-account
testing used mail-verified accounts under `canada.servcorp+...@gmail.com`.
