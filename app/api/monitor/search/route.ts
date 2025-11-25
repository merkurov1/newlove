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

    console.log(`[Monitor] Scouting via BING for: ${artist}`);

    // ТАКТИКА: BING SEARCH (Менее агрессивная защита)
    // Ищем лоты на Invaluable через Bing
    const query = `site:invaluable.com "${artist}" "lot details"`;
    // Используем глобальный Bing (без локализации)
    const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=en-us`;
    
    const jinaUrl = `https://r.jina.ai/${bingUrl}`;
    
    const jinaResponse = await fetch(jinaUrl, {
      headers: { 
          'X-Return-Format': 'markdown',
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
      },
      cache: 'no-store'
    });

    if (!jinaResponse.ok) {
        return NextResponse.json({ error: 'Scout failed to connect' }, { status: 500 });
    }

    const markdown = await jinaResponse.text();
    
    // Проверка, вернул ли Bing хоть что-то
    if (markdown.length < 500 || markdown.includes("There are no results")) {
         console.warn("[Monitor] Bing returned empty or blocked result.");
         return NextResponse.json({ found: 0, links: [], warning: "Search blocked or empty" });
    }

    // 3. Gemini фильтрует
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const prompt = `
      ROLE: Data Scout.
      TASK: Extract URLs from Bing search results.
      CONTEXT: We are looking for auction lots for "${artist}".
      
      RULES:
      1. Return JSON: { "links": [] }.
      2. TARGET: Links starting with "https://www.invaluable.com/auction-lot/" 
      3. IGNORE: Search related links, ads, microsoft links.
      
      INPUT TEXT:
      ${markdown.substring(0, 20000)}
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/^```json\s*/, '').replace(/```\s*$/, '');
    
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        return NextResponse.json({ found: 0, links: [] });
    }
    
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