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

    console.log(`[Monitor] Scouting for: ${artist}`);

    // 1. Формируем поисковый запрос к агрегатору
    // Мы используем Invaluable, так как там много данных и открытая структура.
    const searchUrl = `https://www.invaluable.com/search?keyword=${encodeURIComponent(artist)}`;
    
    // 2. Читаем страницу выдачи через Jina
    const jinaUrl = `https://r.jina.ai/${searchUrl}`;
    
    const jinaResponse = await fetch(jinaUrl, {
      headers: { 'X-Return-Format': 'markdown' },
      cache: 'no-store'
    });

    if (!jinaResponse.ok) {
        return NextResponse.json({ error: 'Scout failed to connect' }, { status: 500 });
    }

    const markdown = await jinaResponse.text();

    // 3. Gemini фильтрует ссылки
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const prompt = `
      ROLE: Data Scout.
      TASK: Find all URLs pointing to specific auction lots in the text below.
      CONTEXT: We are looking for art pieces by "${artist}".
      
      RULES:
      1. Return ONLY a JSON object with a key "links" containing an array of strings.
      2. Links must be absolute URLs (start with https://).
      3. Look for links containing "/auction-lot/" or similar patterns indicative of a single item page.
      4. Ignore generic links (login, signup, privacy policy).
      
      INPUT MARKDOWN:
      ${markdown.substring(0, 20000)}
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/^```json\s*/, '').replace(/```\s*$/, '');
    
    const data = JSON.parse(text);
    
    // Фильтруем возможные дубли в выдаче
    const uniqueLinks = Array.from(new Set(data.links));

    return NextResponse.json({ 
        found: uniqueLinks.length, 
        links: uniqueLinks 
    });

  } catch (error) {
    console.error('[Monitor Error]:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}