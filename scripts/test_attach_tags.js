const { attachTagsToArticles } = require('../lib/attachTagsToArticles');

async function run() {
  // Mock supabase client minimal interface
  const mockSupabase = {
    from(table) {
      return {
        select() { return { data: [{ A: 'a1', B: 't1' }], error: null }; },
        in() { return this; },
        eq() { return this; },
        order() { return this; }
      };
    }
  };

  const articles = [{ id: 'a1', title: 'X' }];
  try {
    const res = await attachTagsToArticles(mockSupabase, articles);
    console.log('attachTagsToArticles smoke result:', JSON.stringify(res, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('attachTagsToArticles smoke failed', e);
    process.exit(1);
  }
}

run();
