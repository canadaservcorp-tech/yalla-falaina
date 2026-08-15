# TrouvePro — Phase 1 (Proximity Engine)

Backend + database for the core: seeker/provider accounts, email verification,
bilingual service catalog, provider profiles with location + up to 4 services,
and NEAREST-FIRST proximity search with radius filter and privacy-safe distance.

## Setup
1. `npm install`
2. `cp .env.example .env` and fill it (generate JWT_SECRET; add Supabase URL + service_role key).
3. Supabase SQL editor, run in order:
   - `schema.sql`
   - `seed-professions.sql`
   - `search-function.sql`
4. `npm start`

## Try it
- Register:  POST /api/auth/register  { email, password, name, role: "provider" }
- Verify:    click the link (printed to server console in dev).
- Login:     POST /api/auth/login  -> returns a JWT.
- Provider:  PUT /api/providers/me  (Bearer token) { lat, lng, city, languages:["fr","en"], services:[id,id] }
- Search:    GET /api/search?lat=45.57&lng=-73.75&radius_km=5&lang=fr

## Notes
- PAYWALL_ENFORCED=false shows all providers now; set true to show only subscribed.
- Distance is returned as an approximate label only (privacy for home-based providers).
- Stripe subscription routes + chat + booking come in later phases.
