# Going live on Yalla Nsafer

This is the sequence for the day the founder flips the switch — moving
from a working preview deploy (`PAYWALL_ENFORCED=false`) to a real,
paying-customer launch. `DEPLOY.md` is how you stand the service up in
the first place; this is the shorter checklist for the specific moment
you turn payment enforcement on. Read top to bottom, in order — later
steps assume earlier ones are done. Nothing here requires touching code.

## Before you start

You'll need to be logged into: Railway (or wherever the service is
hosted), the PayPal business account, the Stripe account (only if
Stripe is enabled), and the domain registrar/DNS panel if the domain
isn't already pointed at the host.

## 1. Set every required credential

Open `DEPLOY.md`'s environment-variable table and go down it. By this
point in the project everything marked "yes" should already be set from
the preview deploy — this step is a re-check, not a first-time setup.
The one credential group that's specifically easy to leave stale is
PayPal/Stripe if a plan or webhook was ever re-created:

- `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` — from the live (not
  sandbox) PayPal app.
- `PAYPAL_ENV=live` — not `sandbox`.
- `PAYPAL_PLAN_ID` — from the most recent `npm run paypal:setup` run.
  If you re-run that script for any reason, the plan ID it prints
  replaces whatever's currently set here.
- `STRIPE_SECRET_KEY` — the `sk_live_...` key, not `sk_test_...` (if
  Stripe is enabled at all — it's optional, PayPal-only is a valid
  launch).

## 2. Verify `/api/health` before touching the paywall flag

With the service running on its real production URL:

```
curl -s https://<your-domain>/api/health | jq .
```

Every flag should read `true`: `concierge`, `paypal`, `email`, and
`stripe` (only if you're using it — leave it `false` if you deliberately
didn't set `STRIPE_SECRET_KEY`, that's a supported launch configuration).
`jobsFeed` should say `adzuna` or `jooble` — if it says `seed`, stop:
that means the job feed is still demo data, not a real listings source,
and launching on it would show job seekers fake postings.

`paywall` will still read `false` here — that's expected, you haven't
flipped it yet. This step exists to make sure everything else is
healthy *before* you turn on the one flag that will start actually
charging your seekers, so a below-integration problem doesn't get
discovered by an angry customer instead of by you.

## 3. Flip the paywall on

Set `PAYWALL_ENFORCED=true` on the host's environment-variable panel and
redeploy. Re-run the health check — `paywall` should now read `true`.

What this actually changes: seekers whose profile is complete get 3 free
concierge replies (teased job info — real titles/cities, redacted
requirements and application links), and after that the concierge
returns "subscription required" until they pay. Profile intake itself
is never paywalled, at any point — a seeker can always answer the
onboarding questions for free.

## 4. Confirm the domain and webhooks all point at the same, final URL

This only matters if `PUBLIC_URL` changed since the last time the
PayPal/Stripe webhooks were registered (e.g. you moved off a Railway
preview URL onto your real domain). If it didn't change, skip to step 5.

If it did change:

- **PayPal:** re-run `npm run paypal:setup` with `PUBLIC_URL` set to the
  final domain. It reuses the existing product/plan and only re-points
  the webhook — copy the `PAYPAL_WEBHOOK_ID` it prints into the env vars
  if it differs from what's already set. The script refuses to run
  against a non-`https://` URL, so if it errors out here, `PUBLIC_URL`
  itself is the thing to fix first.
- **Stripe** (if enabled): in the Stripe Dashboard, update the webhook
  endpoint's URL to `https://<final-domain>/api/subscription/stripe/webhook`,
  or add a new endpoint and delete the old one. If you add a new one,
  its signing secret is different — update `STRIPE_WEBHOOK_SECRET`.

## 5. Smoke test with a real (small) transaction

Do this yourself, as a real user, before telling anyone the platform is
live:

1. Sign up fresh (a real email you can check), confirm the verification
   email arrives and the link works.
2. Complete profile intake conversationally — answer every question the
   concierge asks, then explicitly confirm when it summarizes back to
   you. Check that it never suggests a specific job or sector while
   still in intake.
3. Send your first 3 messages after intake completes — confirm you see
   real (but redacted) job info and a prompt to subscribe, not a paywall
   block yet.
4. Send a 4th message — confirm you now get the "subscription required"
   response.
5. Subscribe with a real card (PayPal or Stripe, whichever you're
   testing) for one billing cycle. Confirm the checkout redirect works
   and, immediately after, that the concierge gives you full (non-teased)
   job info with no more paywall block.
6. Cancel the subscription from `/api/subscription/cancel` (or however
   the front end exposes it) and confirm the cancellation actually goes
   through with your payment provider, not just in the app's database.
7. Check that both the sign-up and any transactional emails you triggered
   above actually look right — sender name, subject line, and that they
   render sensibly in an actual inbox, not just in the dev-mode log.

If anything in this list doesn't do what's described, don't consider the
launch done — go back and fix it before real seekers start signing up.

## 6. One thing to close out before or shortly after launch

`public/terms.html` is explicitly marked "Draft for review" in its own
text — it was written to match how the platform actually operates, but
it has not been reviewed by a lawyer yet, and that page says so directly
to anyone who reads it. Before or very soon after launch, get it (and
`privacy.html`) in front of counsel for governing law, consumer-protection,
and Law 25 / PIPEDA compliance in whatever markets you're actually
serving, then remove the draft notice once it's been reviewed.

## What this runbook deliberately doesn't cover

Business decisions that are yours alone and outside this checklist:
which markets/currencies to actually launch in, pricing changes, when to
announce publicly, and how much traffic to expect on day one (the
service itself doesn't do anything special to prepare for a launch
traffic spike beyond what's already running).
