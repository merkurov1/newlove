-- Media Archive early-period verification (2000–2026)
-- Date: 2026-11-22
--
-- Read-only checks. This file is NOT a migration and must not be applied
-- automatically. Run each block against the target Supabase project through
-- the owner's SQL console or a read-only role.
--
-- Baseline declared by the owner before this pass:
--   328 records / 86 outlets
--   2005 — 1; 2006–2008 — 0; 2009 — 2; 2010–2014 — 21;
--   2015–2023 — 96; 2024–2026 — 208.

-- 1. Pre-import baseline -----------------------------------------------------
SELECT
  count(*) AS total_records,
  count(*) FILTER (WHERE status = 'published') AS published,
  count(*) FILTER (WHERE status = 'draft') AS drafts,
  count(DISTINCT outlet) AS outlets,
  count(DISTINCT lang) AS languages,
  min(published_date) AS first_date,
  max(published_date) AS last_date
FROM public.media_archive_records;

-- 2. Year coverage, including years with zero rows --------------------------
WITH years AS (
  SELECT generate_series(2000, 2026) AS year
), counts AS (
  SELECT date_part('year', published_date)::int AS year, count(*) AS records
  FROM public.media_archive_records
  WHERE published_date IS NOT NULL
  GROUP BY 1
)
SELECT y.year, coalesce(c.records, 0) AS records
FROM years y
LEFT JOIN counts c USING (year)
ORDER BY y.year;

-- 3. Duplicate identity checks ----------------------------------------------
-- 3a. Canonical URL duplicates (must return zero rows).
SELECT canonical_url, count(*) AS records
FROM public.media_archive_records
WHERE canonical_url IS NOT NULL
GROUP BY canonical_url
HAVING count(*) > 1;

-- 3b. Raw URL duplicates (must return zero rows).
SELECT url, count(*) AS records
FROM public.media_archive_records
GROUP BY url
HAVING count(*) > 1;

-- 3c. Title + outlet + publication date duplicates (must be reviewed).
SELECT lower(title) AS title, outlet, published_date, count(*) AS records
FROM public.media_archive_records
GROUP BY 1, 2, 3
HAVING count(*) > 1;

-- 4. Candidate reconciliation ------------------------------------------------
-- Every confirmed candidate must resolve to exactly one existing row after
-- import. Before import the "present" flag is false for new URLs.
WITH candidates(url, expected_date, expected_outlet) AS (
VALUES
  ('https://merkurov.com/2006/04/21/%D0%B3%D0%B8%D0%BF%D0%B5%D1%80-%D1%81%D0%BE%D1%86%D0%B8%D0%B0%D0%BB%D1%8C%D0%BD%D0%BE%D0%B5/', DATE '2006-04-21', 'merkurov.com'),
  ('https://merkurov.com/2006/06/21/google-sucks/', DATE '2006-06-21', 'merkurov.com'),
  ('https://merkurov.com/2007/08/15/ip-%D1%82%D0%B5%D0%BB%D0%B5%D1%84%D0%BE%D0%BD%D0%B8%D1%8F-%D0%B4%D0%BE%D1%81%D1%82%D0%B0%D0%BD%D1%8C-%D1%8E%D0%B7%D0%B5%D1%80%D0%B0/', DATE '2007-08-15', 'merkurov.com'),
  ('https://merkurov.com/2007/12/14/%D1%81%D0%BE%D1%86%D0%B8%D0%B0%D0%BB%D1%8C%D0%BD%D0%B0%D1%8F-%D1%84%D1%83%D1%82%D0%BE%D1%80%D0%BE%D0%BB%D0%BE%D0%B3%D0%B8%D1%8F/', DATE '2007-12-14', 'merkurov.com'),
  ('https://echofm.online/archive/tochka/23820', DATE '2008-08-31', 'Эхо Москвы'),
  ('https://roem.ru/18-03-2009/128488/kadry-anton-merkurov-pokidaet-rbk/', DATE '2009-03-18', 'Roem.ru'),
  ('https://www.chaskor.ru/article/vse_ostalnoe_-_zhalkaya_parodiya_8013', DATE '2009-07-01', 'Chaskor'),
  ('https://www.chaskor.ru/article/telefon_protiv_progressa_8828', DATE '2009-07-29', 'Chaskor'),
  ('https://www.chaskor.ru/article/bitva_gigantov_9003', DATE '2009-08-05', 'Chaskor'),
  ('https://www.chaskor.ru/article/yaska_9121', DATE '2009-08-07', 'Chaskor'),
  ('https://www.chaskor.ru/article/saas_vmesto_sisadmina_9468', DATE '2009-08-19', 'Chaskor'),
  ('https://www.chaskor.ru/article/otpishis_i_ne_chitaj_9652', DATE '2009-08-24', 'Chaskor'),
  ('https://www.chaskor.ru/article/kataklizm_warcraft_9945', DATE '2009-09-03', 'Chaskor'),
  ('https://www.chaskor.ru/article/ya_vas_kupil_-_chego_zhe_bole_9918', DATE '2009-09-03', 'Chaskor'),
  ('https://www.chaskor.ru/article/bolivar_ne_vyderzhit_dvoih_10096', DATE '2009-09-09', 'Chaskor'),
  ('https://www.chaskor.ru/article/v_ozhidanii_doktora_10213', DATE '2009-09-14', 'Chaskor'),
  ('https://www.chaskor.ru/article/zachem_kachat_prosto_slushaj_10232', DATE '2009-09-15', 'Chaskor'),
  ('https://www.chaskor.ru/article/dohlye_linii_10435', DATE '2009-09-19', 'Chaskor'),
  ('https://www.chaskor.ru/article/london_chichvarkin_sud_10585', DATE '2009-09-23', 'Chaskor'),
  ('https://www.chaskor.ru/article/starye_tryuki_new_media_10682', DATE '2009-09-27', 'Chaskor'),
  ('https://www.chaskor.ru/article/dvd_na_pomojku_11956', DATE '2009-11-03', 'Chaskor'),
  ('https://www.chaskor.ru/article/yandeks_zakryvaet_rejting_populyarnyh_zapisej_blogov_zakrytie_rejtinga_yandeks_blogov_12021', DATE '2009-11-05', 'Chaskor'),
  ('https://www.chaskor.ru/article/isporchennaya_karma_12234', DATE '2009-11-10', 'Chaskor'),
  ('https://www.chaskor.ru/article/google5_12304', DATE '2009-11-11', 'Chaskor'),
  ('https://www.chaskor.ru/article/svoya_zona_12580', DATE '2009-11-19', 'Chaskor'),
  ('https://www.chaskor.ru/article/samye_tsennye_polzovateli_15197', DATE '2010-02-24', 'Chaskor'),
  ('https://www.chaskor.ru/article/etot_google-zhzh_nesprosta_15017', DATE '2010-03-02', 'Chaskor'),
  ('https://www.chaskor.ru/article/tvigle_on-line_televidenie_15843', DATE '2010-03-18', 'Chaskor'),
  ('https://roem.ru/05-07-2010/121296/zasurskiy-merkurov-i-moskalev-prokonsultiruyut-sup/', DATE '2010-07-05', 'Roem.ru'),
  ('https://roem.ru/04-04-2012/141385/merkurov-utverjdaet-chto-google-smojet-sdelat-knopku-1-komu-to-nujnoy-slonru/', DATE '2012-04-04', 'Roem.ru'),
  ('https://tjournal.ru/46771', DATE '2012-04-16', 'TJournal'),
  ('https://roem.ru/09-11-2012/133566/elita-runeta-uhodit-iz-facebook/', DATE '2012-11-09', 'Roem.ru'),
  ('https://roem.ru/09-10-2013/138453/dedushka-merkurova-byl-tot-eshche-zateynik/', DATE '2013-10-09', 'Roem.ru'),
  ('https://te-st.org/reports/firechat-webinar-materials/', DATE '2015-10-26', 'Теплица социальных технологий')
)
SELECT
  c.url,
  c.expected_date,
  c.expected_outlet,
  m.id,
  m.canonical_url,
  m.published_date,
  m.outlet,
  (m.id IS NOT NULL) AS present
