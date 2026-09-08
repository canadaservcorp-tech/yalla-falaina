# Yalla Falaina — Concierge Prototype

A working demo of the AI concierge chat ("Your Assistant to Travel") described in the idea-configuration doc, Section 4.3. Trilingual, dialect-aware, matched against a small mock job dataset. **This is a prototype, not the product**: no accounts, no payments, no real job feed, no live legal-fact retrieval, no database.

## What this does and doesn't do

Does:
- A real chat UI backed by the Claude API (Anthropic), with a system prompt encoding the guardrails from the doc: protective mindset, connector-not-advisor, retrieve-don't-recall for job facts, the age gate, scam-caution behavior, and scripted handling for the hardest questions (no money, no passport, asylum, sex-work requests).
- A simple keyword-matching engine (`lib/matching.js`) over a 12-listing mock job dataset (`data/jobs.json`) spanning the Western track, the GCC/Iraq track, and Zone/local + corridor listings — including one deliberately-labeled "informal/unverified" listing (the shawarma-master example from the doc) to demonstrate how those get flagged differently.
- Runs in "demo mode" with no API key at all — the matching engine still works and the UI still responds, just without a real conversational reply, so you can see the retrieval layer on its own.

Doesn't do (by design, for this prototype):
- No subscriptions, tiers, or payment processing (Section 4.3/5 in the main doc).
- No real licensed job-API integration (Adzuna/Jooble/Job Bank/etc. — Section 6.1) — `data/jobs.json` is hand-written mock data.
- No live retrieval from government sites for visa fees, processing times, citizenship rules, or asylum deadlines — the system prompt explicitly tells the model to say so and never guess a number (see the note in `lib/systemPrompt.js`).
- No voice messages, photo/screenshot upload, CV parsing, or B2B marketplace yet — those are the natural next slices once this core loop is validated.
- No database/persistence — conversation history lives only in the browser tab's memory and is lost on refresh.

## Setup

```bash
cd yalla-falaina-prototype
npm install
cp .env.example .env
# edit .env and paste your own Anthropic API key into ANTHROPIC_API_KEY
npm start
```

Then open `http://localhost:3000`.

Without an API key, the server still starts and the UI still works — `/api/chat` returns the raw matched-jobs list with a note instead of a generated reply.

## Trying it out

A few messages worth testing, taken straight from the doc's own examples:
- `I want to travel but I don't have money, what's the solution?`
- `laik badi sefir w ma m3i masari, shu l 7al` (Arabizi)
- `3andi khibra b shawarma` — should surface the Ghana listing, labeled as an unverified/informal source
- `cherche un poste d'électricien au Canada`
- `I have no passport and no money to travel` — should pivot to a Zone/local listing
- `I want to arrive and claim asylum and get government assistance` — should trigger the highest-guardrail response and explicitly decline to state specific deadline numbers
- Try switching the dialect selector and see the reply direction (RTL) and tone shift

## Project structure

See the file manifest below for what each file does and how big it is.

## Where this goes next

The natural next slices, roughly in the order the main doc's Section 7 phasing suggests:
1. Swap `data/jobs.json` for a real licensed job-API integration.
2. Add the signup/subscription data model (Section 10) and a real database (Supabase, per Section 8's tech-stack note).
3. Add photo/screenshot upload and CV parsing (Section 4.3/4.5).
4. Add voice messages and the voice-to-CV path.
5. Wire live retrieval for visa/citizenship/asylum facts instead of the "can't confirm in this prototype" fallback.
