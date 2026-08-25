// Founding Month — a dated window during which unclaimed seeded listings are reachable for free.
//
// The window is a date, not a flag, so it closes by itself: on the day after OPEN_ACCESS_UNTIL
// every unclaimed listing is back to claim-required with no deploy and nothing to remember.
// Restricted to the cities that actually have listings — unlocking an empty category elsewhere
// is the same dead-end seen from the other side.
const CITIES = (process.env.OPEN_ACCESS_CITIES || 'Laval')
  .split(',').map(c => c.trim().toLowerCase()).filter(Boolean);

const DAY_MS = 86400000;

function until() {
  const raw = process.env.OPEN_ACCESS_UNTIL;
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T23:59:59Z`);
  return isNaN(d.getTime()) ? null : d;
}

function status() {
  const end = until();
  if (!end) return { active: false, until: null, daysLeft: 0, cities: CITIES };
  const left = Math.ceil((end.getTime() - Date.now()) / DAY_MS);
  return {
    active: left > 0,
    until: end.toISOString().slice(0, 10),
    daysLeft: Math.max(left, 0),
    cities: CITIES,
  };
}

// A city is in the window only while the window is open, so callers never need both checks.
function covers(city) {
  const s = status();
  if (!s.active) return false;
  if (!CITIES.length) return true;
  return CITIES.includes(String(city || '').trim().toLowerCase());
}

module.exports = { status, covers };
