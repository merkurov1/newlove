export async function parseLotWithAI(url: string, rawText?: string) {
  let pageTitle = '';
  let ogImage = '';
  let contentToAnalyze = rawText || '';

  // 1. Извлечение og:image и текста страницы, если передан URL
  if (url) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await res.text();
      
      const imgMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
      if (imgMatch) ogImage = imgMatch[1];

      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) pageTitle = titleMatch[1];

      if (!contentToAnalyze) {
        contentToAnalyze = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                               .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                               .replace(/<[^>]+>/g, ' ')
                               .slice(0, 10000);
      }
    } catch (e) {
      console.warn('Не удалось распарсить URL напрямую:', e);
    }
  }

  // 2. Берем ключ из google_API_key
  const apiKey = process.env.google_API_key || process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error('Переменная окружения google_API_key не найдена в .env.local');
  }

  // 3. Запрос к OpenRouter
  const prompt = `Извлеки структурированную информацию об аукционном лоте из текста. 
Верни ТОЛЬКО валидный JSON в формате:
{
  "title": "Название произведения",
  "artist": "Имя художника или N/A",
  "year": "Год создания или N/A",
  "medium": "Техника / материалы",
  "estimate_low": 1000,
  "estimate_high": 2000,
  "currency": "USD",
  "description": "Краткое описание"
}

Заголовок страницы: ${pageTitle}
Текст: ${contentToAnalyze}`;

  const openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-3.5-sonnet',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    })
  });

  const aiData = await openRouterRes.json();
  const parsedJson = JSON.parse(aiData.choices?.[0]?.message?.content || '{}');

  return {
    ...parsedJson,
    preview_image: ogImage,
    source_url: url
  };
}
