// TrouvePro — provider acquisition funnel, counted server-side.
//
// Each step is recorded where the server already handles it (landing page hit,
// claim, checkout, PayPal activation), so the numbers cannot be inflated by a
// client posting events, and they hold with analytics consent refused.
const supabase = require('../db');

const STEPS = ['landing', 'claimed', 'checkout', 'subscribed'];

// Never let measurement break the thing being measured.
async function track(step, { licence = null, userId = null, source = null } = {}) {
  if (!STEPS.includes(step)) return false;
  try {
    const { error } = await supabase.from('claim_funnel').insert({
      step,
      rbq_licence: licence ? String(licence).slice(0, 20) : null,
      user_id: Number.isSafeInteger(userId) && userId > 0 ? userId : null,
      source: source ? String(source).slice(0, 40) : null,
    });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('funnel', step, e.message);
    return false;
  }
}

module.exports = { track, STEPS };
