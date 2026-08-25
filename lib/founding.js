// TrouvePro — the founding-provider offer, kept honest.
//
// A number is handed out only when a subscription really activates, and only while
// fewer than LIMIT have been handed out, so the public counter cannot overstate
// how many providers are paying.
const supabase = require('../db');

const LIMIT = 50;

async function taken() {
  const { count, error } = await supabase.from('users')
    .select('id', { count: 'exact', head: true }).not('founding_number', 'is', null);
  if (error) throw error;
  return Number(count) || 0;
}

// Returns the number the account holds (existing or new), or null once the offer is full.
async function assign(userId) {
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  try {
    const { data: me, error } = await supabase.from('users')
      .select('founding_number').eq('id', userId).maybeSingle();
    if (error) throw error;
    if (!me) return null;
    if (me.founding_number) return me.founding_number;

    const used = await taken();
    if (used >= LIMIT) return null;
    const next = used + 1;
    // the unique index is the real guard: two activations landing together means one loses
    const upd = await supabase.from('users').update({ founding_number: next }).eq('id', userId);
    if (upd.error) throw upd.error;
    return next;
  } catch (e) {
    console.error('founding assign', e.message);
    return null;
  }
}

async function status() {
  const used = await taken();
  return { limit: LIMIT, taken: Math.min(used, LIMIT), remaining: Math.max(LIMIT - used, 0) };
}

module.exports = { LIMIT, assign, status, taken };
