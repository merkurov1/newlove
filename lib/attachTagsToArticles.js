// lib/attachTagsToArticles.js
// Helper to attach tags to articles when the DB doesn't expose a direct foreign-key
// relationship that PostgREST can use in nested selects (e.g. `tags:tags(*)`).
export async function attachTagsToArticles(supabase, articles) {
  if (!supabase || !Array.isArray(articles) || articles.length === 0) return articles;
  const ids = articles.map(a => a.id).filter(Boolean);
  if (ids.length === 0) return articles;

  try {
    let rels;
    let relErr;

    // 1) get relations from junction table - historical schema uses _ArticleToTag (A: article id, B: tag id)
    let initialResp = await supabase.from('_ArticleToTag').select('A,B').in('A', ids);
    rels = initialResp.data;
    relErr = initialResp.error;

    // If permission denied, retry with a privileged server client (Supabase Service Role)
    if (relErr && (relErr.code === '42501' || /permission denied/i.test(String(relErr.message)))) {
      try {
        const srv = await import('@/lib/serverAuth');
        const srvSupabase = srv.getServerSupabaseClient();
        const srvResp = await srvSupabase.from('_ArticleToTag').select('A,B').in('A', ids);
        rels = srvResp.data;
        relErr = srvResp.error;
        
        // *** ИСПРАВЛЕНИЕ #1: Обнуление ошибки после успешной повторной попытки ***
        if (!relErr) { 
          relErr = null; 
        }

      } catch (e) {
        console.error('attachTagsToArticles: error retrying junction with service role', e);
        return articles; // Возвращаем исходные статьи при критической ошибке
      }
    }
    
    // Проверка окончательного результата запроса связей
    if (relErr) {
      console.error('attachTagsToArticles: error fetching junction relations', relErr);
      return articles;
    }
    
    // Если связей нет
    if (!rels || rels.length === 0) {
      // *** ИСПРАВЛЕНИЕ #2 (ОБЩЕЕ): Сериализация даже пустого результата ***
      return JSON.parse(JSON.stringify(articles.map(a => ({ ...a, tags: [] }))));
    }

    // Продолжаем: получаем ID тегов и сами теги
    const tagIds = Array.from(new Set(rels.map(r => r.B).filter(Boolean)));
    if (tagIds.length === 0) {
      // *** ИСПРАВЛЕНИЕ #2 (ОБЩЕЕ): Сериализация ***
      return JSON.parse(JSON.stringify(articles.map(a => ({ ...a, tags: [] }))));
    }
    
    // 2) try lowercase 'tags' first
    let tagsResp = await supabase.from('tags').select('*').in('id', tagIds);
    
    // If tags select fails due to permissions, retry with service role
    if (tagsResp.error && (tagsResp.error.code === '42501' || /permission denied/i.test(String(tagsResp.error.message)))) {
      try {
        const srv = await import('@/lib/serverAuth');
        const srvSupabase = srv.getServerSupabaseClient();
        tagsResp = await srvSupabase.from('tags').select('*').in('id', tagIds);
        
        // *** ИСПРАВЛЕНИЕ #1: Обнуление ошибки после успешной повторной попытки ***
        if (!tagsResp.error) { 
          tagsResp.error = null; 
        }

      } catch (e) {
        console.error('attachTagsToArticles: error retrying tags with service role', e);
      }
    }

    // Если основная попытка или повторная попытка не сработали, пробуем Tag (заглавная)
    if (tagsResp.error) {
      // try fallback name with original client
      tagsResp = await supabase.from('Tag').select('*').in('id', tagIds);
      
      // if still error, try service role fallback for fallback name
      if (tagsResp.error && (tagsResp.error.code === '42501' || /permission denied/i.test(String(tagsResp.error.message)))) {
        try {
          const srv = await import('@/lib/serverAuth');
          const srvSupabase = srv.getServerSupabaseClient();
          tagsResp = await srvSupabase.from('Tag').select('*').in('id', tagIds);
           
          // *** ИСПРАВЛЕНИЕ #1: Обнуление ошибки после успешной повторной попытки ***
          if (!tagsResp.error) { 
            tagsResp.error = null; 
          }

        } catch (e) {
          console.error('attachTagsToArticles: error retrying Tag fallback with service role', e);
        }
      }
    }
    
    const tags = (tagsResp && tagsResp.data) || [];

    // 3) Сопоставление тегов статьям
    const tagMap = new Map(tags.map(t => [t.id, t]));
    const articleTags = new Map();
    rels.forEach(r => {
      if (!r || !r.A) return;
      const arr = articleTags.get(r.A) || [];
      const tag = tagMap.get(r.B);
      if (tag) arr.push(tag);
      articleTags.set(r.A, arr);
    });

    const result = articles.map(a => ({ ...a, tags: articleTags.get(a.id) || [] }));

    // *** ИСПРАВЛЕНИЕ #2 (ОБЩЕЕ): Сериализация итогового результата для Server Components (Next.js) ***
    return JSON.parse(JSON.stringify(result));
    
  } catch (e) {
    console.error('attachTagsToArticles: unexpected error', e);
    // *** ИСПРАВЛЕНИЕ #2 (ОБЩЕЕ): Сериализация результата даже в случае неожиданной ошибки ***
    return JSON.parse(JSON.stringify(articles.map(a => ({ ...a, tags: [] }))));
  }
}
