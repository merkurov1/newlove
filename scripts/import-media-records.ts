import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { records } from '../data/media';

dotenv.config({ path: '.env.local' });
dotenv.config();

function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  return url.toString();
}

function normalizeDate(value: string): string {
  // В БД поле date хранится как полноценная дата.
  if (/^\d{4}$/.test(value)) return `${value}-01-01`;
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  throw new Error(`Некорректная дата: ${value}`);
}

async function main() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Не найдены NEXT_PUBLIC_SUPABASE_URL (или SUPABASE_URL) ' +
      'и SUPABASE_SERVICE_ROLE_KEY. Проверьте .env.local.',
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Читаем существующие URL постранично, чтобы не создавать дубликаты.
  const existingUrls = new Set<string>();
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('media_archive_records')
      .select('canonical_url')
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    for (const row of data ?? []) {
      if (row.canonical_url) {
        existingUrls.add(normalizeUrl(row.canonical_url));
      }
    }

    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }

  const seenInSource = new Set<string>();
  const toInsert = [];
  let duplicateSource = 0;
  let duplicateDatabase = 0;

  for (const record of records) {
    const canonicalUrl = normalizeUrl(record.url);

    if (seenInSource.has(canonicalUrl)) {
      duplicateSource++;
      continue;
    }

    seenInSource.add(canonicalUrl);

    if (existingUrls.has(canonicalUrl)) {
      duplicateDatabase++;
      continue;
    }

    toInsert.push({
      url: record.url,
      canonical_url: canonicalUrl,
      title: record.title,
      outlet: record.outlet,
      published_date: normalizeDate(record.date),
      lang: record.lang,
      kind: record.kind,
      topic: record.topic,
      summary: record.summary,
      image_url: null,
      status: 'published',
      ai_metadata: {
        source: 'data/media.ts',
        slug: record.slug,
        program: record.program ?? null,
        note: record.note ?? null,
        original_date: record.date,
        imported: true,
      },
    });
  }

  console.log(`Записей в data/media.ts: ${records.length}`);
  console.log(`Новых записей для импорта: ${toInsert.length}`);
  console.log(`Уже есть в базе: ${duplicateDatabase}`);
  console.log(`Дубликатов в исходном файле: ${duplicateSource}`);

  let inserted = 0;

  // Небольшие пакеты упрощают диагностику ошибок.
  for (let i = 0; i < toInsert.length; i += 50) {
    const batch = toInsert.slice(i, i + 50);

    const { error } = await supabase
      .from('media_archive_records')
      .insert(batch);

    if (error) {
      console.error(
        `Ошибка при импорте пакета ${Math.floor(i / 50) + 1}:`,
        error.message,
      );
      throw error;
    }

    inserted += batch.length;
    console.log(`Импортировано: ${inserted}/${toInsert.length}`);
  }

  console.log('\nИмпорт завершён.');
  console.log(`Добавлено: ${inserted}`);
  console.log(`Пропущено существующих: ${duplicateDatabase}`);
  console.log('Исходный data/media.ts не изменялся.');
}

main().catch((error) => {
  console.error('\nИмпорт прерван:', error);
  process.exitCode = 1;
});
