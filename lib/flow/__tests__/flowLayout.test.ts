import assert from 'assert';

function normalizeForComparison(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

function getTitleAndBodyDisplay(item: {
  title?: string | null;
  body_md?: string | null;
}) {
  const rawTitle = (item.title || '').trim();
  const rawBody = (item.body_md || '').trim();

  if (!rawTitle) {
    return { title: null, body: rawBody || null };
  }

  if (!rawBody) {
    return { title: rawTitle, body: null };
  }

  const normTitle = normalizeForComparison(rawTitle);
  const normBody = normalizeForComparison(rawBody);

  // If title is redundant with body
  if (
    normTitle === normBody ||
    normBody.startsWith(normTitle) ||
    normTitle.startsWith(normBody)
  ) {
    return { title: null, body: rawBody };
  }

  const firstLine = rawBody.split(/\r?\n/)[0]?.trim() || '';
  const firstLineNorm = normalizeForComparison(firstLine);
  if (
    firstLineNorm &&
    (firstLineNorm === normTitle ||
      normTitle.startsWith(firstLineNorm) ||
      firstLineNorm.startsWith(normTitle))
  ) {
    return { title: null, body: rawBody };
  }

  return { title: rawTitle, body: rawBody };
}

type Archetype = 'video' | 'visual_story' | 'curated_links' | 'short_note' | 'article';

function detectArchetype(
  item: { type?: string; body_md?: string | null },
  videoId: string | null,
  images: string[],
  linkCount: number,
): Archetype {
  if (videoId) return 'video';
  if (images.length >= 2 || item.type === 'photo') return 'visual_story';
  if (linkCount >= 2 || (item.type === 'link' && linkCount > 0)) return 'curated_links';

  const body = item.body_md || '';
  if (item.type === 'article' || body.length > 350 || body.includes('\n#') || body.includes('\n\n')) {
    return 'article';
  }

  return 'short_note';
}

function getTelegramUrl(item: {
  telegram_message_id?: string | number | null;
  metadata?: Record<string, unknown> | null;
}): string | null {
  const msgId =
    item.telegram_message_id ||
    (item.metadata?.telegram_message_id as string | number | undefined);

  if (msgId) {
    return `https://t.me/merkurov/${msgId}`;
  }
  return null;
}

function getBlueskyUrl(item: {
  bluesky_uri?: string | null;
  metadata?: Record<string, unknown> | null;
}): string | null {
  const uri =
    item.bluesky_uri ||
    (typeof item.metadata?.bluesky_uri === 'string'
      ? item.metadata.bluesky_uri
      : null);

  if (uri) {
    const rkey = uri.split('/').pop();
    if (rkey) {
      return `https://bsky.app/profile/merkurov.love/post/${encodeURIComponent(rkey)}`;
    }
  }
  return null;
}

// Tests
console.log('--- Running Flow Module Layout & Deduplication Tests ---');

// Test 1: Deduplication when title equals body
{
  const res = getTitleAndBodyDisplay({
    title: 'Привет мир',
    body_md: 'Привет мир',
  });
  assert.strictEqual(res.title, null, 'Title identical to body must be deduplicated to null');
  assert.strictEqual(res.body, 'Привет мир');
  console.log('✓ Test 1 passed: Identical title and body deduplicated');
}

// Test 2: Deduplication when body starts with title
{
  const res = getTitleAndBodyDisplay({
    title: 'Привет мир!',
    body_md: 'Привет мир! Сегодня отличная погода для прогулок.',
  });
  assert.strictEqual(res.title, null, 'Title starting the body must be deduplicated to null');
  assert.strictEqual(res.body, 'Привет мир! Сегодня отличная погода для прогулок.');
  console.log('✓ Test 2 passed: Title prefix in body deduplicated');
}

// Test 3: Deduplication when first line matches title
{
  const res = getTitleAndBodyDisplay({
    title: 'Заметка о времени',
    body_md: 'Заметка о времени\nВторой абзац текста.',
  });
  assert.strictEqual(res.title, null, 'First line match must be deduplicated to null');
  assert.strictEqual(res.body, 'Заметка о времени\nВторой абзац текста.');
  console.log('✓ Test 3 passed: First line matching title deduplicated');
}

// Test 4: Preservation when title is a distinct headline
{
  const res = getTitleAndBodyDisplay({
    title: 'Архитектура цифрового наследия',
    body_md: 'Когда мы говорим о вечности, мы имеем в виду неизменность протокола.',
  });
  assert.strictEqual(res.title, 'Архитектура цифрового наследия');
  assert.strictEqual(res.body, 'Когда мы говорим о вечности, мы имеем в виду неизменность протокола.');
  console.log('✓ Test 4 passed: Distinct headline preserved');
}

// Test 5: Archetype detection
{
  // Video
  assert.strictEqual(detectArchetype({ type: 'note' }, 'dQw4w9WgXcQ', [], 0), 'video');

  // Visual story
  assert.strictEqual(detectArchetype({ type: 'photo' }, null, ['a.jpg', 'b.jpg'], 0), 'visual_story');
  assert.strictEqual(detectArchetype({ type: 'note' }, null, ['a.jpg', 'b.jpg', 'c.jpg'], 0), 'visual_story');

  // Curated links
  assert.strictEqual(detectArchetype({ type: 'link' }, null, [], 2), 'curated_links');

  // Short note
  assert.strictEqual(detectArchetype({ type: 'note', body_md: 'Короткая мысль.' }, null, ['a.jpg'], 0), 'short_note');

  // Article
  assert.strictEqual(
    detectArchetype({ type: 'article', body_md: 'Длинная статья о технологиях...\n\nВторой абзац.' }, null, [], 0),
    'article'
  );
  console.log('✓ Test 5 passed: Smart archetypes correctly identified');
}

// Test 6: Social link generation
{
  const tg = getTelegramUrl({ telegram_message_id: 1234 });
  assert.strictEqual(tg, 'https://t.me/merkurov/1234');

  const bsky = getBlueskyUrl({ bluesky_uri: 'at://did:plc:123/app.bsky.feed.post/3ldf2' });
  assert.strictEqual(bsky, 'https://bsky.app/profile/merkurov.love/post/3ldf2');
  console.log('✓ Test 6 passed: Telegram and Bluesky URLs correctly constructed');
}

console.log('All 6 test suites passed successfully!');
