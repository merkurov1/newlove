# Media archive duplicate audit

Date: 2026-10-30
Database: production Supabase used by `merkurov.love`
Canonical table: `public.media_archive_records`

## Result

- Records in `media_archive_records`: **223**
- Records returned by the Supabase REST count used by the admin: **223**
- Unique slugs in the live `/media` server payload: **223**
- Duplicate canonical URLs: **0**
- Duplicate normalized URLs (scheme/www/trailing slash/query removed): **0**
- Duplicate URL paths ignoring host: **0**
- Duplicate title + outlet: **0**
- Duplicate title + outlet + publication date: **0**
- Media records with more than one knowledge document: **0**
- Knowledge documents linked to more than one media record: **0**
- Empty or missing titles: **0**

## Same-title pairs

Only two pairs have identical normalized titles, and both are legitimate distinct
records, not duplicates:

1. `Антон Меркуров — авторская страница`
   - Novaya Gazeta: `https://novayagazeta.ru/authors/401536`
   - Republic (Слон.ру): `https://slon.ru/authors/29191/`
2. Le Monde and Le Temps coverage of the same event
   - `https://www.lemonde.fr/...les-frappes-ukrainiennes...`
   - `https://www.letemps.ch/...les-frappes-ukrainiennes...`

Different outlets and different canonical URLs. They must not be merged.

## Why the admin can show 225

The database and the public archive contain 223 records. A count of 225 is not
produced by the current table contents. The usual causes are:

- a stale browser tab or a cached admin response from before the reconciliation;
- a preview deployment connected to a different Supabase project;
- reading a different counter (for example storage files, not publications).

The admin media panel previously displayed `records.length / 200` even after the
API limit was raised to 500, which made the count ambiguous. It now displays the
exact number of records returned by the API.

To re-check:

```sql
SELECT count(*) FROM public.media_archive_records;
-- 223

SELECT canonical_url, count(*)
FROM public.media_archive_records
GROUP BY 1
HAVING count(*) > 1;
-- 0 rows
```

If the admin still shows 225 after a hard refresh, note the exact page and
deployment URL; the browser is then reading a different environment or a stale
cache, not a duplicate row in this database.