FROM candidates c
LEFT JOIN public.media_archive_records m
  ON m.canonical_url = c.url OR m.url = c.url
ORDER BY c.expected_date, c.url;

-- 5. Post-import totals and distribution ------------------------------------
SELECT
  count(*) AS total_records,
  count(*) FILTER (WHERE status = 'published') AS published,
  count(DISTINCT outlet) AS outlets,
  count(DISTINCT lang) AS languages
FROM public.media_archive_records;

SELECT lang, kind, count(*) AS records
FROM public.media_archive_records
GROUP BY lang, kind
ORDER BY lang, records DESC;

SELECT outlet, count(*) AS records
FROM public.media_archive_records
GROUP BY outlet
ORDER BY records DESC, outlet;

-- 6. Invalid / missing publication metadata ---------------------------------
SELECT id, url, canonical_url, title, outlet, published_date
FROM public.media_archive_records
WHERE published_date IS NULL
   OR canonical_url IS NULL
   OR canonical_url !~ '^https?://'
ORDER BY id;

-- 7. HYIP / e-gold negative check -------------------------------------------
-- The early-period research did not confirm such a publication. This query
-- should not reveal a newly imported record without a verified source.
SELECT id, title, outlet, published_date, canonical_url
FROM public.media_archive_records
WHERE title ILIKE '%HYIP%'
   OR title ILIKE '%e-gold%'
   OR title ILIKE '%electronic money%'
   OR title ILIKE '%электронные деньги%'
   OR title ILIKE '%хайп%';

-- 8. Brain ingestion coverage and duplicate jobs -----------------------------
-- 8a. New media records without a linked document (expected before enqueue).
SELECT m.id, m.title, m.outlet, m.published_date
FROM public.media_archive_records m
LEFT JOIN public.knowledge_documents d ON d.media_record_id = m.id
WHERE d.id IS NULL
ORDER BY m.published_date DESC;

-- 8b. More than one active job per media record (must return zero rows).
SELECT media_record_id, count(*) AS active_jobs
FROM public.brain_ingestion_jobs
WHERE media_record_id IS NOT NULL
  AND status IN ('queued', 'processing')
GROUP BY media_record_id
HAVING count(*) > 1;

-- 8c. More than one non-failed job per document (review queue duplicates).
SELECT document_id, count(*) AS jobs
FROM public.brain_ingestion_jobs
WHERE document_id IS NOT NULL
  AND status NOT IN ('failed', 'cancelled')
GROUP BY document_id
HAVING count(*) > 1;

-- 8d. Media records with more than one linked knowledge document.
SELECT media_record_id, count(*) AS documents
FROM public.knowledge_documents
WHERE media_record_id IS NOT NULL
GROUP BY media_record_id
HAVING count(*) > 1;
