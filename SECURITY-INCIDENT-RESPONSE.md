# Security incident response

What to actually do if you suspect Yalla Nsafer has been compromised —
a leaked credential, a hacked admin account, suspicious activity in the
logs, or anything else that makes you think someone unauthorized has
access. Read the "First, orient yourself" section even mid-panic — it
tells you which of the levers below actually fits what you're seeing.
Nothing in here requires you to write code; every step is either an
environment variable + redeploy, a dashboard action, or a SQL statement
you paste into the Supabase SQL editor.

## Before you need this: two things worth doing now

1. **Bookmark your Railway project, Supabase project, and PayPal/Stripe
   dashboards.** Every lever below assumes you can get into these
   quickly. If you're not sure you still have access to all three,
   check today, not during an incident.
2. **Know that you have two "outside the app entirely" master keys
   already**: your Railway account (controls every environment
   variable and can redeploy or stop the service outright) and your
   Supabase account (full read/write access to every table, no app
   code involved). Nothing in this app should ever need a secret
   "backdoor code" stored inside itself — a stored master key is just
   one more thing that could leak. These two dashboards already are
   your ultimate recovery path; everything below is about using them
   fast and precisely.

## First, orient yourself

| What you're seeing | Likely scenario | Jump to |
|---|---|---|
| An admin action you didn't take (a listing approved/rejected you don't recognize) | Compromised admin account or leaked admin password | §1 |
| Unexplained signups, spam, or API traffic | Abuse, not necessarily a breach | §2 |
| You typed `JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, or `PAYPAL_CLIENT_SECRET` somewhere it shouldn't have gone (a public repo, a chat, a screenshot) | Leaked credential | §3 |
| You're not sure yet, but you want to stop everything while you figure it out | Any of the above, unconfirmed | §4 |
| The incident is over and you want to lift the emergency measures | — | §5 |

## §1. Compromised admin account

An admin account controls `routes/admin-informal-listings.js` — approving
a submission there publishes it as a real job listing to every seeker.

1. **Lock the account immediately, from Supabase, not the app** (SQL
   editor → run):
   ```sql
   update public.users set banned = true where email = 'the-admin-email@example.com';
   ```
   `lib/security.js`'s `requireActiveUser` re-checks `banned` from the
   database on every authenticated request (cached at most 30 seconds),
   so this takes effect within moments even if the attacker's session
   token is still technically unexpired — no code change or redeploy
   needed for this step.
2. **Force out every currently-issued token app-wide** (not just this
   account's) if you don't know how the account was compromised, or if
   you suspect `JWT_SECRET` itself might be exposed — see §3's step 1.
   If you're confident it's just this one account's password, step 1
   alone is enough; you don't have to log out every seeker over it.
3. **Turn on two-factor authentication for the account** once you've
   re-secured it (Admin console → Security tab → Enable two-factor
   authentication) — this is exactly the gap that made a leaked
   password alone sufficient in the first place.
4. **Review what the account did.** Every approval/rejection is
   recorded on `informal_listing_submissions` (`reviewed_by`,
   `reviewed_at`, `review_status`). In Supabase:
   ```sql
   select id, title, review_status, reviewed_by, reviewed_at
   from public.informal_listing_submissions
   where reviewed_by = '<the compromised account\'s user id>'
   order by reviewed_at desc;
   ```
   Anything approved that shouldn't have been: find the resulting
   `jobs` row (`external_source = 'informal_submission'` and
   `external_id` = the submission's id) and set `status = 'expired'`
   on it to pull it from the live feed without deleting the record.
5. **Unban once you've reset the password and confirmed 2FA is on**:
   `update public.users set banned = false, ... ` — reset the password
   hash too (you can't set a plaintext password directly; easiest is
   to have the account holder use a password-reset flow if one exists,
   or delete and have them re-register with a new email if this
   happened before a reset flow was built).

## §2. Unexplained signups, spam, or unusual traffic

Most of this is already bounded by `lib/security.js`'s rate limits
(per-IP registration cap, IP+email login cap, per-account lockout after
repeated failures — `schema.sql`'s `record_login_result()`). If it's
getting through anyway:

- **Block a specific email from ever registering again**:
  ```sql
  insert into public.banned_emails (email) values ('someone@example.com');
  ```
- **Ban an existing account**: `update public.users set banned = true where email = '...'`.
- **If it's a flood from one IP/network and the rate limits aren't
  keeping up**, that's a job for Railway's or Cloudflare's own
  IP-level blocking (outside this app), not a code change here.

## §3. A credential leaked

Which credential decides how far this spreads:

1. **`JWT_SECRET` leaked or you're not sure**: rotating the secret
   alone would silently invalidate every session on its own (a JWT
   signed with the old secret fails signature verification against the
   new one) — but if the attacker used the OLD secret to mint their own
   forged token, rotating `JWT_SECRET` already defeats that too, since
   their forged token was signed with the compromised value. Rotate it:
   ```
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
   Set the result as `JWT_SECRET` in Railway and redeploy. Every real
   user is logged out and has to sign in again — expected and fine.
   You generally do NOT also need `AUTH_MIN_ISSUED_AT` for this specific
   case (rotating the secret already invalidates everything); that lever
   is for the cases below where the secret itself isn't what's leaked.

