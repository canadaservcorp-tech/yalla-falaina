-- Favorites: the table already exists in schema.sql; this only speeds up the per-seeker list.
create index if not exists favorites_seeker_idx on public.favorites(seeker_id);
