// lib/yf/systemPrompt.js is pure text assembly (no network, no DB), so its
// guardrail sections are covered directly here rather than only indirectly
// through test/concierge.test.js's mocked-model requests.
const { test } = require('node:test');
const assert = require('node:assert');
const { buildSystemPrompt } = require('../lib/yf/systemPrompt');

const prompt = () => buildSystemPrompt({ jobs: [], dialectHint: null });

// Bug report (Sept 2026): asked about scholarships "for this year," the live
// concierge opened with "this year (2025)" -- a full year behind the actual
// date. Nothing ever told the model what today really is, so it fell back on
// its own training-data guess. buildSystemPrompt now takes an explicit
// `today` (Date or ISO string, defaulting to the real clock) purely so these
// tests can pin it; routes/concierge.js itself passes nothing and gets the
// real date for free.
test('the prompt states the real, injected date -- never left for the model to guess from its own training', () => {
  const p = buildSystemPrompt({ jobs: [], dialectHint: null, today: '2026-09-20' });
  assert.match(p, /=== TODAY'S ACTUAL DATE ===/);
  assert.match(p, /Today's real date is 2026-09-20/);
  assert.match(p, /never your own internal sense of "the current year"/);
  assert.match(p, /Your own training gives you no reliable way to know the real date on its own/);
});

test('the date section defaults to the real clock when no `today` is passed, and tolerates a bad value', () => {
  const withoutOverride = buildSystemPrompt({ jobs: [], dialectHint: null });
  const isoToday = new Date().toISOString().slice(0, 10);
  assert.match(withoutOverride, new RegExp(`Today's real date is ${isoToday}`));
  // an unparseable override must never crash prompt building -- fall back
  // to the real date rather than emitting "Invalid Date" into the prompt
  const withBadOverride = buildSystemPrompt({ jobs: [], dialectHint: null, today: 'not-a-date' });
  assert.doesNotMatch(withBadOverride, /Invalid Date/);
  assert.match(withBadOverride, new RegExp(`Today's real date is ${isoToday}`));
});

test('the date section comes before every other guardrail, so date-relative reasoning (deadlines, "this year") is anchored from the start', () => {
  const p = prompt();
  const dateAt = p.indexOf("=== TODAY'S ACTUAL DATE ===");
  const identityAt = p.indexOf('=== IDENTITY: A SPECIALIST');
  assert.ok(dateAt > -1 && identityAt > -1);
  assert.ok(dateAt < identityAt);
});

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

// A seeker asking about universities in their OWN home country (e.g. a
// Lebanese seeker asking about universities in Lebanon) was previously
// declined as out of scope, because the "one purpose" line only ever named
// work abroad, never study or a seeker's home country. Hicham's ask ("write
// coding for all middle east universities... also allow fully local
// (home-country) universities") is a scope fix, not just a data fix -- these
// tests guard the prompt-level half of it.
test('the "one purpose" line names study and medical-treatment help, not just work abroad, and explicitly allows home-country study questions', () => {
  const p = prompt();
  assert.match(p, /helping someone build a real future through work, study, or a needed medical treatment/);
  assert.match(p, /a seeker asking about a university, program, or scholarship in their OWN home country is asking a fully in-scope question, never a personal\/off-topic one/);
});

test('the off-topic decline example offers study and medical-treatment help, not only "getting you abroad"', () => {
  const p = prompt();
  assert.match(p, /we specialize in getting you a real job, a real study\/scholarship opportunity, or help finding a needed medical treatment, at home or abroad/);
});

test('the CV/job/visa scope carve-out also names the study/university search, explicitly including the seeker\'s own home country', () => {
  const p = prompt();
  assert.match(p, /their study or university search — including in their own home country, not only abroad — their medical-treatment search/);
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
    '=== RETRIEVE, DON\'T RECALL: COST OF LIVING ===',
    '=== RETRIEVE, DON\'T RECALL: MEDICAL TREATMENT PROVIDERS (medical travel) ===',
  ]) assert.ok(p.includes(heading), `expected prompt to include "${heading}"`);
});

