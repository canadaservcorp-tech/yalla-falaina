# Yalla Nsafer — Build Brief for Devin

Answering your three options directly, plus a steer from Hicham after you asked: **maximize reuse of the existing myTROUVEpro (trouvepro) codebase — it's ready, don't rebuild what already works.**

## The decision

**Fork trouvepro's actual codebase as the literal starting point for a new repo/deployment** — not option 3's "build from zero," and not literally running Yalla Nsafer inside the same live trouvepro app either. This is the one place I'm keeping a piece of the original recommendation instead of a pure fork-in-place: Yalla Nsafer's compliance surface (immigration/asylum guidance, GCC/kafala risk disclosure, CV and passport handling, sanctions screening for Syria-based users) is different enough from a Quebec proximity-services marketplace that the two products should stay separate deployments and separate databases — a bug, breach, or legal issue in one shouldn't touch the other. Everything else bends toward reuse, per Hicham's steer.

**Before forking — please confirm which repo is actually canonical.** Notes on this from earlier work mention both a GitHub repo (`canadaservcorp-tech/MYTROUVEPRO`) and a GitLab repo (`canada.servcorp/trouvepro-phase1`) at different points in the rebuild history. You'll know which one is the real current source behind the live Railway app — fork that one, not the older/messier history.

## What to fork and reuse directly (this is most of the value)

1. **Express + Supabase + Railway skeleton** — server.js structure, Supabase client setup, env-var conventions, Railway deploy config. Copy as-is, then extend.
2. **Auth/signup scaffolding** (email verification flow) — reuse directly. Extend the profile fields with what Section 10 of the idea-configuration doc needs on top: hard 18+ age gate, preferred language/dialect, preferred country (a weighting signal, never a hard filter), sector/role interest.
3. **The existing AI concierge integration — the single biggest reuse win.** trouvepro already has a working FR/EN chat widget wired to the Anthropic API, a "connector, not verifier" system-prompt pattern, and a `concierge_events` logging table. Don't rebuild this integration — extend it:
   - Swap trouvepro's simpler system prompt for the Yalla Nsafer one — already written, tested, and shipped separately in `/prototype` in this handoff (see below).
   - Grow `concierge_events` into full conversation logging. trouvepro's version logs intent only; Section 6.2 of the config doc requires a durable log of what the bot actually told each user, since that log is the platform's protection if a bad-advice claim ever surfaces. `schema.sql` below has the fuller `concierge_conversations` / `concierge_messages` tables for this — same idea, more complete.
4. **Photo/document handling pattern** — Supabase Storage, URL-only in Postgres (never raw files in the DB), client-side compression, short retention windows. Reuse this exact pattern for CV uploads, screenshots (fraud-checker), and eventually voice notes.
5. **Google Vision SafeSearch integration** — reuse directly as an extra moderation pass on anything a user uploads, layered under the AI's own fraud-pattern checking rather than replacing it.
6. **Operational hygiene** — the Railway env-var + key-rotation discipline already established for trouvepro carries over unchanged.

## What needs real changes, even inside the forked code

1. **Payments.** trouvepro's codebase currently has Stripe removed and is PayPal-only (a decision made for that product specifically). Yalla Nsafer's own payments research (Sections 12–13) found PayPal only covers part of the target audience (Egypt, Gulf diaspora) — Lebanon needs Whish Money, and Iraq/Jordan need their own local-rail research. Please confirm whether "no Stripe" was a trouvepro-specific call or an account-level rule that also binds this repo, since Stripe barely reaches this region anyway (only the UAE), so it may be moot either way — but worth confirming rather than assuming.
2. **The matching engine.** trouvepro matches by GPS/proximity distance. Yalla Nsafer matches by skill/keyword against a licensed job feed (Adzuna/Jooble/Careerjet/Talent.com/Job Bank — never scraped, per Section 6.1). This is new logic, not a fork — a working reference implementation is included in `/prototype`.
3. **Revenue/subscription shape.** trouvepro is free-for-seekers, providers-pay. Yalla Nsafer is seeker-subscription tiers ($10/$25/$40/$100, Section 4.3) plus a B2B marketplace (Section 4.4) — a different billing shape needing its own tier + daily fair-use-quota logic (see the `daily_usage` table in `schema.sql`), not trouvepro's simpler provider-subscription toggle.
4. **RBQ badge and booking-with-authorization-hold** — don't apply here at all; skip.
5. **Data model** — additive, not reused: the tables in `schema.sql` are new and specific to this product, written in the same Postgres/Supabase conventions you already used on trouvepro so they sit naturally alongside whatever `profiles`/auth setup gets forked over.

