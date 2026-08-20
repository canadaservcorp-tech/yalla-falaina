// Minimal mock of the Supabase client that db.js exports.
// Stubs the query-builder chain (.from().select().eq().maybeSingle()/.single()/.order()...)
// Each builder resolves LAZILY to results[table], so tests can set results after app load.
function makeBuilder(getResult) {
  const b = {};
  const chain = ['select','insert','update','delete','upsert','eq','neq','or','ilike',
                 'in','gte','lte','gt','lt','contains','match','order','limit','range'];
  chain.forEach(m => { b[m] = () => b; });               // chainable, return self
  b.maybeSingle = () => Promise.resolve(getResult());     // terminal
  b.single = () => Promise.resolve(getResult());          // terminal
  b.then = (resolve, reject) => Promise.resolve(getResult()).then(resolve, reject); // awaitable
  return b;
}

function createMockDb() {
  const results = {};                                     // table -> { data, error }
  const rpcCalls = [];                                    // { name, args } in call order
  const rpcResults = {};                                  // name -> { data, error }
  const client = {
    from(table) { return makeBuilder(() => results[table] || { data: null, error: null }); },
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
    __setRpc(name, result) { rpcResults[name] = result; },
    __rpcCalls(name) { return name ? rpcCalls.filter(c => c.name === name) : rpcCalls; },
    __lastRpc(name) { const c = rpcCalls.filter(x => !name || x.name === name); return c[c.length - 1]; },
    __reset() {
      for (const k in results) delete results[k];
      for (const k in rpcResults) delete rpcResults[k];
      rpcCalls.length = 0;
    },
  };
  return client;
}
module.exports = { createMockDb };
