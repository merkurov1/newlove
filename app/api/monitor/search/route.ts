import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const apiKey = (process.env.GOOGLE_API_KEY || "").trim();
const genAI = new GoogleGenerativeAI(apiKey);

export async function POST(req: Request) {
  try {
    const { artist } = await req.json();
    
    if (!artist) return NextResponse.json({ error: 'Artist name required' }, { status: 400 });

    console.log(`[Monitor] Scouting via Search Engine for: ${artist}`);

    // ТАКТИКА: БОКОВОЙ ВХОД
    // Мы ищем не на сайте аукциона, а в индексе DuckDuckGo (HTML версия).
    // Запрос: site:invaluable.com "Artist Name" "auction lot"
    // Это обходит JS-защиту агрегатора.
    const query = `site:invaluable.com "${artist}" auction lot`;
    const searchEngineUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    
    // Скармливаем выдачу поисковика в Jina
    const jinaUrl = `https://r.jina.ai/${searchEngineUrl}`;
    
    const jinaResponse = await fetch(jinaUrl, {
      headers: { 
          'X-Return-Format': 'markdown',
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' // Притворяемся ботом Гугла, иногда помогает
      },
      cache: 'no-store'
    });

    if (!jinaResponse.ok) {
        console.error(`[Monitor] Jina Error: ${jinaResponse.status}`);
        return NextResponse.json({ error: 'Scout failed to connect' }, { status: 500 });
    }

    const markdown = await jinaResponse.text();
    console.log(`[Monitor] Jina received ${markdown.length} chars from Search Engine.`);

    // Если Jina вернула мало данных, значит нас заблочили или поиск пуст
    if (markdown.length < 500) {
        return NextResponse.json({ found: 0, links: [], warning: "Search engine returned empty result" });
    }

    // 3. Gemini фильтрует ссылки из выдачи поисковика
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const prompt = `
      ROLE: Data Scout.
      TASK: Extract target URLs from the search engine results below.
      
      CONTEXT: We are looking for auction lots for artist: "${artist}".
      
      RULES:
      1. Return ONLY a JSON object with a key "links" (array of strings).
      2. TARGET: Look for links starting with: 
         - "https://www.invaluable.com/auction-lot/"
         - "https://www.invaluable.com/buy-now/"
      3. IGNORE: generic links, search queries, privacy policies, ads.
      4. Clean the URLs (remove tracking params if obvious).
      
      INPUT TEXT:
      ${markdown.substring(0, 20000)}
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/^```json\s*/, '').replace(/```\s*$/, '');
    
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        console.error("JSON Parse Error", text);
        return NextResponse.json({ found: 0, links: [] });
    }
    
    // Фильтруем дубли
    const uniqueLinks = Array.from(new Set(data.links));

    console.log(`[Monitor] Targets acquired: ${uniqueLinks.length}`);

    return NextResponse.json({ 
        found: uniqueLinks.length, 
        links: uniqueLinks 
    });

  } catch (error) {
    console.error('[Monitor Error]:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}