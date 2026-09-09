'use strict';

// Supabase/PostgREST caps how many rows a single request returns (the
// project's db-max-rows setting, commonly defaulting to 1000) -- a scheduled
// job that does one unbounded `.select()` over an unknown number of "due"
// rows can silently get back fewer rows than actually match once that cap is
// hit, with no error to signal it happened. scripts/document-retention.js,
// scripts/subscription-lapse.js, and scripts/profile-retention.js all list
// their work this way with no upper bound on how many rows can be due at
// once (every seeker whose retention deadline or cancel date has passed
// since the last run), so all three page through `.range()` via this helper
// instead of trusting one `.select()` to return everything.
const paginate = {
  // Mutable (not a `const` default param) so a test can shrink it and
  // exercise the multi-page loop with a handful of rows instead of needing
  // to fabricate hundreds of fixture rows to cross a real page boundary.
  PAGE_SIZE: 500,

  // `queryFactory(from, to)` must return a promise resolving to a Supabase
  // { data, error } result already narrowed to that row range via
  // `.range(from, to)` -- the caller owns the rest of the query chain
  // (`.select()`/`.eq()`/`.lte()`/...), this only owns the paging loop.
  // Stops as soon as a page comes back shorter than the page size (including
  // empty) -- the only reliable "no more rows" signal PostgREST gives, since
  // a full-length final page and a truncated one look identical otherwise.
  async fetchAllPages(queryFactory) {
    const all = [];
    let from = 0;
    for (;;) {
      const size = paginate.PAGE_SIZE;
      const { data, error } = await queryFactory(from, from + size - 1);
      if (error) return { data: null, error };
      const page = data || [];
      all.push(...page);
      if (page.length < size) break;
      from += size;
    }
    return { data: all, error: null };
  },
};

module.exports = paginate;
