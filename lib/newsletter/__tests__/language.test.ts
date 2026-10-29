import assert from 'node:assert';
import { isSubscriberMatchingLang, filterSubscribersByLang } from '../language';

test('isSubscriberMatchingLang correctly targets subscribers based on issue language', () => {
  // English issue targeting
  assert.strictEqual(isSubscriberMatchingLang('en', 'en'), true, 'en locale matches en issue');
  assert.strictEqual(isSubscriberMatchingLang('en-US', 'en'), true, 'en-US matches en issue');
  assert.strictEqual(
    isSubscriberMatchingLang('EN', 'en'),
    true,
    'case-insensitive EN matches en issue'
  );
  assert.strictEqual(
    isSubscriberMatchingLang('ru', 'en'),
    false,
    'ru locale does not match en issue'
  );
  assert.strictEqual(
    isSubscriberMatchingLang('ru-RU', 'en'),
    false,
    'ru-RU does not match en issue'
  );
  assert.strictEqual(
    isSubscriberMatchingLang(null, 'en'),
    false,
    'null locale does not match en issue'
  );
  assert.strictEqual(
    isSubscriberMatchingLang('', 'en'),
    false,
    'empty locale does not match en issue'
  );

  // Russian issue targeting
  assert.strictEqual(isSubscriberMatchingLang('ru', 'ru'), true, 'ru locale matches ru issue');
  assert.strictEqual(isSubscriberMatchingLang('ru-RU', 'ru'), true, 'ru-RU matches ru issue');
  assert.strictEqual(isSubscriberMatchingLang(null, 'ru'), true, 'null locale defaults to ru');
  assert.strictEqual(isSubscriberMatchingLang('', 'ru'), true, 'empty locale defaults to ru');
  assert.strictEqual(
    isSubscriberMatchingLang(undefined, 'ru'),
    true,
    'undefined locale defaults to ru'
  );
  assert.strictEqual(
    isSubscriberMatchingLang('en', 'ru'),
    false,
    'en locale does not match ru issue'
  );
  assert.strictEqual(
    isSubscriberMatchingLang('en-GB', 'ru'),
    false,
    'en-GB does not match ru issue'
  );
  assert.strictEqual(
    isSubscriberMatchingLang('EN', 'ru'),
    false,
    'case-insensitive EN does not match ru issue'
  );

  // Default issue language (when null or undefined, treated as ru)
  assert.strictEqual(isSubscriberMatchingLang('ru', null), true);
  assert.strictEqual(isSubscriberMatchingLang('en', null), false);
});

test('filterSubscribersByLang filters subscriber lists correctly', () => {
  const subscribers = [
    { id: '1', email: 'ru1@test.com', locale: 'ru' },
    { id: '2', email: 'en1@test.com', locale: 'en' },
    { id: '3', email: 'ru2@test.com', locale: null },
    { id: '4', email: 'en2@test.com', locale: 'en-US' },
    { id: '5', email: 'ru3@test.com', locale: 'ru-RU' },
  ];

  const enRecipients = filterSubscribersByLang(subscribers, 'en');
  assert.strictEqual(enRecipients.length, 2);
  assert.deepStrictEqual(
    enRecipients.map((s) => s.id),
    ['2', '4']
  );

  const ruRecipients = filterSubscribersByLang(subscribers, 'ru');
  assert.strictEqual(ruRecipients.length, 3);
  assert.deepStrictEqual(
    ruRecipients.map((s) => s.id),
    ['1', '3', '5']
  );
});
