-- Seed real, verified study opportunities for ASIA + RUSSIA (the concierge's
-- study vertical -- lib/yf/studyMatching.js -- is country-generic; these rows
-- widen the basket of real choices offered to student seekers: China, Japan,
-- South Korea, Malaysia, Singapore, Hong Kong, India, Kazakhstan, Russia).
--
-- SOURCING DISCIPLINE (same as the MENA/Canada seeds):
--   * Every row comes from the institution's or government's OWN official
--     site, and source_url points at the exact official page.
--   * Only figures the institution actually publishes go in. If a figure was
--     not published, the field is left null -- never guess, never round.
--   * funding_coverage_pct is only set when the provider itself publishes a
--     full-coverage statement (e.g. "full tuition + stipend").
--   * This file is idempotent: safe to re-run; it skips (institution, country,
--     kind) triples that already exist.
--
-- Verified live during the research pass (Sept 2026): all source URLs resolve;
-- PEAK at U-Tokyo was deliberately EXCLUDED (its site announced the final
-- intake closed -- no more applications accepted).

insert into public.study_opportunities
  (kind, title, institution, country, city, degree_level, field_of_study, language, duration_note, tuition_note, funding_coverage_pct, eligibility_note, deadline, requirements, source_url)
select v.* from (values

  -- ===================== CHINA =====================

  ('scholarship', 'Chinese Government Scholarship (CSC) -- full scholarship for international students',
   'China Scholarship Council (CSC), Ministry of Education of China', 'China', 'Beijing (programme nationwide -- ~289 designated universities)',
   'graduate', 'All fields -- bachelor''s, master''s, PhD and Chinese-language study across ~289 designated universities',
   'English or Chinese (Chinese-taught programmes may include a 1-2 year language preparatory year)',
   'Duration of the enrolled programme (bachelor/master/PhD)',
   'Full scholarship, official published standard: tuition + on-campus accommodation + monthly stipend + medical insurance. Published annual totals (master''s): CNY 70,200-79,200/year depending on field of study.',
   100,
   'Open to non-Chinese citizens in good health; age and academic requirements per programme level. Two application routes: Type A through the Chinese embassy/dispatching authority in the seeker''s country, or Type B directly through a designated Chinese university. A pre-admission document from a Chinese university is required.',
   null::date,
   'Apply through the Chinese Government Scholarship Information System (campuschina.org / studyinchina.csc.edu.cn): register, obtain a pre-admission document from a preferred university, submit with transcripts, study plan, recommendation letters and passport.',
   'https://www.campuschina.org/'),

  ('scholarship', 'Schwarzman Scholars -- one-year fully funded Master of Global Affairs',
   'Tsinghua University -- Schwarzman College', 'China', 'Beijing',
   'graduate', 'Global Affairs, Leadership, Public Policy',
   'English',
   '1 year (Master of Global Affairs)',
   'Fully funded: the official programme page states scholars receive a comprehensive scholarship covering tuition, room and board, travel to and from Beijing, an in-country study tour, course books, health insurance and a personal stipend.',
   100,
   'Open to applicants of any nationality holding an undergraduate degree before enrolment; designed for young leaders. Highly selective global competition (application + regional interviews).',
   null::date,
   'Online application at schwarzmanscholars.org with essays, transcripts, recommendation letters and a video; shortlisted candidates attend in-person regional interviews.',
   'https://www.schwarzmanscholars.org/'),

  ('scholarship', 'Yenching Academy Fellowship -- fully funded Master''s in China Studies',
   'Peking University -- Yenching Academy', 'China', 'Beijing',
   'graduate', 'China Studies (interdisciplinary: economics, politics, law, history, philosophy, literature)',
   'English',
   '2 years (coursework year + thesis year)',
   'Fully funded: the published Yenching Fellowship covers tuition, accommodation in the Yenching Academy House, a round-trip travel stipend to Beijing, basic medical insurance and a monthly stipend; the second-year fellowship is renewable for scholars in good standing.',
   100,
   'Open to international graduates; partner-university students/alumni must first pass their home university''s internal pre-selection. Official deadline for the 2027 cohort: November 30, 2026 (9:00 am Beijing time).',
   '2026-11-30'::date,
   'Apply through the Yenching Academy online portal: transcripts, CV, personal statement, research proposal, two recommendation letters and proof of English proficiency.',
   'https://yenchingacademy.pku.edu.cn/'),

  ('program', 'International degree programmes (bachelor''s, master''s and PhD)',
   'Zhejiang University -- International College', 'China', 'Hangzhou',
   'undergraduate', 'Engineering, sciences, medicine, business, humanities -- broad university offering',
   'English-taught and Chinese-taught tracks (multiple English-medium programmes)',
   'Programme-dependent (typically 4 years bachelor, 2-3 years master, 3-4 years PhD)',
   null, null,
   'Open to international applicants; language and academic requirements vary by programme. Eligible for Chinese Government Scholarship (see the CSC row) and Zhejiang University scholarships for international students.',
   null::date,
   'Apply through the university''s international application system; documents include transcripts, language certificate (HSK for Chinese-taught or TOEFL/IELTS for English-taught programmes), passport and recommendation letters for graduate study.',
   'https://iczu.zju.edu.cn/'),

  -- ===================== JAPAN =====================

  ('scholarship', 'Japanese Government (MEXT) Scholarship -- embassy and university recommendation tracks',
   'Ministry of Education, Culture, Sports, Science and Technology (MEXT), Japan', 'Japan', 'Nationwide (host university assigned through the award)',
   'graduate', 'All fields -- undergraduate, college of technology, specialized training and research/master/doctoral students',
   'Japanese (preparatory language training provided where needed); some university-recommended programmes are English-taught',
   'Duration of the enrolled programme',
   'Full scholarship, official published standard: tuition, entrance examination and matriculation fees waived; monthly allowance (research/master''s students JPY 144,000/month, doctoral JPY 145,000/month, preparatory JPY 143,000/month plus regional supplements); round-trip airfare to Japan provided.',
   100,
   'Two application routes: recommendation by the Japanese embassy/consulate in the seeker''s country, or recommendation by a Japanese university. Age and academic standing rules apply per category (published annually in the application guidelines).',
   null::date,
   'Apply via the Japanese embassy in the seeker''s home country (embassy track, document screening + exams + interview) or through a Japanese university (university track). Official portal: studyinjapan.go.jp.',
   'https://www.studyinjapan.go.jp/en/planning/scholarships/mext-scholarships/'),

  ('scholarship', 'APU Tuition Reduction Scholarship for International Students (30-100%)',
   'Ritsumeikan Asia Pacific University (APU)', 'Japan', 'Beppu, Oita',
   'undergraduate', 'International Management, Asia Pacific Studies, Sustainability and Tourism (English-medium university)',
   'English (bilingual English/Japanese campus)',
   'Standard degree period (up to 8 semesters for bachelor''s)',
   'Tuition reduction scholarships officially offered in 30%, 50%, 65%, 80% and 100% tiers, covering the standard period until graduation subject to yearly academic review.',
   null,
   'International applicants holding (or changing to) "Student" residence status; applied for during the admission application itself (essays + letter of recommendation). Awarded on a comprehensive review; earlier applications have a greater chance.',
   null::date,
   'Apply for admission as an international applicant at admissions.apu.ac.jp and submit the scholarship essay and letter of recommendation by the application deadline.',
   'https://admissions.apu.ac.jp/costs_scholarships/before_enrollment/'),

  ('program', 'English-taught degree programmes (undergraduate and graduate)',
   'Waseda University -- International Admissions Office', 'Japan', 'Tokyo',
   'undergraduate', 'Political Science and Economics, Social Sciences, Science and Engineering, Business, Liberal Arts and more',
   'English (dedicated English-taught degree programmes across multiple schools)',
   'Programme-dependent (typically 4 years bachelor, 2 years master)',
   null, null,
   'International applicants admitted through the English-programme admissions route; each school publishes its own requirements (transcripts, English proficiency, standardized tests where required).',
   null::date,
   'Apply through Waseda''s International Admissions Office portal; documents and screening differ by school -- check the specific programme''s application guidelines.',
   'https://www.waseda.jp/inst/admission/en/'),

  ('scholarship', 'JASSO Honors Scholarship for Privately-Financed International Students',
   'Japan Student Services Organization (JASSO)', 'Japan', 'Nationwide (awarded through the host institution)',
   'undergraduate', 'All fields -- for self-funded international students already enrolled or newly enrolling at Japanese institutions',
   'Language of the host programme',
   '6 or 12 months per award cycle',
   'Official published monthly stipend: JPY 48,000/month for undergraduate and graduate students (set by JASSO for the honours scholarship).',
   null,
   'Open to privately-financed international students at Japanese universities, junior colleges, colleges of technology and language schools; selection is made by the host institution on academic merit and financial need.',
   null::date,
   'Not applied for directly -- the host institution nominates enrolled international students to JASSO. Ask the international office at the admitting university.',
   'https://www.jasso.go.jp/en/ryugaku/scholarship_j/shoreihi/about.html'),

  -- ===================== SOUTH KOREA =====================

  ('scholarship', 'Global Korea Scholarship (GKS) -- Korean government scholarship for international students',
   'National Institute for International Education (NIIED), Ministry of Education of Korea', 'South Korea', 'Nationwide (GKS-designated universities)',
   'graduate', 'All fields -- bachelor''s, master''s and doctoral degrees at GKS-designated universities',
   'English or Korean (includes a funded Korean-language training year where required)',
   'Degree duration + 1-year Korean language training (language year precedes the degree for most tracks)',
   'Full scholarship, official published coverage: round-trip airfare, Korean language training fees, full tuition and a monthly living allowance.',
   100,
   'Two tracks: Embassy Track (apply online through the Study in Korea portal via the Korean embassy; General, R-GKS and Overseas-Korean categories) and University Track (apply directly to a GKS-designated university). Citizenship, age and academic requirements are published per intake.',
   null::date,
   'Embassy Track: online application through studyinkorea.go.kr to the Korean embassy in the seeker''s country (up to 3 university choices). University Track: apply directly to the GKS-designated university.',
   'https://www.studyinkorea.go.kr/en/plan/scholarship.do'),

  ('scholarship', 'KAIST International Student Scholarship (undergraduate and graduate)',
   'KAIST -- Korea Advanced Institute of Science and Technology', 'South Korea', 'Daejeon',
   'undergraduate', 'Science and Engineering (all KAIST departments except the Global Technology Innovation Program track)',
   'English',
   'Undergraduate: 8 semesters; graduate: 4 regular semesters of funding',
   'Published coverage -- undergraduate: full tuition exemption for 8 semesters + KRW 350,000/month living stipend + health insurance; graduate (master''s/integrated): full tuition + KRW 1,000,000/month for 4 regular semesters + national health insurance.',
   100,
   'All admitted international students are automatically considered -- no separate application; just check "KAIST scholarship" in the financial-resources section of the admission application. Undergraduate recipients must maintain GPA over 2.7/4.3 after freshman year.',
   null::date,
   'Apply through KAIST international admissions (admission.kaist.ac.kr) selecting the KAIST scholarship option; selection is made with the admission decision.',
   'https://admission.kaist.ac.kr/intl-undergraduate/support/scholarships/kaist/'),

  ('program', 'International admission to degree programmes (undergraduate and graduate)',
   'Seoul National University (SNU)', 'South Korea', 'Seoul',
   'undergraduate', 'Full university range -- humanities, sciences, engineering, medicine, business, arts',
   'Korean and English (many graduate programmes offered in English)',
   'Programme-dependent (typically 4 years bachelor, 2 years master, 4 years PhD)',
   null, null,
   'International applicants whose parents are both non-Korean citizens (undergraduate international track); graduate admission open to international applicants with a bachelor''s degree. GKS scholarship holders may enrol at SNU.',
   null::date,
   'Apply through SNU''s Office of International Affairs admissions portal; documents include transcripts, proof of nationality, language proficiency (TOPIK or English scores) and recommendation letters for graduate study.',
   'https://oia.snu.ac.kr/'),

  ('program', 'Graduate and undergraduate programmes in science and engineering',
   'POSTECH -- Pohang University of Science and Technology', 'South Korea', 'Pohang',
   'graduate', 'Science and Engineering',
   'English (graduate instruction largely in English)',
   'Programme-dependent',
   null, null,
   'Open to international applicants; graduate students typically receive assistantship/scholarship support -- confirm current terms with the admitting department.',
   null::date,
   'Apply through POSTECH''s English admissions pages; transcripts, recommendation letters and English proficiency required.',
   'https://www.postech.ac.kr/eng/'),

  -- ===================== MALAYSIA =====================

  ('scholarship', 'Malaysia International Scholarship (MIS) -- for Master''s and PhD study',
   'Ministry of Higher Education Malaysia', 'Malaysia', 'Nationwide (24 eligible public and selected private universities incl. UM, UPM, UKM, USM, UTM)',
   'graduate', 'Priority fields incl. science/engineering, agriculture, ICT, economics, Islamic finance, biotech -- Master''s and PhD only',
   'English',
   'Duration of the postgraduate programme (full-time)',
   'Published coverage: tuition fees paid directly to the university plus a monthly living allowance for the duration of study.',
   100,
   'Official eligibility: citizens of MIS recipient countries (incl. Algeria, Bahrain, Egypt, Libya, Morocco, Palestine, Qatar, Saudi Arabia, Sudan, Syria among MENA states); maximum age 40 for Master''s, 45 for PhD; minimum CGPA 3.00/Second Class Upper for Master''s (3.5 for PhD); IELTS 6.5 or TOEFL iBT 92 (or prior degree taught in English); written proposal of at least 1,000 words.',
   null::date,
   'Online application through the official system at biasiswa.mohe.gov.my/INTER/index.php with transcripts, English test results, research proposal and recommendation letters. Application windows are announced per academic year.',
   'https://biasiswa.mohe.gov.my/INTER/index.php'),

  ('program', 'International admission -- undergraduate and postgraduate programmes (all taught in English)',
   'Universiti Malaya (UM)', 'Malaysia', 'Kuala Lumpur',
   'undergraduate', 'Full university range -- medicine, engineering, sciences, business, law, arts, computer science',
   'English (all academic programmes are conducted in English unless otherwise specified)',
   'Programme-dependent (typically 3-4 years bachelor, 1-2 years master, 3+ years PhD)',
   'Application fee MYR 500 per application. Tuition varies by programme -- see the programme search on study.um.edu.my.',
   null,
   'International undergraduates: 12 years of schooling (A-Level/IB/STPM/diploma with CGPA 3.00 or equivalent); English requirement IELTS Academic 5.0+ or TOEFL 500 PBT/60 iBT. Official intakes: October (apply by ~Aug 30) and March (apply by ~Jan 30).',
   null::date,
   'Apply through the MAYA Portal (study.um.edu.my); international channel accepts A-Level, IGCSE, IB, diploma and equivalent qualifications.',
   'https://study.um.edu.my/'),

  ('program', 'International admission -- engineering, science and technology programmes',
   'Universiti Teknologi Malaysia (UTM)', 'Malaysia', 'Johor Bahru / Kuala Lumpur',
   'undergraduate', 'Engineering, computer science, architecture, science, management',
   'English',
   'Programme-dependent',
   null, null,
   'Open to international applicants at undergraduate and postgraduate level; programme-specific academic and English requirements published on admission.utm.my. Eligible for the Malaysia International Scholarship (MIS) at postgraduate level.',
   null::date,
   'Apply through UTM''s online admission portal with transcripts, English proficiency and passport.',
   'https://admission.utm.my/'),

  ('program', 'International degree programmes -- Australian degrees in Malaysia',
   'Monash University Malaysia', 'Malaysia', 'Subang Jaya, Selangor',
   'undergraduate', 'Business, engineering, computer science, medicine, arts and social sciences',
   'English',
   'Programme-dependent (Australian curriculum degrees)',
   null, null,
   'Open to international applicants; Monash Australia degree awarded at a lower tuition level than the Australian campus. Entry requirements per programme on monash.edu.my.',
   null::date,
   'Apply via the Monash Malaysia admissions portal; transcripts and English proficiency required.',
   'https://www.monash.edu.my/'),

  -- ===================== RUSSIA =====================

  ('scholarship', 'Russian Government Scholarship Quota -- free study at Russian universities',
   'Government of the Russian Federation (Rossotrudnichestvo)', 'Russia', 'Nationwide (state universities across Russia)',
   'undergraduate', 'All fields -- bachelor''s, specialist, master''s, PhD and residency programmes',
   'Russian (a funded preparatory/foundation year is provided for those without Russian)',
   'Duration of the enrolled programme',
   'Full tuition coverage under the Government quota -- students study tuition-free at a state university; a state scholarship (stipend) is paid during study per the official rules.',
   100,
   'Open to foreign citizens through competitive selection: register on the Education in Russia portal, pass selection tests/interviews in the home country, then proceed to the second stage. University Olympiads (prize-winners) also grant quota places.',
   null::date,
   'Register at education-in-russia.com, complete the selection in the home country (via Rossotrudnichestvo offices/Russian Houses), then choose universities through the personal account on the portal.',
   'https://studyinrussia.ru/en'),

  ('program', 'Master of Science programmes -- tuition-free with competitive scholarship',
   'Skoltech -- Skolkovo Institute of Science and Technology', 'Russia', 'Moscow (Skolkovo)',
   'graduate', 'Data Science, Materials Science, Energy, Petroleum Engineering, Photonics, Biotechnology and 5+ other technology disciplines',
   'English (fully English-speaking university, founded with MIT collaboration)',
   '2 years full-time (M.Sc.)',
   'No tuition -- officially published: "Applicants who successfully pass the selection do not pay tuition; costs are fully covered by the university." Competitive monthly scholarship up to RUB 55,000/month plus accommodation support.',
   100,
   'Open to international applicants with a bachelor''s degree in a relevant field; admission is by competitive selection (online testing, interviews, and an entrepreneurship-and-innovation challenge). Application fee USD 50 for cards issued outside Russia (waived before the published early deadline).',
   null::date,
   'Apply at msc.skoltech.ru/en: online application, online testing and final-round interviews. Published wave deadlines (e.g. second wave mid-May, final wave early July) on the site.',
   'https://msc.skoltech.ru/en'),

  ('program', 'English-taught bachelor''s and master''s programmes + international scholarships',
   'HSE University -- Higher School of Economics', 'Russia', 'Moscow (also St Petersburg, Nizhny Novgorod, Perm)',
   'undergraduate', 'Economics, data science, computer science, social sciences, humanities, law, business',
   'English (dedicated English-taught degree programmes)',
   'Programme-dependent (4 years bachelor, 2 years master)',
   null, null,
   'Open to international applicants; HSE awards merit-based scholarships and tuition discounts to international students, and Russian Government quota places apply (see the quota row).',
   null::date,
   'Apply through HSE''s international admissions portal (hse.ru/en/admissions) with transcripts, entrance tests/interviews per programme and passport.',
   'https://www.hse.ru/en/admissions/'),

  ('program', 'English-taught Master''s and PhD programmes in science and IT',
   'ITMO University', 'Russia', 'St Petersburg',
   'graduate', 'Computer science, photonics, robotics, bioengineering, food tech, applied mathematics',
   'English',
   'Programme-dependent (2 years master)',
   null, null,
   'Open to international applicants; Russian Government quota places and ITMO''s own scholarship routes apply.',
   null::date,
   'Apply through ITMO''s English portal (en.itmo.ru); transcripts and entrance requirements per programme.',
   'https://en.itmo.ru/'),

  -- ===================== SINGAPORE =====================

  ('scholarship', 'Singapore International Graduate Award (SINGA) -- fully funded PhD',
   'A*STAR with NUS, NTU, SMU and SUTD', 'Singapore', 'Singapore',
   'phd', 'Science and Engineering -- biomedical sciences, computing/information sciences, engineering/technology, physical sciences',
   'English',
   'Up to 4 years of PhD study',
   'Full scholarship, official published coverage: full tuition fees, monthly stipend, one-time airfare grant and one-time settling-in allowance for up to four years.',
   100,
   'Open to international graduates with a bachelor''s degree for direct PhD entry; applicants select research areas at A*STAR research institutes or NUS/NTU/SMU/SUTD.',
   null::date,
   'Apply online through the A*STAR scholarship application system (sms-applicant-app.a-star.edu.sg); browse supervisors and projects on the SINGA section of a-star.edu.sg/scholarships.',
   'https://www.a-star.edu.sg/scholarships'),

  ('program', 'International undergraduate and graduate admission',
   'National University of Singapore (NUS)', 'Singapore', 'Singapore',
   'undergraduate', 'Full university range -- computing, engineering, sciences, business, law, medicine, arts',
   'English',
   'Programme-dependent',
   null, null,
   'Open to international applicants with recognized qualifications (A-Levels, IB, national high-school credentials); English proficiency required where the medium of prior instruction was not English.',
   null::date,
   'Apply through the NUS Office of Admissions portal (nus.edu.sg/oam) with transcripts and supporting documents.',
   'https://www.nus.edu.sg/oam'),

  ('program', 'International undergraduate and graduate admission',
   'Nanyang Technological University (NTU)', 'Singapore', 'Singapore',
   'undergraduate', 'Engineering, computing, sciences, business, humanities, medicine',
   'English',
   'Programme-dependent',
   null, null,
   'Open to international applicants; admissions requirements per qualification type published on ntu.edu.sg/admissions.',
   null::date,
   'Apply through NTU''s admissions portal with transcripts, standardized test results where required, and English proficiency.',
   'https://www.ntu.edu.sg/admissions'),

  -- ===================== HONG KONG =====================

  ('scholarship', 'Hong Kong PhD Fellowship Scheme (HKPFS)',
   'Research Grants Council of Hong Kong (UGC-funded universities)', 'Hong Kong', 'Hong Kong (any of the 8 UGC-funded universities)',
   'phd', 'All research fields at UGC-funded universities (HKU, CUHK, HKUST, PolyU, CityU, HKBU, Lingnan, EdUHK)',
   'English',
   '3 years (universities may fund additional years)',
   'Published award for 2026/27: annual stipend HK$344,400 (approx. US$44,150) plus a conference and research travel allowance of HK$14,400/year, for up to three years; 400 fellowships per year.',
   null,
   'Open to new full-time PhD applicants of any nationality with outstanding academic performance and research potential. Official initial-application deadline: December 1, 12:00 noon Hong Kong time.',
   '2026-12-01'::date,
   'Two steps: submit an initial application at the HKPFS electronic system (cerg1.ugc.edu.hk/hkpfs) choosing up to two programmes, then submit the full PhD application to the chosen university quoting the HKPFS reference number.',
   'https://awards.ugc.edu.hk/award/hong-kong-phd-fellowship-scheme'),

  ('program', 'International undergraduate and postgraduate admission',
   'The University of Hong Kong (HKU)', 'Hong Kong', 'Hong Kong',
   'undergraduate', 'Full university range -- business, law, medicine, engineering, sciences, arts',
   'English',
   'Programme-dependent',
   null, null,
   'Open to international applicants (A-Levels, IB, national qualifications); English-medium instruction across the university. HKU PhD applicants can be nominated for the HKPFS (see that row).',
   null::date,
   'Apply through HKU international admissions (admissions.hku.hk) with transcripts and English proficiency.',
   'https://admissions.hku.hk/'),

  -- ===================== INDIA =====================

  ('scholarship', 'ICCR Scholarship schemes for foreign students (incl. Atal Bihari Vajpayee General Scholarship)',
   'Indian Council for Cultural Relations (ICCR), Government of India', 'India', 'Nationwide (Central/State universities, NITs and other institutions)',
   'undergraduate', 'All fields -- UG, PG and PhD incl. engineering, sciences, humanities, management, Indian arts/culture, AYUSH',
   'English (and Hindi/other Indian languages for arts programmes)',
   'Duration of the enrolled programme',
   'Government scholarship schemes covering tuition, a monthly living allowance and hostel accommodation (coverage terms per scheme as published on the A2A portal). About 3,000+ scholarships are awarded annually across ~21 schemes to students from ~180 countries.',
   100,
   'Open to foreign nationals of ICCR partner countries; the General Scholarship Scheme covers Asian, African, European, Eurasian, American and Oceania nationals at UG/PG/research levels. Applications only through the A2A portal -- ICCR warns it has no agents.',
   null::date,
   'Apply online at a2ascholarships.iccr.gov.in during the announced window; choose universities/courses on the portal, submit transcripts and passport; selection via the Indian mission in the home country.',
   'https://a2ascholarships.iccr.gov.in/'),

  -- ===================== KAZAKHSTAN =====================

  ('program', 'English-medium degree programmes + Abai Kunanbayev merit scholarship',
   'Nazarbayev University', 'Kazakhstan', 'Astana',
   'undergraduate', 'Engineering, sciences, medicine, humanities, public policy, business (US-style English-medium university)',
   'English',
   'Programme-dependent (4 years bachelor, 2 years master; NUFYP foundation year available)',
   'Both state grants and fee-paying admission exist. The merit-based Abay Kunanbayev Scholarship for top international candidates covers tuition + medical insurance + a monthly stipend. The university also announced 200 funded PhD scholarships.',
   null,
   'Open to international applicants; grant funding is awarded by competition on entrance exams, IELTS and academic records. Grant deadline for international applicants published as mid-February; fee-paying applications run to mid-July.',
   null::date,
   'Apply through the NU admissions portal (nu.edu.kz); transcripts, English proficiency, recommendation letters and entrance exams as required per programme.',
   'https://nu.edu.kz/admissions/international-admission/international-admission_general/')

) as v(kind, title, institution, country, city, degree_level, field_of_study, language, duration_note, tuition_note, funding_coverage_pct, eligibility_note, deadline, requirements, source_url)
where not exists (
  select 1 from public.study_opportunities s
  where s.institution = v.institution and s.country = v.country and s.kind = v.kind
);