2. **A specific user's JWT (not the secret) leaked** — e.g. you saw a
   token in a log line or a screenshot: set `AUTH_MIN_ISSUED_AT` in
   Railway to the current time (any ISO timestamp `new Date().toISOString()`
   would produce) and redeploy. `lib/auth-mw.js` rejects any token
   issued before that moment, for every account, immediately on the
   next request after redeploy. This is blunter than revoking one
   token (there's no way to revoke a single JWT without a server-side
   session table, which this app doesn't have) but it's instant and
   needs no code change — everyone just has to log in again.

3. **`SUPABASE_SERVICE_ROLE_KEY` leaked**: this key bypasses every RLS
   policy — treat it as full database read/write access in the wrong
   hands. In the Supabase dashboard: Project Settings → API → roll the
   service role key, then update `SUPABASE_SERVICE_ROLE_KEY` in Railway
   and redeploy. While you're in there, check Supabase's own database
   logs for queries you don't recognize.

4. **`STRIPE_SECRET_KEY` or `PAYPAL_CLIENT_SECRET` leaked**: roll them
   from the Stripe/PayPal dashboard directly (both have a "roll key" /
   "regenerate secret" action), update the Railway env var, redeploy.
   Check the Stripe/PayPal dashboard's own recent-activity log for
   charges or payouts you don't recognize — this app's webhook
   signature verification (`routes/subscription.js`) means an outside
   attacker can't forge a webhook call even with this key, but a
   leaked key does let them make real API calls as your account.

5. **`RESEND_API_KEY` leaked**: lower stakes (it can send email as
   your domain, nothing more) — roll it in the Resend dashboard,
   update Railway, redeploy, at your convenience rather than urgently.

## §4. "Stop everything while I figure out what happened"

Set `SITE_LOCKDOWN=true` in Railway and redeploy. Every `/api` route
except `/api/health` immediately returns `503` — the whole app stops
doing anything (no logins, no signups, no concierge turns, no payment
webhooks processed) while still confirming to you (and to any uptime
monitor) that the service itself is up and deliberately paused, not
crashed. Nothing is deleted, no data is touched — lifting it is just
clearing the variable and redeploying again (§5).

Combine with `AUTH_MIN_ISSUED_AT` (§3.2) if you also want every
existing session dead the moment you lift the lockdown, rather than
merely paused.

## §5. Standing back up afterward

1. Clear whichever of `SITE_LOCKDOWN` / `AUTH_MIN_ISSUED_AT` you set,
   and redeploy. (Leaving `AUTH_MIN_ISSUED_AT` set to a fixed past
   timestamp forever is harmless — it just stops mattering once every
   real session was issued after it anyway — but clearing it is
   cleaner.)
2. Confirm `/api/health` responds normally again.
3. Re-check `npm audit` — `package.json` pins dependency versions, and
   a real incident is a good prompt to also check whether anything
   upstream has a newly-disclosed vulnerability since this file was
   last touched.
4. If you rotated `JWT_SECRET`, every user (seeker or admin) needs to
   log in again — this is expected, not a bug to fix.
5. Write down what happened while it's fresh: what you saw, when, what
   you changed, and in what order. You don't need a formal process for
   this — a dated note in this repo or your own files is enough, and
   it's what makes the NEXT incident faster to handle.

## What this app does NOT have (and why that's the honest answer)

There is no "master recovery code" stored inside the application
itself, and there deliberately never should be — a secret that lives
inside the app is just one more thing that can leak the same way any
other credential can. The real recovery path is always your Railway
and Supabase accounts, which is why "Before you need this" above is
worth doing now, not during an incident.

There is also no password-reset self-service flow yet (only
registration, email verification, and login exist today) — if a
non-admin seeker is locked out, direct database intervention (clearing
`locked_until` and, if truly necessary, setting a fresh
`password_hash`) is the only way back in short of building that flow.
