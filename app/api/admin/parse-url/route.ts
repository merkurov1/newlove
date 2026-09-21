import Groq from 'groq-sdk';
import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const maxDuration = 30; 

const apiKey = (process.env.GOOGLE_API_KEY || "").trim();
const groq = new Groq({ apiKey });
const MODEL_NAME = 'llama-3.1-8b-instant';

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);
    const { url } = await req.json();

    if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 });

    console.log(`[Parser] Harvesting protected URL: ${url}`);
    
    // Используем альтернативный эндпоинт или передаем расширенные заголовки для обхода Cloudflare
    const jinaResponse = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        'X-Return-Format': 'markdown',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });

    if (!jinaResponse.ok) {
      throw new Error(`Harvester blocked by target site: ${jinaResponse.status} ${jinaResponse.statusText}`);
    }

    const markdown = await jinaResponse.text();

    const prompt = `
      TASK: You are an Art Data Specialist.
      Extract structured data and the main artwork image URL from the scraped auction page content below.

      SOURCE CONTENT (Markdown):
      ${markdown.substring(0, 25000)}

      Return ONLY a valid JSON object in this exact format:
      {
        "artist": "Name (Year-Year)",
        "title": "Title of work",
        "medium": "Oil on canvas, etc",
        "dimensions": "Height x Width cm/in",
        "date": "Year of execution",
        "estimate": "Currency X - Currency Y",
        "provenance": "List of previous owners (summary)",
        "image_url": "Direct image URL of the artwork if found, otherwise empty string",
        "raw_description": "The main essay/description text about the lot"
      }
    `;

    const completion = await groq.chat.completions.create({
      model: MODEL_NAME,
      messages: [
        { role: 'system', content: 'You extract structured JSON data from auction text. Output strict JSON only.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const contentText = completion.choices[0]?.message?.content || '{}';
    const jsonResponse = JSON.parse(contentText);

    return NextResponse.json(jsonResponse);

  } catch (error: any) {
    console.error('[Parser Error Details]:', error);
    return NextResponse.json(
      { error: 'Parsing failed. The site is protected by anti-bot rules.', details: error?.message || String(error) }, 
      { status: 500 }
    );
  }
}
