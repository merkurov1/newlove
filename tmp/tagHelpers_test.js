const { extractArticleIdFromRelRow } = require('../lib/tagHelpers.js');

const samples = [
  { A: '123' },
  { a: { id: 'abc' } },
  { article_id: 42 },
  { article: { id: 'uuid-1' } },
  { random: 'something', other: 55 },
  null,
  {},
];

for (const s of samples) {
  try {
    console.log('sample:', JSON.stringify(s), '->', extractArticleIdFromRelRow(s));
  } catch (e) {
    console.log('sample:', JSON.stringify(s), '-> error', e && e.message);
  }
}
