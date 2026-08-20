// Minimal mock of the Supabase client that db.js exports.
// Stubs the query-builder chain (.from().select().eq().maybeSingle()/.single()/.order()...)
// Each builder resolves LAZILY, so tests can set results after app load.
function createMockDb() {
  const results = {};                                     // table -> { data, error }
  const queues = {};                                      // table -> [{ data, error }] consumed in order
  const opResults = {};                                   // `${table}.${op}` -> { data, error }
  const writes = [];                                      // { table, op, payload } in call order
  const rpcCalls = [];                                    // { name, args } in call order
  const rpcResults = {};                                  // name -> { data, error }

  const readFor = table => (queues[table] && queues[table].length)
    ? queues[table].shift()
    : (results[table] || { data: null, error: null });

  function makeBuilder(table) {
    const b = {};
    let op = 'select';
    ['select', 'eq', 'neq', 'or', 'ilike', 'in', 'gte', 'lte', 'gt', 'lt',
      'contains', 'match', 'order', 'limit', 'range'].forEach(m => { b[m] = () => b; });
    ['insert', 'update', 'upsert', 'delete'].forEach(m => {
      b[m] = payload => { op = m; writes.push({ table, op: m, payload }); return b; };
    });
    const result = () => opResults[table + '.' + op] || readFor(table);
    b.maybeSingle = () => Promise.resolve(result());        // terminal
    b.single = () => Promise.resolve(result());             // terminal
    b.then = (resolve, reject) => Promise.resolve(result()).then(resolve, reject); // awaitable
    return b;
  }

  const client = {
    from(table) { return makeBuilder(table); },
    rpc(name, args) {
      rpcCalls.push({ name, args });
      return Promise.resolve(rpcResults[name] || { data: [], error: null });
    },
    storage: {
      from() {
        return {
          upload: async () => ({ data: { path: 'p' }, error: null }),
          remove: async () => ({ data: [], error: null }),
          getPublicUrl: () => ({ data: { publicUrl: 'http://mock/photo.jpg' } }),
        };
      },
    },
    // --- test controls (ignored by app code) ---
    __set(table, result) { results[table] = result; },
    // sequential reads of the same table (e.g. a lookup then a list)
    __queue(table, ...seq) { queues[table] = (queues[table] || []).concat(seq); },
    // make a specific write fail: __setOp('reviews', 'insert', { error: {...} })
    __setOp(table, op, result) { opResults[table + '.' + op] = result; },
    __writes(table, op) { return writes.filter(w => (!table || w.table === table) && (!op || w.op === op)); },
    __setRpc(name, result) { rpcResults[name] = result; },
    __rpcCalls(name) { return name ? rpcCalls.filter(c => c.name === name) : rpcCalls; },
    __lastRpc(name) { const c = rpcCalls.filter(x => !name || x.name === name); return c[c.length - 1]; },
    __reset() {
      for (const k in results) delete results[k];
      for (const k in queues) delete queues[k];
      for (const k in opResults) delete opResults[k];
      writes.length = 0;
      rpcCalls.length = 0;
    },
  };
  return client;
}
module.exports = { createMockDb };