test('with nothing retrieved, every new context block says so plainly instead of going silent', () => {
  const p = prompt();
  assert.match(p, /No study programs or scholarships matched this query/);
  assert.match(p, /No community groups on file for this destination yet/);
  assert.match(p, /No accommodation-board posts on file for this destination yet/);
  assert.match(p, /No verified trusted partner on file for this situation yet/);
  assert.match(p, /No curated risk note on file for this specific country yet/);
  assert.match(p, /No curated cost-of-living note on file for this specific city\/country yet/);
});

// ---------- program duration + cost of living ----------

test('a study opportunity\'s duration is rendered in STUDY_CONTEXT, and says "not specified" when absent', () => {
  const withDuration = buildSystemPrompt({
    jobs: [], dialectHint: null,
    studyOpportunities: [{ kind: 'program', title: 'Intensive French Program', institution: 'X', country: 'France', durationNote: '6-week intensive', tuitionNote: '', eligibilityNote: '', requirements: '', sourceType: 'admin_curated', url: null }],
  });
  assert.match(withDuration, /duration: 6-week intensive/);

  const withoutDuration = buildSystemPrompt({
    jobs: [], dialectHint: null,
    studyOpportunities: [{ kind: 'program', title: 'MBA', institution: 'Y', country: 'Canada', durationNote: '', tuitionNote: '', eligibilityNote: '', requirements: '', sourceType: 'admin_curated', url: null }],
  });
  assert.match(withoutDuration, /duration: not specified/);
});

test('a real cost-of-living note is rendered into COST_OF_LIVING_CONTEXT with its figure and source', () => {
  const p = buildSystemPrompt({
    jobs: [], dialectHint: null,
    costOfLiving: [{ category: 'overall', city: 'Montreal', country: 'Canada', monthlyEstimateNote: '$1,200-1,800 CAD/month including rent, student budget', sourceUrl: 'https://example.gov/col' }],
  });
  assert.match(p, /Montreal, Canada: \$1,200-1,800 CAD\/month including rent, student budget/);
  assert.match(p, /source: https:\/\/example\.gov\/col/);
});

test('the cost-of-living section forbids stating a figure from general reputation and applies to job seekers and students alike', () => {
  const p = prompt();
  assert.match(p, /job seeker or student alike/);
  assert.match(p, /"Canada is expensive" is not a fact you may state as data/);
});

