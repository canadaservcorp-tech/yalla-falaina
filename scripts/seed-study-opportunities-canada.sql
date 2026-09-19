-- Seed data for public.study_opportunities (international-students vertical --
-- lib/yf/studyMatching.js). Run this ONCE against the real production
-- database. Idempotent: re-running it does nothing if a row with the same
-- institution + country + kind already exists.
--
-- WHY THIS FILE EXISTS: a real seeker asked the concierge "master's in
-- agriculture in Montreal" and got an honest but useless answer -- not
-- because the concierge is broken, but because Canada had ZERO rows in
-- study_opportunities. That's a real, significant gap: Canada is this
-- platform's flagship Western work-track destination (Section 3 of the
-- feature summary), yet the study vertical had no Canadian data at all. This
-- file starts closing that gap with the exact real, sourced programs that
-- answer the reported query, rather than every Canadian university at once.
--
-- SOURCING DISCIPLINE (same rule as the medical-providers and MENA seeds):
-- every row below was verified against that institution's OWN official
-- website this session, with the exact page cited in source_url. No
-- aggregator/marketplace site was used.
--   - tuition_note is filled in only with what's actually published. McGill's
--     official 2026-27 international graduate tuition-rate page gives a
--     McGill-wide rate structure (not per-program), so that structure is
--     quoted the same way on all three McGill rows below, with an explicit
--     note that it's institution-wide, not program-specific.
--   - McGill's official funding statement -- "all students admitted to a
--     thesis-based graduate program in the Faculty of Agricultural and
--     Environmental Sciences receive financial awards to cover tuition and
--     other fees for the duration of their program" -- is real and
--     significant (a near-full-funding guarantee for thesis-based admits),
--     quoted verbatim in eligibility_note. It explicitly does NOT apply to
--     the one non-thesis program below (Animal Science M.Sc.A.), which is
--     flagged accordingly.
--   - Universite Laval's own tuition pages exist but their actual dollar
--     figures render only inside a further linked table/PDF that did not
--     load during this research pass -- left NULL rather than guessed. Its
--     real fee-reduction agreements (French/francophone-Belgian mobility,
--     Quebec Selection Certificate holders, etc.) are noted honestly instead.
--
-- MONTREAL VS. QUEBEC CITY: the two Universite Laval (FSAA) rows below are in
-- Quebec City, roughly 2.5 hours from Montreal -- NOT the same city the
-- original query asked about. Each row's city field says so explicitly, and
-- systemPrompt.js has a matching rule (see the "Europe"-style disambiguation
-- guardrail) telling the concierge to name this real nearby option honestly
-- rather than silently expanding "Montreal" to "Quebec" or vice versa.
--
-- DELIBERATELY NOT COVERED YET: every other Canadian province/city, and
-- every other Western-track country (US, Australia, NZ, Europe) that
-- Section 3's job-matching table already lists as a destination. This file
-- is a first, narrow, real answer to one reported gap -- not a claim that
-- Canada or the Western track is now fully curated for study.

insert into public.study_opportunities
  (kind, title, institution, country, city, degree_level, field_of_study, language, duration_note, tuition_note, funding_coverage_pct, eligibility_note, deadline, requirements, source_url)