## Starting point already built and tested — `/prototype` in this handoff

A working Node/Express prototype of the AI concierge core ships alongside this brief. It's already been run end-to-end (the matching logic was tested live, including catching and fixing a false-positive keyword match before shipping). It encodes, as actual working code rather than just a spec:
- The full guardrail system prompt (`lib/systemPrompt.js`) — protective-mindset-first, connector-not-advisor, retrieve-don't-recall for both job facts and legal/visa/asylum facts, the age gate, proactive scam-caution, and scripted handling for the doc's hardest questions (no money, no passport, asylum, sex-work requests).
- A "code decides the candidate set, the model never invents one" matching pattern (`lib/matching.js`) over a small mock job dataset (`data/jobs.json`), including a deliberately-labeled "informal/unverified" listing type.
- A working chat UI (`public/index.html`) — dialect selector, RTL support, live job-match panel.

**Your job is not to redesign this logic — it already reflects the config doc's guardrails and has been tested.** Your job is to graft it onto the forked trouvepro infrastructure:
1. Move the concierge logic into the forked repo's structure, in place of (or alongside, if you want a soft cutover) trouvepro's existing concierge code.
2. Replace `lib/matching.js`'s mock `data/jobs.json` query with a real query against the new `jobs` table (see `schema.sql`), populated by a scheduled job pulling from a licensed job-aggregator API.
3. Wire the `concierge_conversations`/`concierge_messages` logging from `schema.sql` into every turn.
4. Add subscription-tier gating in front of the chat endpoint once the tier/payment logic exists.

See `README.md` inside `/prototype` for how to run it standalone in the meantime.

## Database schema — `schema.sql` in this handoff

New tables only, written to sit alongside whatever `profiles`/auth already exists from the fork: `seeker_profiles` (structured CV/intake data, all four intake paths converge here), `document_uploads` (short-retention pointers to Supabase Storage, never raw files in Postgres), `jobs` (licensed-feed cache, replaces the prototype's JSON file), `informal_listing_submissions` (the moderated "shawarma master, urgent" pattern), `concierge_conversations` + `concierge_messages` (full logging per 6.2), `daily_usage` (fair-use quota tracking), and `b2b_partners` (Phase 2, included now to avoid a breaking migration later). Row Level Security is scoped to the owning user on everything personal; the backend's service-role key handles legitimate server-side reads.

## Phase 1 MVP scope (Section 7 of the idea-configuration doc)

1. Fork + strip trouvepro-specific features (RBQ badges, GPS matching, booking/auth-hold) out of the working copy.
2. Apply `schema.sql` on top of the forked database (new Supabase project, not the live trouvepro one).
3. Graft the `/prototype` concierge in, wired to the new `jobs` table and real logging.
4. Add one real licensed job-API integration (recommend starting with whichever of Adzuna/Jooble/Careerjet/Talent.com/Job Bank has the fastest approval — Job Bank's Canada-only feed is the simplest single-country start per the doc's own open-questions list).
5. Add the signup flow with the age gate and required-field profile completeness gate (Section 10).
6. Add one subscription tier ($25 Basic is the simplest single-tier launch) with PayPal, since that already works in the forked payment code for the audiences it covers.

Explicitly out of scope for Phase 1, per the doc's own phasing: voice messages, CV upload/parsing, B2B marketplace, travel booking, and the GCC/Iraq + Zone tracks (each needs its own sourcing/legal homework per Sections 6.5 and the open-questions list) — those are Phase 2+.

## Environment variables needed (new, on top of whatever trouvepro's fork already sets)

```
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=            # optional, defaults to a current Claude Sonnet model
JOB_API_KEY=                # whichever licensed provider is chosen first
JOB_API_PROVIDER=           # 'adzuna' | 'jooble' | 'careerjet' | 'talent_com' | 'job_bank'
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

(PayPal/Whish keys reuse whatever pattern trouvepro's fork already establishes for payment credentials.)