test('the "which universities/countries do you cover" hard question answers honestly that coverage is not restricted to a fixed list', () => {
  const p = prompt();
  assert.match(p, /Which universities\/countries do you cover/);
  assert.match(p, /not restricted to any fixed list of countries \(GCC, USA, Canada, Europe, UK, Turkey, or anywhere else\)/);
  assert.match(p, /never claim a specific country or university is or isn't covered from general knowledge/);
  // Hicham's ask: this platform is not "abroad-only" for study -- a seeker's
  // own home country gets the exact same treatment as any other country.
  assert.match(p, /it is not "abroad-only" — a seeker's own home country is covered exactly the same way as anywhere else/);
});

test('a hard-questions entry tells the concierge to treat "find me universities in Lebanon/Jordan/Egypt/Turkey/Cyprus/..." like any other destination query, home country or not', () => {
  const p = prompt();
  assert.match(p, /Find me universities in \[Lebanon \/ Jordan \/ Egypt \/ Turkey \/ Cyprus \/ the UAE \/ Saudi Arabia \/ Qatar \/ Kuwait\]/);
  assert.match(p, /Never tell a seeker that local\/home-country universities are out of scope or that this platform only covers "abroad\."/);
});

test('the STUDY PROGRAMS retrieval rule explicitly extends to the seeker\'s own home country, mirroring the job vertical\'s zone-local allowance', () => {
  const p = prompt();
  assert.match(p, /This also covers the seeker's OWN home country exactly like any other country/);
  assert.match(p, /A Lebanese seeker asking about universities in Lebanon, an Egyptian seeker asking about universities in Egypt/);
});

test('the study-permit vs. work-permit hard question describes the general shape without stating a specific hour limit or wage as fact', () => {
  const p = prompt();
  assert.match(p, /confuses a study permit\/student visa with a work permit/);
  assert.match(p, /do not state a specific hour limit, wage, or eligibility rule as current fact/);
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

// ---------- financial aid: a sourced percentage + admission conditions, never conflated ----------

test('a study opportunity with a verified funding percentage states it plainly, distinct from admission conditions', () => {
  const p = buildSystemPrompt({
    jobs: [], dialectHint: null,
    studyOpportunities: [{ kind: 'scholarship', title: 'Fully Funded PhD', institution: 'ETH Zurich', country: 'Switzerland', degreeLevel: 'phd', fieldOfStudy: 'materials science', fundingCoveragePct: 100, tuitionNote: 'plus monthly stipend', eligibilityNote: 'Master\'s degree in a related field, IELTS 6.5+', requirements: 'CV, transcripts, two references', sourceType: 'admin_curated', url: null }],
  });
  assert.match(p, /100% of tuition\/cost \(published figure\)/);
  assert.match(p, /plus monthly stipend/);
  assert.match(p, /admission conditions:.*Master's degree in a related field, IELTS 6\.5\+/);
});

test('a study opportunity with no verified percentage says so plainly rather than implying full funding', () => {
  const p = buildSystemPrompt({
    jobs: [], dialectHint: null,
    studyOpportunities: [{ kind: 'program', title: 'MBA', institution: 'X', country: 'Canada', fundingCoveragePct: null, tuitionNote: '', eligibilityNote: '', requirements: '', sourceType: 'admin_curated', url: null }],
  });
  assert.match(p, /no verified percentage on file/);
});

test('the study-vertical guardrail explicitly forbids inventing a funding percentage or admission condition, and says the rule covers every major and every degree level', () => {
  const p = prompt();
  assert.match(p, /never estimate, round, or guess one/);
  assert.match(p, /never describe a program as "fully funded" or "free" \(gratuit\) unless STUDY_CONTEXT says so explicitly/);
  assert.match(p, /covers every major\/field of study and every degree level equally/);
  assert.match(p, /do not assume financial aid only exists for certain fields or only at the graduate level/);
});

test('the hard-questions list has explicit answers for "how much is covered" and "do I qualify", each pointing at STUDY_CONTEXT\'s own per-program fields', () => {
  const p = prompt();
  assert.match(p, /is this fully funded \/ gratuit/i);
  assert.match(p, /Never average, estimate, or infer a percentage from a program's general reputation/);
  assert.match(p, /what are the admission conditions/i);
  assert.match(p, /not from what universities in general typically require/);
});

// ---------- medical-treatment/travel vertical ----------

test('with no medical intake on file, MEDICAL_INTAKE_CONTEXT says so plainly', () => {
  const p = prompt();
  assert.match(p, /No medical-travel intake on file for this seeker yet/);
  assert.match(p, /No curated hospital\/clinic on file yet that matches this specific treatment/);
});

test('a real medical intake request is rendered into MEDICAL_INTAKE_CONTEXT, distinct from a diagnosis', () => {
  const p = buildSystemPrompt({
    jobs: [], dialectHint: null,
    medicalIntake: { requiredTreatment: 'total hip replacement', medicalHistoryNote: 'osteoarthritis, right hip', extractedReportText: 'X-ray shows severe joint degeneration' },
  });
  assert.match(p, /Required treatment\/procedure \(as stated by the seeker or their own doctor\): total hip replacement/);
  assert.match(p, /osteoarthritis, right hip/);
  assert.match(p, /joint degeneration/);
});

test('a real curated hospital is rendered into MEDICAL_CONTEXT with its price and contact', () => {
  const p = buildSystemPrompt({
    jobs: [], dialectHint: null,
    medicalProviders: [{ hospitalName: 'CIMEQ', country: 'Cuba', city: 'Havana', specialties: 'orthopedic hip and knee replacement', priceRangeNote: '$9,000-12,000 USD, published self-pay rate', contactEmail: 'intl@cimeq.example', contactPhone: '+53...', sourceUrl: null }],
  });
  assert.match(p, /CIMEQ/);
  assert.match(p, /Havana, Cuba/);
  assert.match(p, /9,000-12,000/);
  assert.match(p, /intl@cimeq\.example/);
});

test('the medical vertical states plainly that the model is not a doctor and must never diagnose or interpret lab values', () => {
  const p = prompt();
  assert.match(p, /YOU ARE NOT A DOCTOR/);
  assert.match(p, /[Nn]ever diagnose, interpret lab results or medical images/);
  assert.match(p, /[Nn]ever guess a likely diagnosis or treatment yourself from symptoms or lab values/);
});

test('the medical vertical explicitly names Cuba, South Korea, and Russia as real, curatable options, never restricted to "usual" destinations', () => {
  const p = prompt();
  assert.match(p, /Cuba, South Korea, and Russia/);
  assert.match(p, /can differ hugely in price from North America\/Europe for the very same procedure/);
});

test('the hard-questions list refuses to interpret an uploaded lab result or diagnosis, and redirects a "cheapest hospital" question to MEDICAL_CONTEXT only', () => {
  const p = prompt();
  assert.match(p, /restate that you're not a doctor and can't read medical results/);
  assert.match(p, /Which hospital is cheapest for/);
  assert.match(p, /what about Cuba, Korea, or Russia for this/);
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
  const medicalAt = p.indexOf('=== RETRIEVE, DON\'T RECALL: MEDICAL TREATMENT PROVIDERS (medical travel) ===');
  const partnerAt = p.indexOf('=== RETRIEVE, DON\'T RECALL: TRUSTED PARTNER REFERRALS ===');
  const riskAt = p.indexOf('=== RETRIEVE, DON\'T RECALL: COUNTRY RISK NOTES ===');
  const legalAt = p.indexOf('=== RETRIEVE, DON\'T RECALL: LEGAL / VISA / CITIZENSHIP / ASYLUM FACTS ===');
  assert.ok([identityAt, jobFactsAt, studyAt, medicalAt, partnerAt, riskAt, legalAt].every(i => i > -1));
  assert.ok(identityAt < jobFactsAt);
  assert.ok(jobFactsAt < studyAt);
  assert.ok(studyAt < medicalAt && medicalAt < partnerAt && partnerAt < riskAt && riskAt < legalAt);
});

test('the hard-questions list covers the "can\'t afford tuition" pivot to scholarships and honest translation gating', () => {
  const p = prompt();
  assert.match(p, /can't afford tuition/);
  assert.match(p, /STUDY_CONTEXT for a scholarship or funded program/);
  assert.match(p, /translate a document/i);
  assert.match(p, /never translate a document yourself from your own knowledge/);
});

// Real bug report (Sept 2026): a seeker asked "master's in agriculture in
// Montreal" and got back filler ("That's a fair question — I'll be straight
// with you"), several paragraphs of hedging, and a soft open-ended close
// ("Does that make sense? And do you want me to check other options...").
// The underlying data gap (Canada had zero STUDY_CONTEXT rows) is a seed-data
// fix, not a prompt fix -- these tests guard the prompt-level half: an honest
// "no match" answer still has to read like the specialist described in
// IDENTITY, not a hedging chatbot.
test('WHEN YOU DON\'T KNOW bans filler openers and soft open-ended closes, and caps the answer length', () => {
  const p = prompt();
  const at = p.indexOf('=== WHEN YOU DON\'T KNOW ===');
  assert.ok(at > -1);
  const section = p.slice(at, p.indexOf('=== CITY VS. COUNTRY/REGION MATCHES'));
  assert.match(section, /No filler opener/);
  assert.match(section, /That's a fair question/);
  assert.match(section, /Does that make sense/);
  assert.match(section, /exactly one concrete next step/);
  assert.match(section, /2-4 sentences/);
});

test('WHEN YOU DON\'T KNOW sits after IDENTITY and frames itself as operationalizing that same "never vague or generic" rule', () => {
  const p = prompt();
  const identityAt = p.indexOf('=== IDENTITY: A SPECIALIST, NOT A GENERAL CHATBOT ===');
  const dontKnowAt = p.indexOf('=== WHEN YOU DON\'T KNOW ===');
  assert.ok(identityAt > -1 && dontKnowAt > -1 && identityAt < dontKnowAt);
  assert.match(p, /exactly the case that identity rule means by "never a vague, generic, or noncommittal reply"/);
});

test('a new city-vs-country/region guardrail tells the concierge to name a real nearby-city match honestly instead of silently swapping cities', () => {
  const p = prompt();
  assert.match(p, /=== CITY VS\. COUNTRY\/REGION MATCHES/);
  assert.match(p, /Montreal.*Quebec City|Quebec City.*Montreal/s);
  assert.match(p, /roughly 2\.5 hours away/);
  assert.match(p, /rather than answering as if it were in Montreal or silently substituting/);
});

// Hicham's ask (Sept 2026): visitors/subscribers weren't getting any real,
// positive information out of the study vertical -- "any program around the
// world we should have a positive answer, and giving chance, and show
// opportunity for the student." This is a tone/behavior mandate layered on
// top of RETRIEVE, DON'T RECALL (which must NOT loosen -- still zero
// invented programs) telling the concierge to never leave a study question
// as a dead end, for any country on earth.
test('a new "never a dead end" rule mandates a positive, opportunity-first answer for every country, without loosening RETRIEVE, DON\'T RECALL', () => {
  const p = prompt();
  const at = p.indexOf('=== NEVER A DEAD END: ALWAYS SHOW A REAL PATH FORWARD FOR STUDY');
  assert.ok(at > -1);
  const section = p.slice(at, p.indexOf('=== RETRIEVE, DON\'T RECALL: DIASPORA'));
  assert.match(section, /does NOT loosen the RETRIEVE, DON'T RECALL discipline above in any way/);
  assert.match(section, /never invent a program, university, or scholarship/);
  assert.match(section, /genuinely positive, opportunity-focused answer, never a flat "no"/);
  assert.match(section, /ONE concrete, actionable next step/);
  assert.match(section, /there is no province, region, or country this positive, chance-giving framing applies more weakly to/);
});

test('the "never a dead end" study rule sits right after STUDY_CONTEXT, before the diaspora/community section', () => {
  const p = prompt();
  const studyContextAt = p.indexOf('STUDY_CONTEXT (the only study programs/scholarships you may discuss as real, currently-open opportunities):');
  const deadEndAt = p.indexOf('=== NEVER A DEAD END: ALWAYS SHOW A REAL PATH FORWARD FOR STUDY');
  const diasporaAt = p.indexOf('=== RETRIEVE, DON\'T RECALL: DIASPORA & COMMUNITY GROUPS ===');
  assert.ok(studyContextAt > -1 && deadEndAt > -1 && diasporaAt > -1);
  assert.ok(studyContextAt < deadEndAt && deadEndAt < diasporaAt);
});

// Hicham's follow-up (Sept 2026): "not only in Canada, in case we didn't find
// in Quebec, we should always provide alternatives, in other province, or
// countries, and be positive answer, and accurate." The first version of the
// dead-end rule only spelled out "same country, different city" and "nearby
// country" -- this widens it into an explicit escalation ladder (city ->
// other provinces in the same country -> other countries entirely) and adds
// an explicit accuracy requirement so a positive answer never blurs which of
// those three it actually is.
test('the dead-end rule spells out an explicit escalation ladder: other cities, then other provinces/states, then other countries', () => {
  const p = prompt();
  const at = p.indexOf('=== NEVER A DEAD END: ALWAYS SHOW A REAL PATH FORWARD FOR STUDY');
  const section = p.slice(at, p.indexOf('=== RETRIEVE, DON\'T RECALL: DIASPORA'));
  assert.match(section, /A different city in the same province\/region/);
  assert.match(section, /A different province\/state in the same country/);
  assert.match(section, /Never treat "not in Quebec" as "not in Canada" without actually checking the rest of the country first/);
  assert.match(section, /A different country entirely, anywhere in the world/);
  assert.match(section, /never something to apologize for or bury as a last resort/);
});

test('the dead-end rule requires accuracy alongside positivity -- a hopeful answer must not blur city/province/country', () => {
  const p = prompt();
  const at = p.indexOf('=== NEVER A DEAD END: ALWAYS SHOW A REAL PATH FORWARD FOR STUDY');
  const section = p.slice(at, p.indexOf('=== RETRIEVE, DON\'T RECALL: DIASPORA'));
  assert.match(section, /Positive and accurate are equally required/);
  assert.match(section, /a hopeful-sounding answer that gets the city, province, or country wrong is a false chance, not a real one/);
  assert.match(section, /never misdescribe a real one to make it sound closer to what they asked than it actually is/);
});

// Hicham's follow-up (Sept 2026): "from anywhere in the world, to anywhere
// in the world, we have to be ready and provide answer for students, for
// available programs, locations, city, requirements, cost." This is a
// completeness mandate, not a scope one (scope/dead-end are already covered
// above) -- it says that once a real STUDY_CONTEXT match exists, the
// concierge must actually state every field that's on file for it, rather
// than giving a thin "yes, McGill has that" answer and leaving the seeker to
// ask for location/requirements/cost separately.
test('a new "answer with the full picture" section mandates stating program, city, requirements, and cost whenever they\'re on file', () => {
  const p = prompt();
  const at = p.indexOf('=== ANSWER WITH THE FULL PICTURE: PROGRAM, LOCATION, REQUIREMENTS, COST ===');
  assert.ok(at > -1);
  const section = p.slice(at, p.indexOf('STUDY_CONTEXT (the only study programs/scholarships you may discuss'));
  assert.match(section, /any country in the world to literally any other country in the world/);
  assert.match(section, /the program\/institution name and degree level/);
  assert.match(section, /the exact city\/location/);
  assert.match(section, /the real admission\/eligibility requirements/);
  assert.match(section, /the real cost\/tuition note, and the funding-coverage percentage if one is on file/);
  assert.match(section, /Never answer with just the university name and stop there when STUDY_CONTEXT actually has the location, requirements, or cost fields filled in/);
});

test('the "answer with the full picture" section sits in the study block, right before STUDY_CONTEXT is rendered', () => {
  const p = prompt();
  const retrieveStudyAt = p.indexOf('=== RETRIEVE, DON\'T RECALL: STUDY PROGRAMS & SCHOLARSHIPS (bourse) ===');
  const fullPictureAt = p.indexOf('=== ANSWER WITH THE FULL PICTURE: PROGRAM, LOCATION, REQUIREMENTS, COST ===');
  const studyContextAt = p.indexOf('STUDY_CONTEXT (the only study programs/scholarships you may discuss as real, currently-open opportunities):');
  assert.ok(retrieveStudyAt > -1 && fullPictureAt > -1 && studyContextAt > -1);
  assert.ok(retrieveStudyAt < fullPictureAt && fullPictureAt < studyContextAt);
});

// Hicham's follow-up (Sept 2026): "even if the tuition fees are not
// published, we have to get the contact email for the student to contact
// them and write email for the university, to ask all details." This adds a
// proactive "offer to draft a real email" behavior for exactly the case the
// full-picture rule already flags (a real match with a genuinely missing
// field) -- it must reuse only a real contact from STUDY_CONTEXT (never
// invent one) and must never claim the concierge can send anything itself.
test('a new section offers to draft a real email to the institution when tuition/requirements/deadline are missing, using only a real contact from STUDY_CONTEXT', () => {
  const p = prompt();
  const at = p.indexOf('=== WHEN A REAL FIELD ISN\'T PUBLISHED: OFFER TO DRAFT A REAL EMAIL TO THE INSTITUTION ===');
  assert.ok(at > -1);
  const section = p.slice(at, p.indexOf('STUDY_CONTEXT (the only study programs/scholarships you may discuss'));
  assert.match(section, /proactively offer to draft a ready-to-send email/);
  assert.match(section, /never invent a contact that isn't written there/);
  assert.match(section, /never ask about a field STUDY_CONTEXT already has/);
  assert.match(section, /Leave a clear placeholder for the seeker's own details/);
  assert.match(section, /you have no ability to send an email, submit a form, or message anyone yourself/);
});

test('the "draft a real email" section sits right after the full-picture rule, before STUDY_CONTEXT is rendered', () => {
  const p = prompt();
  const fullPictureAt = p.indexOf('=== ANSWER WITH THE FULL PICTURE: PROGRAM, LOCATION, REQUIREMENTS, COST ===');
  const emailAt = p.indexOf('=== WHEN A REAL FIELD ISN\'T PUBLISHED: OFFER TO DRAFT A REAL EMAIL TO THE INSTITUTION ===');
  const studyContextAt = p.indexOf('STUDY_CONTEXT (the only study programs/scholarships you may discuss as real, currently-open opportunities):');
  assert.ok(fullPictureAt > -1 && emailAt > -1 && studyContextAt > -1);
  assert.ok(fullPictureAt < emailAt && emailAt < studyContextAt);
});
