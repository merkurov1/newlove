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

    // Encode the full URL when calling r.jina.ai
    const jinaUrl = `https://r.jina.ai/${encodeURI(bingUrl)}`;

    const jinaResponse = await fetch(jinaUrl, {
      headers: { 
          'X-Return-Format': 'markdown',
          // Use an ordinary browser UA to reduce bot blocking
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash', generationConfig: { responseMimeType: "application/json", temperature: 0.0 } });

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
    const raw = result?.response ? await result.response.text() : '';
    const cleaned = String(raw).replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

    let data;
    try {
      data = JSON.parse(cleaned);
    } catch (e) {
      // Fallback: try to extract a JSON object substring from the noisy output
      const maybe = String(raw).match(/({[\s\S]*})/);
      if (maybe && maybe[1]) {
        try {
          data = JSON.parse(maybe[1]);
        } catch (e2) {
          console.warn('[Monitor] Fallback JSON parse failed', e2, (maybe[1] || '').substring(0, 1000));
          return NextResponse.json({ found: 0, links: [], warning: 'AI returned invalid JSON' });
        }
      } else {
        console.warn('[Monitor] AI did not return valid JSON', cleaned.substring(0, 1000));
        return NextResponse.json({ found: 0, links: [], warning: 'AI returned invalid JSON' });
      }
    }

    // Ensure we have an array of links
    const links = Array.isArray(data?.links) ? data.links : [];
    // Filter only Invaluable lot URLs and normalize
    const re = /^https?:\/\/(?:www\.)?invaluable\.com\/auction-lot\//i;
    const filtered = links.map((l: string) => String(l).trim()).filter((l: string) => re.test(l));
    const uniqueLinks = Array.from(new Set(filtered));

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