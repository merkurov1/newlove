import Groq from 'groq-sdk';
import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const maxDuration = 30; 

const apiKey = (process.env.GOOGLE_API_KEY || "").trim();
const groq = new Groq({ apiKey });

// Используем ту же стабильную рабочую модель, что и для чата
const MODEL_NAME = 'llama-3.1-8b-instant';

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);
    const { url } = await req.json();

    if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 });

    // 1. THE HARVESTER (Jina Reader преобразует сайт в Markdown)
    console.log(`[Parser] Harvesting: ${url}`);
    const jinaResponse = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        'X-Return-Format': 'markdown',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' 
      }
    });

    if (!jinaResponse.ok) {
      throw new Error(`Harvester failed: ${jinaResponse.statusText}`);
    }

    const markdown = await jinaResponse.text();

    // 2. THE BRAIN (Groq структурирует данные и находит картинку)
    const prompt = `
      TASK: You are an Art Data Specialist.
      Extract structured data from the scraped auction page content below.
      Look for the main artwork image URL if present in the text/links.

      SOURCE CONTENT (Markdown):
      ${markdown.substring(0, 20000)}

      Return ONLY a valid JSON object in this exact format (no markdown code blocks around it if possible, or standard JSON):
      {
        "artist": "Name (Year-Year)",
        "title": "Title of work",
        "medium": "Oil on canvas, etc",
        "dimensions": "Height x Width cm/in",
        "date": "Year of execution",
        "estimate": "GBP X - GBP Y",
        "provenance": "List of previous owners (summary)",
        "image_url": "Direct URL of the artwork image if found in text/markdown, otherwise empty string",
        "raw_description": "The main essay/description text about the lot"
      }

      If a field is missing, leave it as empty string "".
      Clean up the text (remove "Lot details", "Bid now" etc).
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
    console.error('[Parser Error]:', error);
    return NextResponse.json(
      { error: 'Parsing failed. The site might be protected.', details: error?.message || String(error) }, 
      { status: 500 }
    );
  }
}
