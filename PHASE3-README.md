# TrouvePro — Phase 3 (Chat Photos + Moderation)

Drop into the `trouvepro` repo AFTER Phase 2 (needs the conversations table).
Adds ephemeral chat photos, automatic nude/explicit detection, and a report->block flow.

## Files
- schema-phase3.sql   -> run in Supabase (chat_photos, reports)
- lib/moderation.js   -> SafeSearch check + block/forfeit/email-ban
- routes/photos.js    -> upload (max 3, moderated, ephemeral) + wipe-on-close
- routes/report.js    -> report content + admin moderation queue

## 1. Supabase
- Run schema-phase3.sql
- Storage -> New bucket named "chat-photos" (private is fine; the code uses public URLs — switch to signed URLs later if you want them locked)

## 2. Wire server.js (add)
    app.use('/api/chat', require('./routes/photos'));   // adds /:id/photos to the chat router path
    app.use('/api/report', require('./routes/report'));

## 3. Env vars
    GOOGLE_VISION_API_KEY=   # Google Cloud -> Vision API key (SafeSearch). If unset, images are NOT checked (dev only!)

## Enforcement (matches your Terms §7)
- On upload, the image is checked. If explicit -> user is BLOCKED, subscription
  FORFEITED (no refund), email added to banned_emails (can't re-subscribe).
- Photos are EPHEMERAL: the frontend must call DELETE /api/chat/:id/photos when the
  chat page closes (e.g. window 'pagehide'/'beforeunload'). All photos are then wiped.
- Because photos vanish on close, users must report while the chat is OPEN.

## Client-side (frontend TODO, add to index.html chat screen)
- Before upload: compress to ~1200px / ~80% quality, cap file size, and run NSFWJS
  (browser, free) as a first filter. Then POST the base64 to /api/chat/:id/photos.
- Cap to 3 photos in the UI. Call DELETE .../photos on 'pagehide'.

## First admin
- Set a user to admin in Supabase: update public.users set role='admin' where email='you@example.com';
