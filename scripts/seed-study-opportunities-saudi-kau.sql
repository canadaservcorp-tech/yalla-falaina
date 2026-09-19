-- Seed data for public.study_opportunities (international-students vertical --
-- lib/yf/studyMatching.js). Run this ONCE against the real production
-- database. Idempotent: re-running it does nothing if a row with the same
-- institution + country + kind + title already exists.
--
-- WHY THIS FILE EXISTS: a real user (via a screenshot of the live concierge)
-- pointed out that King Abdulaziz University (KAU) has a real Master's
-- program in agriculture, and asked why the platform wasn't finding it. They
-- were right -- scripts/seed-study-opportunities-mena.sql's original research
-- pass (Sept 2026) only checked KAU's generic "international student"
-- landing pages, which were placeholder/content-empty at the time, and
-- explicitly listed KAU as "DELIBERATELY EXCLUDED" as a result. That
-- placeholder page was the wrong page to check -- the actual program lives
-- at its own URL (kau.edu.sa/en/programs/...), which a fresh check this
-- session found live and populated. This file is the correction, and the
-- MENA seed file's header comment has been updated to remove the outdated
-- exclusion note and point here.
--
-- SOURCING DISCIPLINE (same rule as every other seed file in this repo):
-- every field below was verified against kau.edu.sa directly this session,
-- with the exact page cited in source_url. No aggregator/marketplace site
-- (mastersportal, phdportal, and similar "compare universities" sites, which
-- do list this program) was used as a source for any fact below, even though
-- they surfaced where to look.
--   - The program row's tuition_note is left NULL: the official program page
--     states the degree, duration, language, and specializations, but not a
--     tuition figure, and links to a separate (Arabic-only, in this fetch)
--     admission-requirements page rather than stating fees itself. Never
--     guessed.
--   - The scholarship row is real and separate from the program itself: KAU
--     publishes a general international graduate scholarship (Master's and
--     PhD, all fields except health sciences) with real, quotable eligibility
--     criteria and qualitative coverage ("tuition fees, accommodation, and
--     living expenses") -- but no exact percentage or dollar figure is
--     published, so funding_coverage_pct is left NULL rather than assumed to
--     be 100%, even though the qualitative description reads as
--     comprehensive. This scholarship is university-wide, not specific to
--     the Arid Land Agriculture program, so it's filed as its own row rather
--     than folded into the program row's funding fields.
--   - city: KAU's main campus is in Jeddah; stated plainly since the
--     program/faculty pages don't repeat this themselves.

insert into public.study_opportunities
  (kind, title, institution, country, city, degree_level, field_of_study, language, duration_note, tuition_note, funding_coverage_pct, eligibility_note, deadline, requirements, source_url)
select v.kind, v.title, v.institution, v.country, v.city, v.degree_level, v.field_of_study, v.language, v.duration_note, v.tuition_note, v.funding_coverage_pct::integer, v.eligibility_note, v.deadline, v.requirements, v.source_url
from (values

  ('program', 'Master in Arid Land Agriculture (M.Sc.)',
   'King Abdulaziz University (KAU) -- Faculty of Environmental Sciences, Department of Agriculture', 'Saudi Arabia', 'Jeddah',
   'graduate', 'Arid Land Agriculture, Animal Production, Horticulture, Natural Resources, Field Crops and Soil Science, Crop Protection',
   'English', '2 years',
   null,
   null,
   'Offered as a General Master''s program with specialization tracks in Animal Production, Horticulture, Natural Resources, Field Crops and Soil Science, and Crop Protection. The official program page links to a separate admission-requirements page for the specific prerequisites rather than listing them itself -- confirm current requirements directly before applying. See the separate KAU International Graduate Scholarship row for a real, published funding route that covers this and other master''s programs university-wide.',
   null::date, null,
   'https://kau.edu.sa/en/programs/master-in-arid-land-agriculture'),

  ('scholarship', 'International Graduate Scholarship (Master''s & PhD, all fields except health sciences)',
   'King Abdulaziz University (KAU)', 'Saudi Arabia', 'Jeddah',
   'graduate, phd', 'All fields except health sciences (includes Arid Land Agriculture and other agriculture-related programs)',
   'English (exception: Arabic Language and Islamic Studies programs do not require an English exam)',
   null,
   null,
   null,
   'Official eligibility, as published: a prior university degree rated "very good" or higher, with certified transcripts from the Saudi Embassy; under 35 for Master''s programs (under 40 for PhD); "a record of good Conduct and must be medically fit"; English proficiency (TOEFL iBT minimum 61, or IELTS minimum 5, with the Arabic Language/Islamic Studies exception above); two recommendation letters from former professors; and a nomination letter from competent authorities in the applicant''s home country. Coverage is described qualitatively as "tuition fees, accommodation, and living expenses" plus "housing, health insurance, and academic guidance programs" -- no exact percentage or dollar figure is published, so this is not stated as a guaranteed 100% here.',
   null::date,
   'Submit the online application; some programs may carry additional eligibility criteria beyond this baseline.',
   'https://graduatestudies.kau.edu.sa/content-306-EN-278671')

) as v(kind, title, institution, country, city, degree_level, field_of_study, language, duration_note, tuition_note, funding_coverage_pct, eligibility_note, deadline, requirements, source_url)
where not exists (
  select 1 from public.study_opportunities existing
  where existing.institution = v.institution and existing.country = v.country and existing.kind = v.kind and existing.title = v.title
);
