-- Seed data for public.medical_treatment_providers — second pass, widening
-- the vertical east across Asia per Hicham's request ("health centers and
-- hospitals in Asia, China, Russia, Korea and Turkey should appear for all
-- health-travel seekers, with numbers, websites and mails, to help them
-- figure out the cost of the trip"). Run ONCE against the production
-- database. Idempotent: re-running does nothing where a row with the same
-- hospital_name + country already exists.
--
-- SOURCING DISCIPLINE — identical to seed-medical-providers.sql, plus two
-- explicit honesty decisions for this pass:
--   - "Reviews": a provider's patient reviews are third-party content we
--     cannot verify or reproduce honestly, so this table carries none.
--     What IS verifiable — JCI accreditation, MHTC (Malaysia Healthcare
--     Travel Council) membership, dedicated international-patient offices,
--     and published outcome claims *on the provider's own site* — is noted
--     inside `specialties` where it exists, always attributed to the
--     provider's own page. The concierge relays these as facts about the
--     provider, not as endorsements.
--   - "Cost of the trip": price_range_note is filled ONLY where the
--     provider itself publishes a figure (see the existing seed's same
--     rule). Almost none of the Asian/Russian providers below publish
--     package pricing publicly — they quote per-case — so those rows keep
--     a NULL price and the concierge's published "no published price —
--     contact them directly / I can draft the inquiry email" path applies
--     (lib/yf/systemPrompt.js + the v15 inquiry-email offer). No invented
--     numbers, ever.
--   - contact_email/contact_phone: the provider's own published
--     international-patient channel only — never a third-party referral
--     agency's. Verified against the cited official page, September 2026.
--
-- New coverage: China (Beijing, Shanghai), Russia (Moscow, St. Petersburg),
-- South Korea (SNUH — the flagship's international centre, incl. a
-- dedicated Arabic line), Malaysia (Kuala Lumpur, Penang — the country's
-- two main medical-travel hubs), Jordan (Amman — the Arab world's referral
-- cancer centre), Japan (Tokyo). Turkey/Korea/Thailand/India/Cuba were
-- already seeded in seed-medical-providers.sql. 11 rows.

insert into public.medical_treatment_providers
  (country, city, hospital_name, specialties, price_range_note, contact_email, contact_phone, source_url)
