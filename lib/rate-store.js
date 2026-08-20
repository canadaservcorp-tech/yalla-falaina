// express-rate-limit store backed by Postgres, so a limit is a limit across every instance
// (the default MemoryStore counts per process: on Railway that multiplies the ceiling).
// If the database is unreachable the store degrades to its in-memory twin rather than
// letting the request through unlimited — reduced protection beats none.
const { MemoryStore } = require('express-rate-limit');
const supabase = require('../db');

const PREFIX = process.env.RATE_LIMIT_PREFIX || 'rl';

class SharedStore {
  constructor() {
    this.fallback = new MemoryStore();
    this.localOnly = false;   // flips once, so a broken DB doesn't cost a round trip per request
  }

  init(options) {
    this.windowMs = options.windowMs;
    this.name = options.__name || 'default';
    this.fallback.init(options);
  }

  key(k) {
    return `${PREFIX}:${this.name}:${k}`;
  }

  async hit(k, step) {
    if (this.localOnly) return null;
    const { data, error } = await supabase.rpc('rate_hit', {
      p_key: this.key(k), p_window_ms: this.windowMs, p_step: step,
    });
    if (error) {
      // missing function / no connection: say so once, then stay local for this process
      console.error('[rate-limit] shared store unavailable, counting in memory:', error.message);
      this.localOnly = true;
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return { totalHits: Number(row.hits), resetTime: new Date(row.reset_at) };
  }

  async increment(k) {
    return (await this.hit(k, 1)) || this.fallback.increment(k);
  }

  async decrement(k) {
    if (!(await this.hit(k, -1))) return this.fallback.decrement(k);
  }

  async resetKey(k) {
    if (this.localOnly) return this.fallback.resetKey(k);
    const { error } = await supabase.from('rate_hits').delete().eq('key', this.key(k));
    if (error) return this.fallback.resetKey(k);
  }

  async resetAll() {
    this.fallback.resetAll?.();
  }
}

// Each limiter needs its own counters, so `login` and `search` can't share a bucket.
const store = name => {
  const s = new SharedStore();
  const init = s.init.bind(s);
  s.init = options => init({ ...options, __name: name });
  return s;
};

module.exports = { store, SharedStore };
