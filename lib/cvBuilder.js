'use strict';

// Normalizes the seeker's collected data (profiles + seeker_profiles + users)
// into one plain CV data model that lib/cvPdf.js and lib/cvDocx.js both
// render from — one shape, two renderers, so a labeling or field fix is
// never made twice.
//
// Language: a CV's audience is the employer, not the seeker, and every
// track this platform matches against (western/GCC/zone — lib/yf/
// systemPrompt.js) is an English- or French-speaking labor market, so this
// deliberately renders in English or French only (lang: 'en' | 'fr'), never
// Arabic. That's a scoping decision worth Hicham confirming, not an
// oversight: correct Arabic PDF output needs RTL text shaping and a
// bundled Arabic-capable font, which pdfkit doesn't provide out of the box,
// and an Arabic CV would be unreadable to the employers this is written for.

function buildCvData({ user, profile, seekerProfile, lang }) {
  const p = profile || {};
  const sp = seekerProfile || {};
  return {
    lang: lang === 'fr' ? 'fr' : 'en',
    name: p.full_name || user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    city: p.city || '',
    country: p.country || '',
    headline: p.role_type || p.sector || '',
    workHistory: Array.isArray(sp.work_history) ? sp.work_history : [],
    education: Array.isArray(sp.education) ? sp.education : [],
    certifications: Array.isArray(sp.certifications) ? sp.certifications : [],
    languages: Array.isArray(sp.languages) ? sp.languages : [],
  };
}

// A CV built from almost nothing isn't a real deliverable — the concierge
// should keep collecting first. Deliberately lighter than
// lib/profileCompleteness.js's Section-10 gate (which also requires the
// visa/passport booleans — immigration-readiness signals, not CV content,
// and largely irrelevant to whether a CV is worth generating): a CV only
// needs a name and at least one substantive section.
function cvReadiness(data) {
  if (!data.name) return { ready: false, reason: 'missing_name' };
  const hasContent = data.workHistory.length || data.education.length || data.certifications.length;
  if (!hasContent) return { ready: false, reason: 'no_content' };
  return { ready: true, reason: null };
}

// Both a seeker-typed answer and a concierge-extracted one can legitimately
// be a bare string instead of the documented object shape (see
// lib/profileWrite.js's validateIntakeLenient: a live-model retest found the
// model answering a list field with a plain sentence, and normalizing that
// to a single-item array rather than discarding it) — every renderer needs
// the exact same fallback logic, so it lives here once instead of being
// re-derived in lib/cvPdf.js and lib/cvDocx.js separately.
function describeWorkEntry(w) {
  if (typeof w !== 'object' || w === null) return { title: String(w), subtitle: '', body: '' };
  const title = [w.title, w.employer].filter(Boolean).join(' — ') || w.employer || w.title || 'Untitled role';
  const subtitle = [w.start_date, w.end_date].filter(Boolean).join(' – ');
  return { title, subtitle, body: w.description || '' };
}
function describeEducationEntry(e) {
  if (typeof e !== 'object' || e === null) return { title: String(e), subtitle: '' };
  const title = [e.degree || e.title || e.field, e.institution || e.school].filter(Boolean).join(' — ') || 'Education';
  const subtitle = [e.start_date, e.end_date].filter(Boolean).join(' – ');
  return { title, subtitle };
}
function describeCertification(c) {
  if (typeof c !== 'object' || c === null) return String(c);
  return [c.name || c.title, c.issuer].filter(Boolean).join(' — ') || JSON.stringify(c);
}
function describeLanguage(l) {
  if (typeof l !== 'object' || l === null) return String(l);
  return [l.language, l.level].filter(Boolean).join(' – ') || JSON.stringify(l);
}

module.exports = {
  buildCvData, cvReadiness,
  describeWorkEntry, describeEducationEntry, describeCertification, describeLanguage,
};