select * from (values

  -- ================= CHINA =================

  ('China', 'Beijing', 'Beijing United Family Hospital (UFH)',
   'JCI-accredited international hospital serving expatriates and foreign patients since 1997; family medicine, general surgery, orthopedics and sports medicine, obstetrics and maternity, pediatrics, oncology, cardiology, dental, dermatology, health screening; 24-hour emergency room; English-speaking staff; direct billing with international insurers',
   null, -- quote per case; no public package pricing
   'patientservices@ufh.com.cn', '+86-10-5927-7000',
   'https://beijing.ufh.com.cn/contactus?lang=en'),

  ('China', 'Shanghai', 'Shanghai United Family Hospital (SHU)',
   'JCI-accredited international hospital (Changning flagship + Pudong and Jing''an campuses); family medicine, obstetrics and gynecology, pediatrics, internal medicine, surgery, dental, rehabilitation; multilingual staff; direct billing with international insurers',
   null,
   'shuptservice@ufh.com.cn', '+86-21-2216-3900',
   'https://shanghai.ufh.com.cn/patient-visitor-info/contact-form?lang=en'),

  ('China', 'Beijing', 'Peking Union Medical College Hospital (PUMCH) — International Medical Services',
   'China''s top-ranked academic tertiary hospital (National Designated Center for difficult and critical diseases); International Medical Services dept has served foreign patients and embassies since 1951 — English/Japanese/Korean services, medical interpreters, international-insurance direct billing; endocrinology, rheumatology, oncology, orthopedics, general surgery, complex multi-disciplinary cases',
   null,
   null, -- IMS books by phone/official app; no published intl email on the official page
   '+86-10-69156699', -- press 2 for English service; 24/7 emergency +86-10-69155288
   'https://www.pumch.cn/en/detail/43295.html'),

  -- ================= RUSSIA =================

  ('Russia', 'Moscow', 'European Medical Center (EMC)',
   'Russia''s largest private medical group for international patients — JCI-accredited (2018, 2021); 600+ doctors, 57 treatment directions, staff speaking 12 languages; Institute of Oncology, surgery clinic, cardiology, neurosurgery, orthopedics and sports traumatology, IVF/reproductive medicine, maternity, ophthalmology; medical-tourism desk runs a dedicated page and concierge',
   null,
   null, -- medtravel page routes enquiries through a form/WhatsApp; no published intl email
   '+7-495-933-66-55',
   'https://www.emcmos.ru/medtravel/'),

  ('Russia', 'Moscow', 'MEDSI Group',
   'Largest private clinic network in Moscow; 25+ years serving foreign patients with English/German/Spanish/Arabic-speaking support staff; full multi-specialty network — clinical and diagnostic centers, surgery, oncology, cardiology, orthopedics, pediatrics, check-up programs; free preliminary consultation / second opinion offered on the medical-tourism page',
   null,
   'partner@medsigroup.ru', '+7-495-780-05-00',
   'https://medsi.com/medical-tourism/'),

  ('Russia', 'St. Petersburg', 'Scandinavia AVA-PETER Fertility Clinic',
   'One of Russia''s oldest private fertility clinics, treating foreign patients since 1996; IVF, egg/sperm donation (large in-house donor database), preimplantation genetic testing, fertility preservation; the clinic publishes an accumulated pregnancy rate near 90% over three attempts on its own site; doctors trained in leading European fertility centres',
   null,
   null, -- appointment by phone/form on the official English page
   '+7-812-600-78-11',
   'https://www.avaclinic.ru/en/'),

  -- ================= SOUTH KOREA =================

  ('South Korea', 'Seoul', 'Seoul National University Hospital — International Healthcare Center',
   'Korea''s flagship national university hospital; International Healthcare Center (est. 1999) coordinates appointments, payments and interpretation for foreign patients in English, Chinese, Mongolian, Russian and a dedicated ARABIC line (arab@snuh.org, +82-2-2072-1817); comprehensive tertiary care — oncology, cardiovascular, organ transplant, neurosurgery, pediatrics, rare/complex diseases',
   null,
   'international@snuh.org', '+82-2-2072-0505',
   'https://snuh.org/global/en/patients/EN02004.do'),

  -- ================= MALAYSIA =================

  ('Malaysia', 'Kuala Lumpur', 'Prince Court Medical Centre',
   'Private tertiary hospital in central KL (IHH Healthcare group) built around international patients — International Premiere Lounge, visa support via Malaysia Healthcare Travel Council for long-term treatment, direct billing with Cigna/Aetna/Bupa/GeoBlue; oncology, cardiology, orthopedics, gastroenterology, IVF/fertility, burn treatment, ENT, women & children',
   null,
   'international.mktg@princecourt.com', '+60-12-290-3814',
   'https://princecourt.com/internationalpatients'),

  ('Malaysia', 'Penang', 'Gleneagles Hospital Penang',
   'Penang''s flagship medical-travel hospital and MHTC member — dedicated International Patients'' Centre coordinating pre-arrival planning, airport pickup (MHTC counter, Gate 6), translators and post-treatment follow-up; cardiology, orthopedics, oncology, gastroenterology, neurology, dental, health screening',
   null,
   'my.gpg.ipc@gleneagles.com.my', '+60-4-222-9099',
   'https://gleneagles.com.my/penang/facilities-services/international-patients-centre'),

  -- ================= JORDAN =================

  ('Jordan', 'Amman', 'King Hussein Cancer Center (KHCC)',
   'The Arab world''s referral cancer center — a dedicated International Patients'' Office handles consultations, visas, travel and accommodation logistics for Arab and international patients end-to-end; comprehensive adult and pediatric oncology, bone-marrow transplant, hematology, radiation therapy; reports can be sent ahead to international@khcc.jo for case review',
   null,
   'international@khcc.jo', '+962-6-5300460 ext. 5043',
   'https://www.khcc.jo/en/contact-us-int'),

  -- ================= JAPAN =================

  ('Japan', 'Tokyo', 'St. Luke''s International Hospital',
   'One of Japan''s most internationally-oriented hospitals (International Department with English support); cardiovascular center, oncology, neurosurgery, orthopedics, gastroenterology, obstetrics, comprehensive health checkups. Note for seekers: St. Luke''s runs a strict appointment + referral-letter system — book through the Appointment Service Desk before travel',
   null,
   '5931@luke.ac.jp', '+81-3-5550-7120',
   'https://hospital.luke.ac.jp/eng/for-patients/')

) as v(country, city, hospital_name, specialties, price_range_note, contact_email, contact_phone, source_url)
where not exists (
  select 1 from public.medical_treatment_providers existing
  where existing.hospital_name = v.hospital_name and existing.country = v.country
);

-- TODO (same as the first seed): no admin UI for this table yet — correct or
-- retire rows by hand until routes/admin-medical-providers.js exists. And
-- re-verify contacts periodically: international-patient desks rotate
-- emails and phone trees more often than hospitals change names.
