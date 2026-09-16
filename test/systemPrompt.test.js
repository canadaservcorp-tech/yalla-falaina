// lib/yf/systemPrompt.js is pure text assembly (no network, no DB), so its
// guardrail sections are covered directly here rather than only indirectly
// through test/concierge.test.js's mocked-model requests.
const { test } = require('node:test');
const assert = require('node:assert');
const { buildSystemPrompt } = require('../lib/yf/systemPrompt');

const prompt = () => buildSystemPrompt({ jobs: [], dialectHint: null });

test('the concierge is told to decline personal/off-topic questions instead of answering them', () => {
  const p = prompt();
  assert.match(p, /STAYING IN SCOPE/);
  assert.match(p, /do not attempt to answer it, not even partially/);
  // the actual scope it must redirect to, per Hicham's wording (Sept 2026)
  for (const phrase of ['building', 'resume', 'finding', 'real job', 'process stands', 'onboard', 'travel documents', 'speeding up']) {
    assert.match(p, new RegExp(phrase, 'i'), `expected the in-scope description to mention "${phrase}"`);
  }
});

test('the scope guardrail explicitly carves out CV/job/visa/platform questions as still in scope', () => {
  const p = prompt();
  assert.match(p, /does NOT apply to questions about the user's CV, their job search, their visa or travel-document process/);
});

test('Gulf/Khaleeji Arabic is named as its own dialect, not folded into Lebanese/Egyptian by default', () => {
  const p = prompt();
  assert.match(p, /Gulf\/Khaleeji Arabic/);
  assert.match(p, /its own register, not a variant of Levantine or Egyptian/);
  // the dialect hint from the chat's dialectSelect ("Gulf Arabic") should
  // read straight through into the rendered prompt when set
  assert.match(buildSystemPrompt({ jobs: [], dialectHint: 'Gulf Arabic' }), /Default hint for this session: Gulf Arabic/);
});

test('the scope guardrail sits alongside the age gate, not buried after the job-matching rules', () => {
  const p = prompt();
  const ageGateAt = p.indexOf('=== AGE GATE ===');
  const scopeAt = p.indexOf('=== STAYING IN SCOPE');
  const jobFactsAt = p.indexOf('=== RETRIEVE, DON\'T RECALL: JOB FACTS ===');
  assert.ok(ageGateAt > -1 && scopeAt > -1 && jobFactsAt > -1);
  assert.ok(ageGateAt < scopeAt && scopeAt < jobFactsAt, 'expected AGE GATE, then STAYING IN SCOPE, then the job-facts rules');
});

// ---------- "home to home" identity + specialist-not-chatbot framing ----------

test('the opening identity paragraph frames the platform as a full home-to-home journey, not just job matching', () => {
  const p = prompt();
  assert.match(p, /home to home/i);
  assert.match(p, /CV.*opportunity|opportunity.*CV/i);
});

test('the concierge is told plainly it is a specialist agent, not a general chatbot', () => {
  const p = prompt();
  assert.match(p, /=== IDENTITY: A SPECIALIST, NOT A GENERAL CHATBOT ===/);
  assert.match(p, /not a general-purpose chat assistant/i);
  assert.match(p, /specialist immigration and travel concierge/i);
});

// ---------- new retrieve-don't-recall verticals ----------

test('every new retrieval source gets its own retrieve-dont-recall section, all present with no data', () => {
  const p = prompt();
  for (const heading of [
    '=== RETRIEVE, DON\'T RECALL: STUDY PROGRAMS & SCHOLARSHIPS (bourse) ===',
    '=== RETRIEVE, DON\'T RECALL: DIASPORA & COMMUNITY GROUPS ===',
    '=== RETRIEVE, DON\'T RECALL: ACCOMMODATION BOARD',
    '=== RETRIEVE, DON\'T RECALL: TRUSTED PARTNER REFERRALS ===',
    '=== RETRIEVE, DON\'T RECALL: COUNTRY RISK NOTES ===',
  ]) assert.ok(p.includes(heading), `expected prompt to include "${heading}"`);
});

test('with nothing retrieved, every new context block says so plainly instead of going silent', () => {
  const p = prompt();
  assert.match(p, /No study programs or scholarships matched this query/);
  assert.match(p, /No community groups on file for this destination yet/);
  assert.match(p, /No accommodation-board posts on file for this destination yet/);
  assert.match(p, /No verified trusted partner on file for this situation yet/);
  assert.match(p, /No curated risk note on file for this specific country yet/);
});

test('a real study opportunity is rendered into STUDY_CONTEXT with its key facts, never leaving a fabricated one implied', () => {
  const p = buildSystemPrompt({
    jobs: [], dialectHint: null,
    studyOpportunities: [{ kind: 'scholarship', title: 'Excellence Bourse', institution: 'UQAM', country: 'Canada', city: 'Montréal', degreeLevel: 'masters', fieldOfStudy: 'engineering', tuitionNote: 'full tuition waiver', deadline: '2027-03-01', requirements: 'GPA 3.5+', sourceType: 'consultant_submission', url: null }],
  });
  assert.match(p, /Excellence Bourse/);
  assert.match(p, /UQAM/);
  assert.match(p, /full tuition waiver/);
  assert.match(p, /2027-03-01/);
});

test('a real trusted partner is rendered into PARTNER_CONTEXT with licence and contact', () => {
  const p = buildSystemPrompt({
    jobs: [], dialectHint: null,
    trustedPartners: [{ companyName: 'Canada Immigration Experts', category: 'immigration_consultant', countriesServed: ['Canada'], contactEmail: 'b@x.com', contactPhone: '+1...', licenceNumber: 'L2' }],
  });
  assert.match(p, /Canada Immigration Experts/);
  assert.match(p, /licence #L2/);
  assert.match(p, /b@x\.com/);
});

test('the trusted-partner section requires the concierge to explain WHY a partner fits before naming it, and never to pressure or decide for the seeker', () => {
  const p = prompt();
  assert.match(p, /Explain briefly WHY this partner fits their specific situation/);
  assert.match(p, /never pressure, never claim it's their only choice/);
});

test('a real country-risk note is rendered into RISK_CONTEXT and the model is told to surface it proactively', () => {
  const p = buildSystemPrompt({
    jobs: [], dialectHint: null,
    countryRisks: [{ category: 'scam_prevalence', riskLevel: 'high', summary: 'Fake "guaranteed visa" offers requiring upfront payment are common.', sourceUrl: 'https://example.gov/advisory' }],
  });
  assert.match(p, /guaranteed visa/);
  assert.match(p, /risk: high/);
});

test('flight/hotel search state renders an honest not-configured warning by default, and a configured one when true', () => {
  const notConfigured = prompt();
  assert.match(notConfigured, /Flight price search is NOT yet configured/);
  assert.match(notConfigured, /Hotel\/Airbnb\/apartment price search is NOT yet configured/);

  const configured = buildSystemPrompt({ jobs: [], dialectHint: null, travel: { flightsConfigured: true, hotelsConfigured: true } });
  assert.match(configured, /Flight price search is configured/);
  assert.match(configured, /Accommodation price search is configured/);
});

test('the new verticals are ordered after job facts and before the legal/visa section, with identity framing ahead of everything', () => {
  const p = prompt();
  const identityAt = p.indexOf('=== IDENTITY: A SPECIALIST, NOT A GENERAL CHATBOT ===');
  const jobFactsAt = p.indexOf('=== RETRIEVE, DON\'T RECALL: JOB FACTS ===');
  const studyAt = p.indexOf('=== RETRIEVE, DON\'T RECALL: STUDY PROGRAMS & SCHOLARSHIPS (bourse) ===');
  const partnerAt = p.indexOf('=== RETRIEVE, DON\'T RECALL: TRUSTED PARTNER REFERRALS ===');
  const riskAt = p.indexOf('=== RETRIEVE, DON\'T RECALL: COUNTRY RISK NOTES ===');
  const legalAt = p.indexOf('=== RETRIEVE, DON\'T RECALL: LEGAL / VISA / CITIZENSHIP / ASYLUM FACTS ===');
  assert.ok([identityAt, jobFactsAt, studyAt, partnerAt, riskAt, legalAt].every(i => i > -1));
  assert.ok(identityAt < jobFactsAt);
  assert.ok(jobFactsAt < studyAt);
  assert.ok(studyAt < partnerAt && partnerAt < riskAt && riskAt < legalAt);
});

test('the hard-questions list covers the "can\'t afford tuition" pivot to scholarships and honest translation gating', () => {
  const p = prompt();
  assert.match(p, /can't afford tuition/);
  assert.match(p, /STUDY_CONTEXT for a scholarship or funded program/);
  assert.match(p, /translate a document/i);
  assert.match(p, /never translate a document yourself from your own knowledge/);
});
