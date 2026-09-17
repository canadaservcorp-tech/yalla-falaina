-- Seed data for public.study_opportunities (international-students vertical --
-- lib/yf/studyMatching.js). Run this ONCE against the real production
-- database (there is no dedicated admin-add-a-university UI -- rows can also
-- be corrected later through routes/admin-study-opportunities.js if the
-- normal submission review flow is used instead). Idempotent: re-running it
-- does nothing if a row with the same institution + country + kind already
-- exists.
--
-- WHY THIS FILE EXISTS: Hicham's ask ("write coding for all middle east
-- universities, because a lot of students wanna move locally, and specially
-- turkey and cyprus") plus his follow-up scope answers (cover Turkey, Cyprus,
-- and the full Middle East region; also allow fully local/home-country study
-- matches, not just "abroad"). This is the data half of that change -- the
-- code half (letting the concierge surface a seeker's OWN home country, not
-- just destinations) is the systemPrompt.js edit that ships alongside this
-- file in the same commit.
--
-- SOURCING DISCIPLINE (same rule as scripts/seed-medical-providers.sql):
-- every row below was verified against that institution's OWN official
-- website as of September 2026, with the exact page cited in source_url.
-- Third-party aggregator/marketplace sites (edarabia, unipage, Qogent,
-- studyportals, mastersportal, keystoneacademic, and similar "compare
-- universities" sites) were NOT used as a source for anything here.
--   - tuition_note is filled in ONLY where the institution's own official
--     site publishes a current figure. Where nothing verifiable was found,
--     tuition_note is left NULL and, where useful, requirements/
--     eligibility_note says so honestly instead of guessing.
--   - funding_coverage_pct is set ONLY for the four rows where an official
--     source states an exact percentage (Turkiye Burslari 100%, Near East
--     University 50%, Cyprus International University 50%, KFUPM 100%).
--     Every other row leaves it NULL -- "no verified percentage on file",
--     never an estimate.
--   - Country field: Northern Cyprus (TRNC) institutions are labeled
--     'Northern Cyprus (TRNC)' rather than folded into 'Cyprus', since it is
--     a materially different jurisdiction (recognized only by Turkey, not by
--     the UN/EU/Republic of Cyprus) with its own degree-recognition
--     implications -- flagged inline on each of those rows.
--
-- DELIBERATELY EXCLUDED (unverifiable on official sources as of this
-- research pass -- do not re-add without a real, cited figure):
--   Lebanon: Lebanese University (UL) -- official site blocked automated
--     access; only a secondhand reference to a fee-setting circular, no
--     verifiable figure or citable page.
--   Jordan: University of Jordan (JU) -- official fee pages (ju.edu.jo,
--     registration.ju.edu.jo) blocked automated access on every attempt.
--   Egypt: Egypt-Japan University of Science and Technology (E-JUST) --
--     tuition/application-fee page blocked (robots.txt/certificate errors);
--     no fee figure found elsewhere on the official site.
--   UAE: Khalifa University -- official page gives a flat AED 2,500/credit
--     hour figure but does not state which academic year it applies to.
--   Saudi Arabia: King Saud University (KSU) and King Abdulaziz University
--     (KAU) -- both official international-student pages are live but
--     content-empty/placeholder ("in development") as of this check.
--   Saudi Arabia: King Abdullah Scholarship Program (KASP) is confirmed
--     OUTBOUND-only (funds Saudi nationals studying abroad) -- does not
--     apply to this inbound-study table, so it is not seeded here at all.
--
-- Coverage: Turkey, Cyprus (both Northern Cyprus/TRNC and the Republic of
-- Cyprus), Lebanon, Jordan, Egypt, United Arab Emirates, Saudi Arabia,
-- Qatar, Kuwait. 30 rows (26 'program', 4 'scholarship').

insert into public.study_opportunities
  (kind, title, institution, country, city, degree_level, field_of_study, language, duration_note, tuition_note, funding_coverage_pct, eligibility_note, deadline, requirements, source_url)
select * from (values

  -- ==================== TURKEY ====================

  ('program', 'Undergraduate & Graduate Programs (Engineering, Architecture, Social Sciences)',
   'Middle East Technical University (METU / ODTU)', 'Turkey', 'Ankara',
   'undergraduate, graduate', 'Engineering, Architecture, Social Sciences, Economics & Administrative Sciences, Education',
   'English', null,
   'Published per-semester tuition for international students (2025-2026 academic year): Architecture & Engineering faculties USD 1,200 (TRY 28,379); Social Sciences USD 800 (TRY 17,849); Economics & Administrative Sciences USD 800 (TRY 21,444); Education USD 800 (TRY 19,062); Graduate programs (all fields) USD 375 (TRY 9,976) per semester.',
   null, null, null::date,
   'Apply through METU''s own international-student admissions office; see source for the current fee schedule.',
   'https://iso.metu.edu.tr/en/tuition-fee'),

  ('program', 'Undergraduate & Graduate Programs (Engineering, Economics & Administrative Sciences)',
   'Bogazici University', 'Turkey', 'Istanbul',
   'undergraduate, graduate', 'Engineering, Economics & Administrative Sciences, Science, Humanities, Education, Law',
   'English', null,
   'Published per-semester tuition for international students: Engineering and Economics & Administrative Sciences USD 5,000; Science, Humanities, Education, and Law USD 4,000; Graduate programs USD 500/semester (USD 1,000/year).',
   null,
   'Bogazici University''s official tuition page states it offers no institutional scholarships or financial aid for international students.',
   null::date, null,
   'https://intl.bogazici.edu.tr/tuition-undergraduate-and-graduate-degree-programs'),

  ('program', 'Undergraduate, Graduate & PhD Programs (Engineering, Business, Architecture)',
   'Bilkent University', 'Turkey', 'Ankara',
   'undergraduate, graduate, phd', 'Engineering, Business Administration, Architecture',
   'English', null,
   'Published annual tuition (incl. 10% VAT), varies by entry cohort: 2026 entrants USD 18,400/year; 2025 entrants USD 17,600/year; 2023-2024 entrants USD 16,950/year; pre-2023 entrants USD 16,300/year. Paid in two installments.',
   null, null, null::date, null,
   'https://w3.bilkent.edu.tr/bilkent/international-and-other-students-tuition-fees/'),

  ('program', 'Undergraduate, Graduate & PhD Programs (Business, Medicine, Engineering)',
   'Koc University', 'Turkey', 'Istanbul',
   'undergraduate, graduate, phd', 'Business Administration, Medicine, Engineering',
   'English', null,
   null, null, null,
   null::date,
   'Contact Koc University''s international admissions office directly for the current tuition schedule -- a fee table exists on their site but no figure could be independently verified.',
   'https://www.ku.edu.tr/en/admission/international-students/'),

  ('program', 'Undergraduate, Graduate & PhD Programs (Civil Engineering, Architecture, Naval/Marine Engineering)',
   'Istanbul Technical University (ITU)', 'Turkey', 'Istanbul',
   'undergraduate, graduate, phd', 'Civil Engineering, Architecture, Naval Architecture & Marine Engineering',
   'Turkish and English (mixed by program)', null,
   'Published annual tuition for 2023-24-and-later international-student cohorts (2025-2026 academic year), in TRY: Engineering & Architecture faculties (incl. Civil Engineering) TRY 94,500; Management TRY 86,500; Maritime-related faculties TRY 119,000; Arts & Sciences TRY 79,000; Postgraduate programs TRY 33,300.',
   null, null, null::date,
   'Closest official fit among the Turkish institutions researched to a civil-engineering/foundations background.',
   'https://www.sis.itu.edu.tr/EN/student/tuition-fee/fees/20261020/tutionfees.php'),

  ('scholarship', 'Turkiye Scholarships (Turkiye Burslari) -- Fully-Funded Government Scholarship',
   'Republic of Turkiye -- Turkiye Burslari (Presidency for Turks Abroad and Related Communities)', 'Turkey', null,
   'undergraduate, graduate, phd', null,
   'Turkish (1-year language prep included); program language varies by host university',
   'Full program duration; includes a mandatory 1-year Turkish-language preparation course before degree studies begin.',
   'Fully-funded: full tuition waiver at a Turkish public university, plus a monthly stipend, dormitory accommodation, general health insurance, and one round-trip international flight ticket.',
   100,
   'Official eligibility criteria include age caps: applicants must be under 21 for bachelor''s, under 30 for master''s, and under 35 for PhD programs -- a 22-year-old bachelor''s applicant is already over the limit and should look at university merit discounts instead. Minimum academic achievement: 70%% for undergraduate, 75%% for graduate applicants (90%% for health-science programs). Published monthly stipend: TRY 4,500 (associate/bachelor''s), TRY 6,500 (master''s), TRY 9,000 (PhD) -- doubled for merit-scholarship recipients. Dormitory housing is provided in full for undergraduates; for graduate/PhD students it is provided in year one only, then a housing allowance of TRY 6,000/month (Istanbul/Ankara) or TRY 5,000/month (elsewhere) applies. Figures are government-published and subject to annual revision -- confirm at application time.',
   null::date,
   'Apply directly at turkiyeburslari.gov.tr during the annual application window (typically opens December-February).',
   'https://turkiyeburslari.gov.tr/whyturkiyescholarships'),

  -- ==================== CYPRUS (Northern Cyprus/TRNC + Republic of Cyprus) ====================

  ('program', 'Undergraduate, Master''s & PhD Programs (Engineering, Business, Health Sciences)',
   'Eastern Mediterranean University (EMU)', 'Northern Cyprus (TRNC)', 'Famagusta',
   'undergraduate, graduate, phd', 'Engineering, Business, Health Sciences, Medicine',
   'English and Turkish', null,
   null, null,
   'Northern Cyprus (TRNC) is recognized only by Turkey; it is not recognized by the UN, EU, or the Republic of Cyprus -- a factor to weigh for degree recognition and visa processing outside Turkey.',
   null::date,
   'Contact EMU''s international office directly for the current fee schedule; a fee calculator exists on their site but no flat figure was independently verified.',
   'https://www.emu.edu.tr/fees'),

  ('program', 'Undergraduate Programs with Guaranteed Scholarship (Engineering, Computer Sciences, Medicine, Dentistry)',
   'Near East University (NEU)', 'Northern Cyprus (TRNC)', 'Nicosia',
   'undergraduate', 'Engineering, Computer Sciences, Medicine, Dentistry, Pharmacy, Veterinary Medicine',
   'English and Turkish (Dentistry offered in both)', null,
   'Published 2024-2025 annual tuition: standard programs EUR 5,600/year (before scholarship); Medicine EUR 12,600/year; Dentistry EUR 11,600/year (English) or EUR 9,400/year (Turkish); Pharmacy & Veterinary Medicine EUR 8,600/year.',
   50,
   'Official page states: "Up to 50% Scholarship is offered to all international students in all departments except Medicine and Dentistry" -- brings standard-program tuition to approx. EUR 2,800/year. Exact GPA/eligibility criteria are not detailed on the fee page itself. Northern Cyprus (TRNC) is recognized only by Turkey internationally.',
   null::date, null,
   'https://aday.neu.edu.tr/2024-2025-academic-year-program-fees/?lang=en'),

  ('program', 'Undergraduate, Master''s & PhD Programs (Aviation, Tourism & Hospitality, Health Sciences)',
   'Girne American University (GAU)', 'Northern Cyprus (TRNC)', 'Kyrenia (Girne)',
   'undergraduate, graduate, phd', 'Aviation, Tourism & Hospitality, Health Sciences, Engineering, Law, Pharmacy, Medicine',
   'English (Turkish tracks also available)', null,
   'Published 2025-2026 annual tuition: Business/Communication/Education etc. EUR 7,700/year; Engineering/Architecture/Law/Nursing/Tourism EUR 8,000/year; Pharmacy EUR 11,000/year; Medicine EUR 13,000/year; Aviation EUR 6,500-25,000/year depending on track; Master''s EUR 8,000/year; PhD EUR 12,500/year -- plus a EUR 500/year registration fee on top.',
   null,
   'A "40th Anniversary Special Tuition Fees" promotion is referenced on the official fee page but specific discount percentages are not published there. Northern Cyprus (TRNC) is recognized only by Turkey internationally.',
   null::date, null,
   'https://www.gau.edu.tr/en/prospective/page/tuition-fees'),

  ('program', 'Undergraduate & Graduate Programs with Guaranteed Scholarship (Engineering, Health Sciences)',
   'Cyprus International University (CIU)', 'Northern Cyprus (TRNC)', 'Nicosia',
   'undergraduate, graduate, phd', 'Civil, Electrical & Computer Engineering, Medicine, Pharmacy, Dentistry, Law, Business (MBA), Architecture (MArch)',
   'English (select programs explicitly English-medium)', null,
   null,
   50,
   'Official page states: "All undergraduate international students are granted a 50% tuition fee scholarship"; merit-based scholarships range from 50% to 100%; graduate scholarships are available for a CGPA of 3.50 or higher. Base annual tuition figures are not published on the pages checked -- contact the Registration Office directly. Northern Cyprus (TRNC) is recognized only by Turkey internationally.',
   null::date, null,
   'https://ciu.edu.tr/en/become-student/international/fees-and-scholarships'),

  ('program', 'Bachelor''s, Master''s & PhD Programs (Sciences, English Studies, French & European Studies)',
   'University of Cyprus (UCY)', 'Cyprus', 'Nicosia',
   'undergraduate, graduate, phd', 'Sciences, English Studies, French & European Studies',
   'Primarily Greek; English, French and Turkish only in specific departments', null,
   'Official page states: "For non-European students tuition fees are EUR 6,834 per academic year."',
   null, null, null::date, null,
   'https://www.ucy.ac.cy/study/undergraduate-studies/tuition-fees/?lang=en'),

  ('program', 'Undergraduate, Master''s, PhD & Foundation Programs (Medicine, Veterinary Medicine, Business, Law)',
   'University of Nicosia (UNIC)', 'Cyprus', 'Nicosia',
   'undergraduate, graduate, phd', 'Medicine, Veterinary Medicine, Business, Law',
   null, null,
   null, null, null,
   null::date,
   'Contact UNIC''s admissions office directly for the current non-EU tuition schedule; only an outdated (2023-2024) fee PDF was found publicly, so no current figure is used here.',
   'https://www.unic.ac.cy/nicosia/tuition-and-fees/'),

  -- ==================== LEBANON ====================

  ('program', 'Bachelor''s, Master''s, PhD & Professional Programs (Medicine, Engineering, Business)',
   'American University of Beirut (AUB)', 'Lebanon', 'Beirut',
   'undergraduate, graduate, phd', 'Medicine, Engineering, Business, Nursing, Agricultural & Food Sciences',
   'English', null,
   'Published AY2026-2027 per-credit-hour tuition (USD), charged for up to 15 credits/semester: Arts & Sciences (freshman) USD 881; Sciences USD 907; Financial Economics USD 1,044; Engineering & Architecture USD 1,022; Business USD 990; Health Sciences USD 953; Nursing USD 732; Agricultural & Food Sciences USD 924.',
   null,
   'AUB''s Office of Financial Aid offers both need-based grants and merit scholarships; specific award amounts are not published on the general scholarships page.',
   null::date, null,
   'https://www.aub.edu.lb/comptroller/Documents/Students/Tuition%20Fees.pdf'),

  ('program', 'Bachelor''s & Master''s Programs (Engineering, Business, Pharmacy)',
   'Lebanese American University (LAU)', 'Lebanon', 'Beirut and Byblos',
   'undergraduate, graduate', 'Engineering, Architecture, Business, Science & Liberal Arts, Pharmacy, Nursing, Design',
   'English', null,
   'Published AY2025-2026 per-credit-hour tuition (USD): Engineering USD 935; Architecture USD 942; Business USD 911; Science & Liberal Arts USD 859; Education/English/Psychology/Political Science USD 770; Pharmacy USD 999; Design USD 942; Nursing (new students) USD 659.',
   null,
   'LAU publishes a need-based financial aid program; specific award figures are not published on the general page.',
   null::date, null,
   'https://www.lau.edu.lb/fees/2025-2026/'),

  ('program', 'Bachelor''s, Master''s & Doctorate Programs (Medicine, Law, Engineering, Business)',
   'Universite Saint-Joseph de Beyrouth (USJ)', 'Lebanon', 'Beirut',
   'undergraduate, graduate, phd', 'Medicine, Law, Engineering (ESIB), Business',
   'French (primary); some bilingual/English tracks', null,
   null, null,
   'USJ publishes several named scholarship programs (per its official FAQ, AY2024-2025): need-based social-criteria grants, merit scholarships (bourses d''excellence), sports scholarships (10-40%), named programs (Magis, ISEB, ETLAM, FSI-HDF), international-student scholarships, an Erasmus+ mobility grant (EUR 850/month), a FUCE mobility grant (EUR 600/month), and embassy-sponsored (France/USA) scholarships. Specific eligibility and amounts vary by program -- confirm directly.',
   null::date,
   'A USD 75 non-refundable application fee applies; no per-year tuition figure is published on the official pages checked.',
   'https://www.usj.edu.lb/e-doors/pdf/faq.pdf'),

  -- ==================== JORDAN ====================

  ('program', 'Graduate Programs incl. Medicine & Higher Specialty (Diploma, Master''s)',
   'Jordan University of Science and Technology (JUST)', 'Jordan', 'Irbid',
   'graduate', 'Medicine, Oral & Maxillofacial Surgery, Engineering, Science',
   'English (Medicine, Engineering, Science)', null,
   'Published per-credit-hour tuition for non-Jordanian graduate students: Diploma/Master''s USD 250/credit hour; Higher Specialty in Medicine and in Oral & Maxillofacial Surgery USD 3,000/year (12 credit hours/year). Academic year not stated in the source document.',
   null, null, null::date, null,
   'https://www.just.edu.jo/FacultiesandDepartments/FacultyofGraduateStudies/Documents/Fees-Non-Jordanians-English.pdf'),

  ('program', 'Bachelor''s & Master''s Programs with Study-Year-in-Germany Track',
   'German Jordanian University (GJU)', 'Jordan', 'Amman',
   'undergraduate, graduate', 'Applied Humanities & Social Sciences, Electrical Engineering & IT, Design & Media Informatics, Nursing, Engineering',
   'English, with a mandatory study year in Germany for some programs', null,
   'Published per-credit-hour tuition (JOD, academic year not stated in the source): Applied Humanities & Social Sciences 70 JOD; Electrical Engineering & IT 100 JOD; Design & Media Informatics 110 JOD; Nursing (new students) 110 JOD; other Engineering schools 130 JOD; plus a flat semester services fee of 557 JOD for all schools.',
   null, null, null::date, null,
   'https://www.gju.edu.jo/sites/default/files/fees_3.pdf'),

  ('program', 'Bachelor''s, Master''s & PhD Programs (Computing, Engineering, Business Technology)',
   'Princess Sumaya University for Technology (PSUT)', 'Jordan', 'Amman',
   'undergraduate, graduate, phd', 'Computing Sciences & Engineering, Business Technology, Computer Science',
   'English', null,
   'Published per-credit-hour tuition (JOD, academic year not stated in the source): Computing Sciences & Engineering schools 130 JOD/credit; Business Technology 120 JOD/credit; Master''s 150 JOD/credit; PhD Computer Science 300 JOD/credit.',
   null,
   'PSUT also runs a study-abroad option: a JOD 1,000 deposit with JOD 300 deducted per semester spent abroad, while students continue paying regular PSUT tuition and receive 33-45% off partner-university rates.',
   null::date, null,
   'https://psut.edu.jo/en/study-plans'),

  -- ==================== EGYPT ====================

  ('program', 'Undergraduate & Graduate Programs (Business, Engineering, Political Science/Middle East Studies)',
   'The American University in Cairo (AUC)', 'Egypt', 'New Cairo',
   'undergraduate, graduate', 'Business, Engineering, Political Science, Middle East Studies',
   'English', null,
   'Published per-credit-hour undergraduate tuition (current as of a July 2026 page update): Egyptian students USD 700/credit hour; international students USD 735/credit hour.',
   null,
   'AUC''s "Excellence Scholarship Program" is a real, named merit scholarship (stackable up to 100% tuition coverage), not designated as international-only. A separate "Egyptian Public Schools Scholarships" program is explicitly Egyptian-only.',
   null::date, null,
   'https://www.aucegypt.edu/admissions/tuition-and-financial-assistance'),

  ('program', 'Bachelor''s, Master''s & PhD Programs (Engineering, Pharmacy & Biotechnology, Management Technology, Law)',
   'German University in Cairo (GUC)', 'Egypt', 'New Cairo',
   'undergraduate, graduate, phd', 'Engineering (incl. Civil Engineering), Pharmacy & Biotechnology, Management Technology, Law, Applied Sciences & Arts, Dentistry',
   'English, with mandatory German-language study', null,
   'Published 2026-2027 per-semester tuition for foreign/international students: EUR 3,800-5,150 (Engineering, Management, Pharmacy, Law); EUR 4,050 (Applied Sciences & Arts); EUR 5,000-7,000 (Dentistry). Egyptian students are billed separately in EGP. A non-refundable EGP 1,200 application-evaluation fee applies.',
   null,
   'Fee tiers (A/B/C) are set by admission score; scholarship retention requires a GPA of 3.5 or higher. No separately named international-only scholarship was found.',
   null::date, null,
   'https://www.guc.edu.eg/en/admission/undergraduate/tuition_fees/'),

  ('program', 'Foreign-Student ("Wafedeen") Admission -- Faculty of Science',
   'Cairo University', 'Egypt', 'Giza',
   'undergraduate', 'Science (Faculty of Science only -- figure is faculty-specific, not university-wide)',
   'Arabic and English tracks (English track requires a 70%+ English admission score)', null,
   'Faculty of Science only (2021-2022 guide, may be outdated): foreign ("Wafedeen") students enrolled from 2016/17 onward pay USD 5,500 for year one (USD 1,500 enrollment + USD 4,000 tuition), plus faculty fees; the pre-2016 legacy rate was GBP 3,000/year. This figure is faculty-specific and should NOT be assumed to apply university-wide -- Cairo University''s central international-student office publishes no university-wide fee table.',
   null, null, null::date,
   'Apply through Cairo University''s Expatriates Care Bureau / International Student Services.',
   'https://cu.edu.eg/International_student_services'),

  ('program', 'International/Foreign-Student Admission',
   'Ain Shams University', 'Egypt', 'Cairo',
   'undergraduate, graduate', null, null, null,
   'No absolute fee figure is published; the official page states only that "enrolled international students shall pay 25% of the cost per month, while non-grant international students pay the actual cost, such as Egyptian students" -- treat as a fee-structure description, not a verified number.',
   null,
   'The page references an internal "grant international students" track and Egypt''s government early-registration portal (admission.study-in-egypt.gov.eg), but names no specific scholarship or amount.',
   null::date, null,
   'https://www.asu.edu.eg/ismo/'),

  -- ==================== UNITED ARAB EMIRATES ====================

  ('program', 'Undergraduate & Graduate Programs (Engineering, Architecture)',
   'American University of Sharjah (AUS)', 'United Arab Emirates', 'Sharjah',
   'undergraduate, graduate', 'Engineering, Architecture',
   'English', null,
   'Published AY2026-2027 tuition (all majors, no separate international-student rate stated): AED 110,876/year (AED 55,438/semester, 12-16 credits), plus lab/technology fees of AED 1,552-1,700 per course.',
   null, null, null::date, null,
   'https://www.aus.edu/admissions/bachelors-degrees/undergraduate-tuition-and-fees'),

  ('program', 'Undergraduate through PhD Programs (Engineering, Law, Communication)',
   'University of Sharjah', 'United Arab Emirates', 'Sharjah',
   'undergraduate, graduate, phd', 'Engineering, Islamic/Sharia Studies, Communication, Law',
   'English and Arabic depending on college', null,
   'Published official per-semester fee schedule (no separate non-UAE-national rate found): approx. AED 30,351/semester (~AED 60,703/year) for most colleges, incl. engineering and English-medium law; Islamic/Sharia Studies AED 22,522/semester; Communication AED 31,168/semester. Excludes Medicine/Dentistry.',
   null, null, null::date, null,
   'https://uosadmission.sharjah.ac.ae/assets/image/Tuition_Fees_En.pdf'),

  ('program', 'Undergraduate Programs for International Students (Engineering, Agriculture, Veterinary Medicine)',
   'United Arab Emirates University (UAEU)', 'United Arab Emirates', 'Al Ain',
   'undergraduate', 'Engineering, Agriculture, Veterinary Medicine',
   'English and Arabic', null,
   'Published international-student rate, AY2026/27 onward: AED 2,661/credit hour, totaling approx. AED 319,320 (120 credits, most programs), AED 351,252 (engineering, 132 credits), or AED 465,675 (veterinary medicine, 175 credits). AY2025/26-and-earlier cohorts were billed AED 2,500/credit (engineering/science), AED 2,300/credit (business), or AED 1,900/credit (humanities/education).',
   null, null, null::date, null,
   'https://www.uaeu.ac.ae/en/dvcsae/student_account_office/program-and-housing-rates-international-students-undergraduate-students.shtml'),

  -- ==================== SAUDI ARABIA ====================

  ('scholarship', 'International Undergraduate & Graduate Scholarship (Full Tuition Waiver)',
   'King Fahd University of Petroleum and Minerals (KFUPM)', 'Saudi Arabia', 'Dhahran',
   'undergraduate, graduate, phd', 'Petroleum & Energy Engineering, Engineering, Science',
   'English', null,
   'Self-sponsored (non-scholarship) graduate fees, where published: USD 135/credit hour, plus a USD 2,000/semester registration fee for non-thesis/MBA tracks.',
   100,
   'Official page states international undergraduate tuition is fully waived, with free housing, textbooks, and a monthly stipend; graduate international students (PhD and most Master''s tracks) receive comprehensive funding covering stipend, housing, and airfare in addition to a medical allowance.',
   null::date, null,
   'https://www.kfupm.edu.sa/study/international-students/fees-and-scholarships'),

  -- ==================== QATAR ====================

  ('program', 'Undergraduate through PhD Programs (Business, Sciences, Engineering, Medicine)',
   'Qatar University', 'Qatar', 'Doha',
   'undergraduate, graduate, phd', 'Arts, Education, Law, Sharia, Business, Sciences, Health, Nursing, Engineering, Pharmacy, Medicine, Dentistry, Arabic for Non-Native Speakers',
   'Arabic and English', null,
   'Published per-credit-hour rate card (Fall 2026 onward), charged by college rather than by nationality: Arts/Education/Law/Sharia QAR 1,200/credit; Business/Sciences/Health/Nursing QAR 1,400/credit; Engineering/Pharmacy QAR 1,600/credit; Arabic for Non-Native Speakers QAR 1,700/credit; Medicine/Dentistry billed annually (QAR 45,400-149,000 depending on year).',
   null, null, null::date, null,
   'https://www.qu.edu.qa/en-us/students/admission/undergraduate/Pages/tuition-fees.aspx'),

  ('program', 'Bachelor''s in Foreign Service / International Affairs (Education City Branch Campus)',
   'Georgetown University in Qatar', 'Qatar', 'Doha (Education City)',
   'undergraduate', 'Foreign Service, International Affairs',
   'English', null,
   'Published AY2026-2027 tuition: USD 74,520/year (USD 37,260/semester; USD 3,105/credit hour part-time), plus an activity fee of USD 211/year, books USD 1,220/year, and health insurance USD 750/year.',
   null,
   'Limited need-based financial aid is available; Qatar Foundation/HEI-sponsored students receive separate support arrangements.',
   null::date, null,
   'https://www.qatar.georgetown.edu/admissions/financial-aid/tuition-and-fees/'),

  -- ==================== KUWAIT ====================

  ('program', 'Undergraduate Programs incl. Engineering & Applied Sciences',
   'American University of Kuwait (AUK)', 'Kuwait', 'Salmiya',
   'undergraduate', 'Engineering & Applied Sciences, Business, Liberal Arts',
   'English', null,
   'Published AY2025-2026 tuition: KWD 210/credit hour (regular programs), KWD 230/credit hour (Engineering & Applied Sciences); Intensive English KWD 2,250/semester; plus a KWD 50/semester activity fee.',
   null, null, null::date, null,
   'https://www.auk.edu.kw/admissions-aid/tuition-fees'),

  ('program', 'Undergraduate & MBA Programs (Business, Engineering)',
   'Gulf University for Science and Technology (GUST)', 'Kuwait', 'Hawally / Mubarak Al-Abdullah',
   'undergraduate, graduate', 'Business, Arts and Sciences, Engineering, MBA',
   'English', null,
   'Published tuition (academic year not stated on the source page): KWD 210/credit hour (Business & Arts and Sciences), KWD 260/credit hour (Engineering); Foundation English KWD 1,920/semester-level; MBA KWD 240/credit hour.',
   null, null, null::date, null,
   'https://www.gust.edu.kw/admissions/fees-payment-details')

) as v(kind, title, institution, country, city, degree_level, field_of_study, language, duration_note, tuition_note, funding_coverage_pct, eligibility_note, deadline, requirements, source_url)
where not exists (
  select 1 from public.study_opportunities existing
  where existing.institution = v.institution and existing.country = v.country and existing.kind = v.kind
);

-- Every tuition/scholarship figure above should be re-verified periodically --
-- university fee schedules change yearly and a stale number is worse than an
-- honest "contact the institution directly" (same discipline as the medical-
-- providers seed). Institutions/facts listed under "DELIBERATELY EXCLUDED"
-- above are candidates for a follow-up research pass, not omissions to just
-- fill in with a guess.
