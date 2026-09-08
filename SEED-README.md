# TrouvePro — RBQ Seeding (dummy listings that go live on claim)

Pre-loads RBQ licence-holders as UNCLAIMED provider listings so the proximity map
is full from day one. They show with the "Licensed RBQ" badge but locked (not
contactable). When the real owner registers as a provider and CLAIMS the listing,
it transfers to their account; once they set location + subscribe, it's fully live.

## Files
- schema-seed.sql          -> adds providers.claimed, providers.source, users.is_seed
- seed-rbq.sql             -> 400 unclaimed Laval RBQ listings (scattered coords)
- search-function-v2.sql   -> REPLACES Phase 1 search_providers (adds claimed + contactable)
- routes/claim.js          -> /api/claim (find + claim a listing)

## Run order (Supabase SQL editor)
1. schema-seed.sql
2. search-function-v2.sql   (replaces the old search function)
3. seed-rbq.sql             (imports the dummy listings)

## Wire server.js
    app.use('/api/claim', require('./routes/claim'));

## How it behaves
- Search now returns `claimed` and `contactable` per provider.
  - Unclaimed RBQ seed: shows on the map with the RBQ badge, contactable=false ->
    frontend shows "Unclaimed — is this you? Claim your profile".
  - Claimed + subscribed (or paywall off): contactable=true -> chat button works.
- Claim flow: provider registers -> GET /api/claim/search?q=Company -> POST /api/claim {seedUserId}
  -> their account gets the licence + services; placeholder is deleted.

## Load ALL 2761 (instead of 400)
Re-generate seed-rbq.sql with LIMIT raised, or ask to produce the full file.
Coordinates are approximate (scattered across Laval); the real owner sets exact
location when they claim + edit — so seeds are demo density, not precise pins.

## Important
- Seeds use placeholder emails ending @trouvepro.invalid — they cannot log in or receive mail.
- Because this lists real public businesses, add a visible "not affiliated / claim or
  request removal" note and honour removal requests (privacy/CASL good practice).
