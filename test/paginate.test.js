// lib/paginate.js is what schema.sql's cousins document-retention.js,
// subscription-lapse.js, and profile-retention.js all now use instead of one
// unbounded .select() -- see that file's own comment for why a single
// .select() can silently truncate. This file tests fetchAllPages() in
// isolation, with a plain stub queryFactory (no DB mock needed): it's a pure
// paging loop over whatever { data, error } promises it's handed.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const paginate = require('../lib/paginate');

const originalPageSize = paginate.PAGE_SIZE;
beforeEach(() => { paginate.PAGE_SIZE = originalPageSize; });

test('a single page shorter than PAGE_SIZE stops after one request', async () => {
  paginate.PAGE_SIZE = 10;
  let calls = 0;
  const { data, error } = await paginate.fetchAllPages(async (from, to) => {
    calls++;
    assert.equal(from, 0);
    assert.equal(to, 9);
    return { data: [{ id: 1 }, { id: 2 }], error: null };
  });
  assert.equal(error, null);
  assert.deepEqual(data, [{ id: 1 }, { id: 2 }]);
  assert.equal(calls, 1);
});

test('a page exactly PAGE_SIZE long is followed by another request, proving it does not stop early on a full page', async () => {
  paginate.PAGE_SIZE = 2;
  const pages = [
    [{ id: 1 }, { id: 2 }],   // full page — must not be mistaken for "last page"
    [{ id: 3 }],              // short page — the real end
  ];
  const seen = [];
  const { data, error } = await paginate.fetchAllPages(async (from, to) => {
    seen.push([from, to]);
    return { data: pages.shift(), error: null };
  });
  assert.equal(error, null);
  assert.deepEqual(data, [{ id: 1 }, { id: 2 }, { id: 3 }]);
  assert.deepEqual(seen, [[0, 1], [2, 3]]);
});

test('exactly N full pages then an empty page correctly ends without an off-by-one extra row', async () => {
  paginate.PAGE_SIZE = 2;
  const pages = [[{ id: 1 }, { id: 2 }], [{ id: 3 }, { id: 4 }], []];
  const { data } = await paginate.fetchAllPages(async () => ({ data: pages.shift(), error: null }));
  assert.deepEqual(data, [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
});

test('no rows at all resolves to an empty array, not null or an error', async () => {
  paginate.PAGE_SIZE = 500;
  const { data, error } = await paginate.fetchAllPages(async () => ({ data: [], error: null }));
  assert.equal(error, null);
  assert.deepEqual(data, []);
});

test('an error on any page stops immediately and is returned, discarding whatever pages came before it', async () => {
  paginate.PAGE_SIZE = 2;
  let calls = 0;
  const { data, error } = await paginate.fetchAllPages(async () => {
    calls++;
    return calls === 1
      ? { data: [{ id: 1 }, { id: 2 }], error: null }
      : { data: null, error: { message: 'connection refused' } };
  });
  assert.equal(data, null);
  assert.equal(error.message, 'connection refused');
  assert.equal(calls, 2); // didn't keep paging past the failure
});

test('a null data page (not an empty array) is treated as zero rows, not a crash', async () => {
  paginate.PAGE_SIZE = 500;
  const { data, error } = await paginate.fetchAllPages(async () => ({ data: null, error: null }));
  assert.equal(error, null);
  assert.deepEqual(data, []);
});
