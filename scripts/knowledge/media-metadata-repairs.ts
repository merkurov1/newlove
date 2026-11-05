#!/usr/bin/env tsx
/**
 * Verified Media Archive link/metadata repairs.
 *
 * Only corrections backed by the live original page or a verified replacement
 * URL are listed here. Run with --apply; repeated runs are no-ops.
 *
 *   npx tsx scripts/knowledge/media-metadata-repairs.ts --report
 *   npx tsx scripts/knowledge/media-metadata-repairs.ts --apply
 */
import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env.production.local' });
dotenv.config();

type Repair = {
  id: string;
  reason: string;
  patch: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

const REPAIRS: Repair[] = [
  {
    id: '4ffb73d0-faec-4d04-9ff1-5f756d052426',
    reason:
      'Original abcnews.go.com story is gone (404). Verified replacement on ABC News Australia, with the real publication date 2017-07-24 and byline Tom Lowe.',
    patch: {
      title: 'Thousands march through Moscow for internet freedom as Russia cracks down ahead of election',
      outlet: 'ABC News (Australia)',
      published_date: '2017-07-24',
      canonical_url:
        'https://www.abc.net.au/news/2017-07-24/thousands-march-through-moscow-to-call-for-internet-freedom/8736736',
      url: 'https://www.abc.net.au/news/2017-07-24/thousands-march-through-moscow-to-call-for-internet-freedom/8736736',
      author: 'Tom Lowe',
      lang: 'EN',
      kind: 'quote',
      topic: 'Internet & Censorship',
      summary:
        'More than 2,000 people marched through Moscow for internet freedom as the Kremlin pushed new censorship laws ahead of the 2018 election. Anton Merkurov is quoted on the enforcement gap.',
    },
    metadata: {
      slug: '2017-07-24-abc-news-australia-thousands-march-through-moscow',
      slug_aliases: ['2017-03-26-abc-news-thousands-march-through-moscow-for'],
    },
  },
  {
    id: '1e5da14c-629c-4ae2-af10-e4c19e678b6f',
    reason:
      'Original URL omitted the trailing "-itself" ("hack-self" -> "hack-itself"). Verified live Washington Post opinion page; byline Alexey Kovalev.',
    patch: {
      canonical_url:
        'https://www.washingtonpost.com/news/democracy-post/wp/2018/04/19/the-russian-government-just-managed-to-hack-itself/',
      url: 'https://www.washingtonpost.com/news/democracy-post/wp/2018/04/19/the-russian-government-just-managed-to-hack-itself/',
      author: 'Alexey Kovalev',
      outlet: 'The Washington Post',
      published_date: '2018-04-19',
      kind: 'quote',
      topic: 'Internet & Censorship',
    },
  },
  {
    id: 'dafb751e-c089-4fa5-b99f-83519347b0f7',
    reason:
      'Echo of Moscow moved to echofm.online. Verified archive page for the 2017-04-16 Tochka programme.',
    patch: {
      canonical_url: 'https://echofm.online/archive/tochka/24228',
      url: 'https://echofm.online/archive/tochka/24228',
      author: 'Антон Меркуров, Юрий Синодов, Игорь Королёв',
      outlet: 'Эхо Москвы',
      published_date: '2017-04-16',
      kind: 'radio',
      summary:
        'Эфир программы «Точка» об очередной волне блокировок. Участники: Антон Меркуров, Юрий Синодов (Roem.ru), Игорь Королёв (CNews).',
    },
  },
];

const DEAD_LINKS: Array<{ id: string; reason: string }> = [
  {
    id: '79cee792-f7d1-4834-ac48-aa0cc5cacf23',
    reason:
      'slon.ru author page no longer resolves (expired certificate); republic.ru does not resolve from this environment. Kept as a historical profile record.',
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) throw new Error('DATABASE_URL_missing');
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    for (const repair of REPAIRS) {
      const keys = Object.keys(repair.patch);
      const values = keys.map((key) => repair.patch[key]);
      console.log(`[repair] ${repair.id}: ${repair.reason}`);
      if (process.argv.includes('--apply')) {
        await client.query(
          `update media_archive_records
              set ${keys.map((key, index) => `${key}=$${index + 1}`).join(', ')},
                  ai_metadata=coalesce(ai_metadata,'{}'::jsonb) || $${keys.length + 1}::jsonb,
                  updated_at=now()
            where id=$${keys.length + 2}`,
          [
            ...values,
            JSON.stringify({
              link_repair: repair.reason,
              link_verified_at: new Date().toISOString(),
              ...(repair.metadata || {}),
            }),
            repair.id,
          ]
        );
      }
    }

    for (const dead of DEAD_LINKS) {
      console.log(`[dead-link] ${dead.id}: ${dead.reason}`);
      if (process.argv.includes('--apply')) {
        await client.query(
          `update media_archive_records
              set ai_metadata=coalesce(ai_metadata,'{}'::jsonb) || $1::jsonb,
                  updated_at=now()
            where id=$2`,
          [
            JSON.stringify({
              link_status: 'dead',
              link_note: dead.reason,
              link_checked_at: new Date().toISOString(),
            }),
            dead.id,
          ]
        );
      }
    }

    console.log(`[repairs] ${REPAIRS.length} metadata, ${DEAD_LINKS.length} dead-link notes`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[media-repairs] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
