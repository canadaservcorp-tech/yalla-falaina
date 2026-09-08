function approx(metres, lang = 'fr') {
  const m = Math.round(metres);
  if (m < 100) return lang === 'en' ? 'very close (<100 m)' : 'très proche (<100 m)';
  if (m < 1000) { const r = Math.round(m / 100) * 100; return lang === 'en' ? `~${r} m away` : `~${r} m`; }
  const km = (Math.round(m / 100) / 10).toFixed(1);
  return lang === 'en' ? `~${km} km away` : `~${km} km`;
}
module.exports = { approx };