select v.kind, v.title, v.institution, v.country, v.city, v.degree_level, v.field_of_study, v.language, v.duration_note, v.tuition_note, v.funding_coverage_pct::integer, v.eligibility_note, v.deadline, v.requirements, v.source_url
from (values

  ('program', 'Master of Science (M.Sc.) in Agricultural Economics',
   'McGill University -- Faculty of Agricultural and Environmental Sciences (Macdonald Campus)', 'Canada', 'Montreal (Sainte-Anne-de-Bellevue campus)',
   'graduate', 'Agricultural Economics',
   'English', null,
   'McGill-wide official 2026-27 international graduate tuition structure (not specific to this program): non-thesis per-credit rate for Fall 2026 admits CAD 1,094.42/credit; full-time thesis-residency term rate CAD 10,674.30/term. Confirm this specific program''s thesis/funding status directly with the department -- see the funding note below.',
   null,
   'Official admission requirement: an eligible bachelor''s degree with a minimum 3.0 GPA out of 4.0, plus English-language proficiency. McGill''s own Macdonald Campus graduate-studies page states: "All students admitted to a thesis-based graduate program in the Faculty of Agricultural and Environmental Sciences receive financial awards to cover tuition and other fees for the duration of their program."',
   null::date, null,
   'https://www.mcgill.ca/gradapplicants/program/agricultural-economics-msc'),

  ('program', 'Master of Science (M.Sc.) in Food Science and Agricultural Chemistry',
   'McGill University -- Faculty of Agricultural and Environmental Sciences (Macdonald Campus)', 'Canada', 'Montreal (Sainte-Anne-de-Bellevue campus)',
   'graduate', 'Food Science, Agricultural Chemistry',
   'English', null,
   'McGill-wide official 2026-27 international graduate tuition structure (not specific to this program): non-thesis per-credit rate for Fall 2026 admits CAD 1,094.42/credit; full-time thesis-residency term rate CAD 10,674.30/term. Confirm this specific program''s thesis/funding status directly with the department -- see the funding note below.',
   null,
   'Official admission requirement: an eligible bachelor''s degree with a CGPA of at least 3.4 out of 4.0, plus English-language proficiency. Welcomes applicants with a background in food science, microbiology, chemistry, biochemistry, or post-harvest processing. Same Faculty-wide funding statement as the Agricultural Economics M.Sc. above applies to thesis-based admits.',
   null::date,
   'Official application deadlines: Fall intake -- international students Jan 15, domestic students Mar 15; Winter intake -- international students Jul 15, domestic students Sep 1.',
   'https://www.mcgill.ca/gradapplicants/program/food-science-agricultural-chemistry-msc'),

  ('program', 'Master of Science, Applied (M.Sc.A.) in Animal Science (Non-Thesis): Sustainable Agriculture',
   'McGill University -- Faculty of Agricultural and Environmental Sciences (Macdonald Campus)', 'Canada', 'Montreal (Sainte-Anne-de-Bellevue campus)',
   'graduate', 'Animal Science, Sustainable Agriculture',
   'English', null,
   'McGill-wide official 2026-27 international graduate tuition structure (not specific to this program): non-thesis per-credit rate for Fall 2026 admits CAD 1,094.42/credit.',
   null,
   'Non-thesis (professional/applied) program -- the Faculty''s thesis-based funding guarantee (see the other two McGill rows) does NOT apply here. Confirm current admission requirements directly with the department.',
   null::date, null,
   'https://www.mcgill.ca/study/2024-2025/faculties/macdonald/graduate/programs/master-science-applied-msca-animal-science-non-thesis-sustainable-agriculture'),

  ('program', 'Maitrise en agroeconomie, avec memoire (Master''s in Agricultural Economics, thesis)',
   'Universite Laval -- Faculte des sciences de l''agriculture et de l''alimentation (FSAA)', 'Canada', 'Quebec City -- NOT Montreal (about 2.5 hours away)',
   'graduate', 'Agricultural Economics, Agroeconomy',
   'French', null,
   null, null, null,
   null::date,
   'Contact FSAA directly (infoprogrammes@fsaa.ulaval.ca) for current admission requirements and tuition -- the published fee tables did not render during this research pass. International-student tuition supplements may be reduced or waived under specific agreements (French/francophone-Belgian mobility agreements, Quebec Selection Certificate holders, and others) -- see Universite Laval''s official international-tuition pages.',
   'https://www.fsaa.ulaval.ca/etudes/cycles-superieurs/agroeconomie'),

  ('program', 'Maitrise en economie rurale (Master''s in Rural Economics)',
   'Universite Laval -- Faculte des sciences de l''agriculture et de l''alimentation (FSAA)', 'Canada', 'Quebec City -- NOT Montreal (about 2.5 hours away)',
   'graduate', 'Rural Economics, Agricultural Economics',
   'French', null,
   null, null, null,
   null::date,
   'Contact FSAA directly (infoprogrammes@fsaa.ulaval.ca) for current admission requirements and tuition -- the published fee tables did not render during this research pass. International-student tuition supplements may be reduced or waived under specific agreements (French/francophone-Belgian mobility agreements, Quebec Selection Certificate holders, and others) -- see Universite Laval''s official international-tuition pages.',
   'https://www.fsaa.ulaval.ca/etudes/cycles-superieurs/agroeconomie')

) as v(kind, title, institution, country, city, degree_level, field_of_study, language, duration_note, tuition_note, funding_coverage_pct, eligibility_note, deadline, requirements, source_url)
where not exists (
  select 1 from public.study_opportunities existing
  where existing.institution = v.institution and existing.country = v.country and existing.kind = v.kind and existing.title = v.title
);

-- This file's dedup key adds `title` (unlike the MENA seed's institution+
-- country+kind) because three of these five rows deliberately share one
-- institution+country+kind (McGill, Canada, program) -- without `title` in
-- the key, only the first McGill row would ever insert and the other two
-- would silently be treated as duplicates.
