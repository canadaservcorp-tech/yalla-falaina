// URL slugs for trade and city names: "Électricien" -> "electricien",
// "Sainte-Brigitte-De-Laval" -> "sainte-brigitte-de-laval".
const slug = s => String(s == null ? '' : s)
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const isSlug = s => typeof s === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(s);

module.exports = { slug, isSlug };
