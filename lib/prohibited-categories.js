// Crude keyword guard for the categories the platform's Terms refuse outright
// (Section 6.6): sexual-services solicitation and drug dealing. This is a plain
// substring match on lowercased text, not NLP or a real moderation model — it
// will miss obfuscated or misspelled attempts, and a human admin still reviews
// every submission before it becomes a live job (routes/admin-informal-listings.js
// re-checks this same list at approval time, in case it's since been extended).
// Treat this as a first filter against obvious abuse, not full moderation coverage.
const KEYWORDS = [
  'escort', 'massage parlor', 'massage parlour', 'sex work', 'sexwork', 'prostitut',
  'onlyfans', 'sugar baby', 'sugar daddy', 'strip club', 'stripper', 'erotic massage',
  'drug dealer', 'drug dealing', 'sell drugs', 'sell weed', 'sell cocaine', 'sell coke',
  'sell meth', 'traffick',
];

function isProhibited(...fields) {
  const text = fields.filter(Boolean).join(' ').toLowerCase();
  return KEYWORDS.some(k => text.includes(k));
}

module.exports = { isProhibited, KEYWORDS };
