// Letter generation (PDF): a one-page letter drafted by the model from the
// seeker's real profile data — a motivation/cover letter for a job
// application, or a letter of interest for a university application, as
// Hicham asked ("letters of interest for the universities, on behalf of
// students, and motivation letters for the job seekers").
//
// Same hard gate as routes/cv.js's /export — the letter is a generated
// deliverable, so it needs access.hasAccess() (real subscription OR a bonus
// grant — the launch-offer's 3 free months count, by design).
//
// HONESTY RULE (same as the concierge): the letter is drafted ONLY from the
// seeker's own stored profile — the model is told never to invent jobs,
// degrees, achievements, or contact names. If the profile is thin the letter
// is honest-thin; it stays a draft the seeker reviews before sending.
const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../lib/auth-mw');
const sec = require('../lib/security');
const { loadCurrent } = require('../lib/profileWrite');
const { buildCvData, cvReadiness } = require('../lib/cvBuilder');
const { renderLetterPdf } = require('../lib/letterPdf');
const access = require('../lib/access');
const router = express.Router();

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';
const TIMEOUT_MS = 60000;

const TYPES = {
  motivation: {
    en: { what: 'a job application cover/motivation letter', subjectFallback: 'Application' },
    fr: { what: 'une lettre de motivation pour une candidature à un emploi', subjectFallback: 'Candidature' },
  },
  interest: {
    en: { what: 'a letter of interest for a university application', subjectFallback: 'Letter of Interest' },
    fr: { what: 'une lettre de motivation pour une candidature universitaire', subjectFallback: "Lettre d'intérêt" },
  },
  scholarship: {
    en: { what: 'a motivation letter for a scholarship application', subjectFallback: 'Scholarship Application' },
    fr: { what: 'une lettre de motivation pour une demande de bourse', subjectFallback: 'Demande de bourse' },
  },
};

function systemPrompt(type, lang, target) {
  const spec = TYPES[type][lang];
  const targetLine = target
    ? `The letter is addressed to/for: ${target}.`
    : 'No specific recipient was named — keep the salutation generic and honest (e.g. "Dear Admissions Committee" / "Dear Hiring Manager").';
  return `You draft ${spec.what} for the platform's seeker, written in ${lang === 'fr' ? 'French' : 'English'}, one page maximum.
${targetLine}

Rules, all hard:
- Use ONLY facts present in the seeker profile data given in the user message — never invent employers, degrees, dates, grades, achievements, skills, or a contact person's name. If a detail is missing, write around it honestly rather than filling it with a plausible-sounding fabrication.
- Professional, sincere, specific tone — no purple prose, no buzzword lists, no fake enthusiasm.
- Output ONLY the letter body: the greeting line, the body paragraphs (separated by a blank line), and the sign-off. No subject line, no sender address block, no commentary, no markdown.`;
}

async function draftLetter(system, profileSummary) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1600,
      system,
      messages: [{ role: 'user', content: 'Seeker profile data (the ONLY facts you may use):\n' + profileSummary + '\n\nWrite the letter now.' }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) return { status: r.status, body: (await r.text()).slice(0, 300) };
  const json = await r.json();
  const text = (json.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  return { status: 200, text };
}

router.post('/', sec.limits.cv, authenticate, sec.requireActiveUser, async (req, res) => {
  try {
    const type = TYPES[req.body.type] ? req.body.type : null;
    if (!type) return res.status(400).json({ error: 'type must be "motivation", "interest" or "scholarship"', code: 'ERR_BAD_INPUT' });
    const lang = req.body.lang === 'fr' ? 'fr' : 'en';
    const target = sec.clean(req.body.target, 200) || '';

    const { data: user } = await supabase.from('users')
      .select('id, name, email, phone, subscription_status, bonus_access_until').eq('id', req.user.id).maybeSingle();
    if (!user) return res.status(403).json({ error: 'Account not found', code: 'ERR_NOT_FOUND' });
    if (!access.hasAccess(user))
      return res.status(402).json({ error: 'Subscribe to generate letters', upgrade: true, code: 'ERR_LETTER_SUBSCRIPTION_REQUIRED' });

    const { profile, seekerProfile } = await loadCurrent(req.user.id);
    const data = buildCvData({ user, profile, seekerProfile, lang });
    const { ready, reason } = cvReadiness(data);
    if (!ready)
      return res.status(422).json({ error: 'Not enough information yet to draft a letter — keep chatting with the concierge first', code: 'ERR_LETTER_NOT_READY', reason });

    if (!process.env.ANTHROPIC_API_KEY)
      return res.status(503).json({ error: 'Letter writing is not configured yet', code: 'ERR_LETTER_UNAVAILABLE' });

    // Everything the model may use — plain JSON of the seeker's real fields.
    const profileSummary = JSON.stringify({
      name: data.name, city: data.city, country: data.country,
      seeking: profile?.seeking_study ? 'university admission' : 'employment',
      targetDegreeLevel: profile?.target_degree_level || null,
      targetFieldOfStudy: profile?.target_field_of_study || null,
      sector: profile?.sector || null, roleType: profile?.role_type || null,
      preferredCountry: profile?.preferred_country || null,
      workHistory: data.workHistory, education: data.education,
      certifications: data.certifications, languages: data.languages,
    });

    const subject = target
      ? (type === 'scholarship'
          ? (lang === 'fr' ? `Demande de bourse — ${target}` : `Scholarship Application — ${target}`)
          : (lang === 'fr' ? `Candidature — ${target}` : `Application — ${target}`))
      : TYPES[type][lang].subjectFallback;

    const { status, text, body } = await draftLetter(systemPrompt(type, lang, target), profileSummary);
    if (status !== 200 || !text) {
      console.error('letter draft upstream', status, body || '(empty)');
      return res.status(502).json({ error: 'Could not draft the letter right now — please try again', code: 'ERR_LETTER_DRAFT_FAILED' });
    }

    const buf = await renderLetterPdf({
      name: data.name, email: data.email, phone: data.phone,
      city: data.city, country: data.country, subject, body: text, lang,
    });
    const slug = (data.name || 'yalla-nsafer').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'letter';
    res.setHeader('Content-Type', 'application/pdf');
    const filePrefix = type === 'interest' ? 'Letter-of-Interest' : type === 'scholarship' ? 'Scholarship-Motivation-Letter' : 'Motivation-Letter';
    res.setHeader('Content-Disposition', `attachment; filename="${filePrefix}-${slug}.pdf"`);
    res.send(buf);
  } catch (e) {
    console.error('letter generate', e);
    res.status(500).json({ error: 'Could not generate the letter', code: 'ERR_SERVER' });
  }
});

module.exports = router;
