#!/usr/bin/env tsx
/**
 * Editorial cleanup for the Media Archive.
 *
 * Non-destructive and idempotent. It only corrects the outlet of the Novaya
 * Gazeta comment and records the Le Monde -> Le Temps reprint relation in the
 * existing `media_record_relations` table.
 *
 *   npx tsx scripts/knowledge/media-editorial-cleanup.ts --report
 *   npx tsx scripts/knowledge/media-editorial-cleanup.ts --apply
 */
import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env.production.local' });
dotenv.config();

const NOVAYA_URL = 'https://novayagazeta.ru/articles/2026/06/11/sami-sebia-razblokiruite';
const LE_MONDE_URL =
  'https://www.lemonde.fr/international/article/2026/10/13/les-frappes-ukrainiennes-sur-des-data-centers-perturbent-les-services-en-ligne-en-russie_6793136_3210.html';
const LE_TEMPS_TITLE =
  'Les frappes ukrainiennes sur des data centers perturbent les services en ligne en Russie';

type MediaRow = {
  id: string;
  title: string;
  outlet: string;
  url: string;
  published_date: string | null;
  ai_metadata: Record<string, unknown> | null;
};

async function findOne(client: Client, query: string, values: unknown[]): Promise<MediaRow | null> {
  const result = await client.query<MediaRow>(query, values);
  return result.rows[0] || null;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!connectionString) throw new Error('DATABASE_URL_missing');

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    const novaya = await findOne(
      client,
      `select id, title, outlet, url, published_date, ai_metadata
         from public.media_archive_records
        where url = $1 or canonical_url = $1
        limit 1`,
      [NOVAYA_URL]
    );

    if (!novaya) throw new Error('novaya_record_not_found');

    console.log(
      `[novaya] ${novaya.title}: outlet ${JSON.stringify(novaya.outlet)} -> "Новая газета"; kind and metadata stay unchanged`
    );

    if (apply && novaya.outlet !== 'Новая газета') {
      await client.query(
        `update public.media_archive_records
            set outlet = 'Новая газета',
                ai_metadata = coalesce(ai_metadata, '{}'::jsonb) || $1::jsonb,
                updated_at = now()
          where id = $2`,
        [
          JSON.stringify({
            editorial_cleanup: {
              reason:
                'Move the comment to its verified Novaya Gazeta column while preserving the commentary kind.',
              previous_outlet: novaya.outlet,
              outlet: 'Новая газета',
              applied_at: new Date().toISOString(),
            },
          }),
          novaya.id,
        ]
      );
    }

    const leMonde = await findOne(
      client,
      `select id, title, outlet, url, published_date, ai_metadata
         from public.media_archive_records
        where url = $1 or canonical_url = $1
        limit 1`,
      [LE_MONDE_URL]
    );

    const leTemps = await findOne(
      client,
      `select id, title, outlet, url, published_date, ai_metadata
         from public.media_archive_records
        where title = $1 and outlet = 'Le Temps'
        order by published_date desc
        limit 1`,
      [LE_TEMPS_TITLE]
    );

    if (!leMonde) throw new Error('le_monde_record_not_found');
    if (!leTemps) throw new Error('le_temps_record_not_found');

    console.log(
      `[reprint] ${leMonde.title}: Le Monde ${leMonde.id} (${leMonde.published_date}) -> Le Temps ${leTemps.id} (${leTemps.published_date})`
    );

    if (apply) {
      const evidence = {
        title: leMonde.title,
        original_source: 'Le Monde',
        original_url: leMonde.url,
        original_published_date: leMonde.published_date,
        reprint: 'Le Temps',
        reprint_url: leTemps.url,
        reprint_published_date: leTemps.published_date,
        editorial_note:
          'Same publication; Le Monde is the original source, Le Temps is the reprint. Both records remain published.',
      };

      await client.query('begin');

      try {
        const existing = await client.query<{ id: string }>(
          `select id
             from public.media_record_relations
            where source_media_record_id = $1
              and target_media_record_id = $2
              and relation_type = 'reprint'
              and is_current = true
            limit 1`,
          [leMonde.id, leTemps.id]
        );

        if (existing.rows[0]) {
          await client.query(
            `update public.media_record_relations
                set confidence = 1,
                    detected_by = 'manual_editorial_cleanup',
                    evidence = $1::jsonb,
                    review_status = 'confirmed',
                    reviewed_by = 'media_editorial_cleanup',
                    reviewed_at = now(),
                    is_current = true,
                    superseded_at = null,
                    updated_at = now()
              where id = $2`,
            [JSON.stringify(evidence), existing.rows[0].id]
          );
        } else {
          await client.query(
            `insert into public.media_record_relations (
               source_media_record_id,
               target_media_record_id,
               relation_type,
               confidence,
               detected_by,
               evidence,
               is_current,
               review_status,
               reviewed_by,
               reviewed_at
             ) values ($1, $2, 'reprint', 1, 'manual_editorial_cleanup', $3::jsonb, true, 'confirmed', 'media_editorial_cleanup', now())`,
            [leMonde.id, leTemps.id, JSON.stringify(evidence)]
          );
        }

        await client.query(
          `update public.media_archive_records
              set ai_metadata = coalesce(ai_metadata, '{}'::jsonb) || $1::jsonb,
                  updated_at = now()
            where id = $2`,
          [
            JSON.stringify({
              original_source: {
                outlet: 'Le Monde',
                media_record_id: leMonde.id,
                url: leMonde.url,
                published_date: leMonde.published_date,
              },
              relation_type: 'reprint',
            }),
            leTemps.id,
          ]
        );

        await client.query(
          `update public.media_archive_records
              set ai_metadata = coalesce(ai_metadata, '{}'::jsonb) || $1::jsonb,
                  updated_at = now()
            where id = $2`,
          [
            JSON.stringify({
              canonical_original_for: [
                {
                  outlet: 'Le Temps',
                  media_record_id: leTemps.id,
                  url: leTemps.url,
                  published_date: leTemps.published_date,
                },
              ],
            }),
            leMonde.id,
          ]
        );

        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }

    console.log(
      apply
        ? '[media-editorial-cleanup] applied'
        : '[media-editorial-cleanup] report only; pass --apply to write'
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(
    '[media-editorial-cleanup] failed:',
    error instanceof Error ? error.message : error
  );
  process.exitCode = 1;
});
