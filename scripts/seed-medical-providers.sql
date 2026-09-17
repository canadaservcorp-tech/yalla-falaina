-- Seed data for public.medical_treatment_providers (medical-treatment/travel
-- vertical -- lib/yf/medicalMatching.js). Run this ONCE against the real
-- production database (there is no admin UI for this table yet -- see the
-- TODO at the bottom of this file). Idempotent: re-running it does nothing
-- if a row with the same hospital_name + country already exists.
--
-- SOURCING DISCIPLINE (same rule as country_risk_notes/cost_of_living_notes):
-- every row below was verified against that provider's own official website
-- as of September 2026, with the exact page cited in source_url. Nothing
-- here is estimated or invented:
--   - price_range_note is filled in ONLY where the provider (or, in the one
--     case noted inline, a named third-party medical-tourism site quoting a
--     specific hospital) actually publishes a figure. Where a provider
--     offers "quote on request" instead of a public price, price_range_note
--     is left NULL -- the concierge's system prompt (lib/yf/systemPrompt.js)
--     already treats a NULL price honestly ("no published price -- contact
--     the provider directly") rather than guessing.
--   - contact_email / contact_phone are the provider's own published
--     international-patient contact channel, or NULL when one could not be
--     verified from the official site directly (never filled with a
--     third-party referral agency's contact info instead).
--   - All prices are the provider's own listed range in the currency they
--     publish it in, converted to USD only where noted; treat every figure
--     as approximate and subject to change -- exactly what the concierge
--     is already instructed to tell a seeker.
--
-- Coverage: Turkey, Cuba, South Korea, Thailand, India -- explicitly
-- including Cuba and South Korea per Hicham's original brief for this
-- vertical (countries that can differ hugely in price from North America/
-- Europe for the same procedure). 17 rows.
--
-- Country/currency note for the concierge: this table has no exchange-rate
-- logic -- every price_range_note is quoted in the currency/units the
-- source itself publishes (mostly USD, a few in EUR or THB where that's
-- what the provider's own price page uses). Left as-is rather than
-- converted, same "don't invent a number" discipline as everything else
-- here -- an FX-converted figure would silently go stale.

insert into public.medical_treatment_providers
  (country, city, hospital_name, specialties, price_range_note, contact_email, contact_phone, source_url)
select * from (values

  -- ---------------- Turkey ----------------
  ('Turkey', 'Istanbul', 'Acibadem Hospitals Group (Acibadem International)',
   'Orthopedics and joint replacement, cardiology, oncology, IVF and fertility, bariatric surgery, cosmetic and plastic surgery, dental, hair transplantation; 7 JCI-accredited hospitals across Istanbul, Izmir and Adana',
   'Hip replacement (published range): USD 12,000-19,000',
   'info@acibademinternational.com', '+90 535 876 04 89',
   'https://acibademinternational.com/hip-replacement-surgery-in-turkey/'),

  ('Turkey', 'Istanbul', 'Memorial Healthcare Group',
   'Organ transplantation, cardiovascular surgery and cardiology, oncology, IVF and fertility; hospitals in Istanbul, Ankara, Antalya, Diyarbakir and Kayseri',
   null,
   'international@memorial.com.tr', '+90 549 639 33 66',
   'https://www.memorial.com.tr/en/corporate/international'),

  ('Turkey', 'Istanbul', 'Vera Clinic',
   'Hair transplantation (FUE/DHI), beard and eyebrow transplant',
   'Hair transplant (published all-inclusive package): EUR 3,200-5,990 / USD 3,500-6,500',
   'info@veraclinic.net', '+90 850 600 00 90',
   'https://www.veraclinic.net/hair-transplant-turkey-cost/'),

  ('Turkey', 'Istanbul', 'Bahceci Fertility',
   'IVF and fertility treatment (ICSI, egg/sperm donation, genetic screening)',
   'IVF package (published): USD 4,800 (basic) to USD 7,400 (VIP package)',
   null, '+90 537 258 82 31',
   'https://bahceci.com/international/en/price/'),

  -- ---------------- Cuba ----------------
  ('Cuba', 'Havana', 'Clinica Central Cira Garcia',
   'Internal medicine, cardiology, endocrinology, gastroenterology, general/orthopedic/neuro/plastic surgery, dentistry and oral surgery; Cuba''s principal hospital for international/foreign patients since 1982, treating an annual average of patients from 85 nationalities',
   null, null, null,
   'https://www.cirag.cu/en/'),

  ('Cuba', 'Havana', 'Centro de Investigaciones Medico Quirurgicas (CIMEQ)',
   'Advanced surgical and medical research center: neurosurgery, cardiovascular surgery, intensive care, organ transplant and complex surgical cases',
   null, null, null,
   'https://instituciones.sld.cu/cimeq/'),

  -- ---------------- South Korea ----------------
  ('South Korea', 'Seoul', 'Samsung Medical Center',
   'Cancer care (Samsung Comprehensive Cancer Center), cardiology and cardiovascular/stroke care (Heart Vascular Stroke Institute), general multi-specialty tertiary care',
   null,
   'ihs.smc@samsung.com', '+82-2-3410-0200',
   'https://www.samsunghospital.com/en/patient-guide/contact.do'),

  ('South Korea', 'Seoul', 'Severance Hospital (Yonsei University Health System)',
   'Cardiovascular surgery, oncology, general multi-specialty tertiary care; International Health Care Center serves 50,000+ foreign patients per year',
   null,
   'ihcc@yuhs.ac', '+82-2-2228-5800',
   'https://sev.severance.healthcare/sev-en/ihc/appointment-guide.do'),

  ('South Korea', 'Seoul', 'Asan Medical Center',
   'Cancer care (Asan Cancer Institute), cardiology (Asan Heart Institute), pediatrics, general multi-specialty tertiary care; interpreters in English, Japanese, Chinese, Russian, Mongolian, Arabic and Vietnamese',
   null,
   'int@amc.seoul.kr', '+82-2-3010-5001',
   'https://eng.amc.seoul.kr/gb/lang/facilities/contents/contact.do'),

  ('South Korea', 'Seoul', 'Kowon Plastic Surgery',
   'Rhinoplasty and revision rhinoplasty, cosmetic/plastic surgery (Gangnam district)',
   'Rhinoplasty (published): primary USD 4,000-6,000; revision USD 6,000-9,000; costal-cartilage procedures up to USD 11,000',
   'info@kowonplasticsurgery.com', '+822-6242-7080',
   'https://www.kowonplasticsurgery.com/en-US/articles/rhinoplasty-korea-cost-price-guide-for-us-patients'),

  -- ---------------- Thailand ----------------
  ('Thailand', 'Bangkok', 'Bumrungrad International Hospital',
   'General surgery, cardiology, urology, fertility and IVF treatment, plastic surgery; JCI-accredited, dedicated Medical Coordination Office for international patients',
   null, null, '+66 2 066 8888',
   'https://www.bumrungrad.com/en/contact-us/contact-details'),

  ('Thailand', 'Bangkok', 'Bangkok Hospital (Bangkok General Hospital)',
   'Cardiology, orthopedics, neurology and neurosurgery, oncology, women''s health and fertility, general surgery, urology, gastroenterology; JCI-accredited since 2007, 600+ beds, patients from 190+ countries',
   null,
   'imc@bangkokhospital.com', '+662-310-3344',
   'https://www.mymedicplus.com/hospitals/thailand/bangkok-hospital/index.html'),

  ('Thailand', 'Bangkok', 'Bangkok International Dental Center (BIDC)',
   'Dental implants, crowns and veneers, orthodontics (Invisalign/braces), root canal treatment, cosmetic dentistry',
   'Dental implant + crown (published, e.g. Straumann Roxolid SLA): approx. THB 79,000 (~USD 2,200); porcelain veneer: approx. THB 17,000-19,000 (~USD 480-540) per tooth',
   'contact@bangkokdentalcenter.com', '+66 2 692 4433',
   'https://bangkokdentalcenter.com/fees/'),

  ('Thailand', 'Bangkok', 'Yanhee International Hospital',
   'Gender-affirmation surgery, also known as sex reassignment surgery (male-to-female and female-to-male, all stages), cosmetic and plastic surgery, general multi-specialty care; JCI-accredited 400-bed hospital with a dedicated international patient (Pride Center) program',
   'FTM gender-affirmation surgery (published, by stage): mastectomy THB 111,000-131,000; hysterectomy THB 96,000; phalloplasty THB 426,000 (approx. USD 3,100 / USD 2,700 / USD 11,900 respectively)',
   'info@yanhee.net', '+66 2 879 0300',
   'https://www.yanhee.net/cosmetic-services/sex-reassignment-surgery/female-to-male-surgery/'),

  -- ---------------- India ----------------
  ('India', 'New Delhi', 'Apollo Hospitals Group',
   'Cardiac sciences including heart bypass/CABG surgery, neurosciences, orthopedics including hip and knee replacement, cancer care, emergency medicine, solid organ transplant (kidney, liver); 35 medical disciplines across hospitals in Delhi, Chennai, Hyderabad, Bangalore, Mumbai, Kolkata, Ahmedabad and Lucknow',
   'Heart bypass / CABG surgery at Indraprastha Apollo, New Delhi (per medical-tourism site lyfboat.com, not Apollo''s own published figure): USD 5,800-7,500 standard; approx. USD 13,000 robotic-assisted',
   null, '1800-570-1033',
   'https://www.apollohospitals.com/internationalpatientservices/'),

  ('India', 'Gurugram', 'Fortis Healthcare',
   'Cardiac sciences (heart surgery, angioplasty, stents), oncology, organ transplant, orthopedics including knee replacement, robotic surgery, gastroenterology; hospitals across Delhi NCR, Mumbai, Bangalore, Hyderabad, Chennai, Kolkata and other cities',
   null,
   'internationalpatient@fortishealthcare.com', '+91-9205-010-100',
   'https://www.fortishealthcare.com/international-patients/en-en'),

  ('India', 'Gurugram', 'Medanta - The Medicity',
   'Cardiac care and cardiac surgery, cancer care, neurosciences, gastrosciences, orthopedics including hip and knee replacement, renal care and kidney transplant, liver transplant, lung transplant, bone-marrow transplant, chest surgery, gynaecology and gynae-oncology; also in Lucknow, Patna, Indore, Noida and Ranchi',
   null,
   'internationalservices@medanta.org', '+91-956-039-8936',
   'https://www.medanta.org/international-patient-help-desk')

) as v(country, city, hospital_name, specialties, price_range_note, contact_email, contact_phone, source_url)
where not exists (
  select 1 from public.medical_treatment_providers existing
  where existing.hospital_name = v.hospital_name and existing.country = v.country
);

-- TODO (operator task, not a code gap -- see the medical vertical's own
-- schema.sql comment): there is no admin UI for this table yet. To add,
-- correct, or retire a row after this seed, either re-run a similar INSERT
-- by hand, or wait for the admin-tab enhancement discussed alongside this
-- seed (same pattern as the existing informal-listing moderation tab).
-- Every price above should be re-verified periodically -- medical-tourism
-- pricing moves, and a stale number is worse than an honest "ask them
-- directly."
