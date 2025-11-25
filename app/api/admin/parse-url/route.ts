import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
// Увеличиваем таймаут, так как парсинг может занять время
export const maxDuration = 30; 

const apiKey = (process.env.GOOGLE_API_KEY || "").trim();
const genAI = new GoogleGenerativeAI(apiKey);

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 });

    // 1. THE HARVESTER (Используем Jina Reader как прокси)
    // Это превращает сложный сайт Christie's в простой Markdown
    console.log(`[Parser] Harvesting: ${url}`);
    const jinaResponse = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        'X-Return-Format': 'markdown',
        // Иногда полезно притвориться браузером, хотя Jina это делает сама
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' 
      }
    });

    if (!jinaResponse.ok) {
      throw new Error(`Harvester failed: ${jinaResponse.statusText}`);
    }

    const markdown = await jinaResponse.text();

    // 2. THE BRAIN (Gemini структурирует кашу)
    const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.5-flash',
        generationConfig: { responseMimeType: "application/json" } 
    });

    const prompt = `
      TASK: You are an Art Data Specialist.
      Extract structured data from the scraped auction page content below.

      SOURCE CONTENT (Markdown):
      ${markdown.substring(0, 20000)} // Ограничиваем длину, чтобы не пробить лимиты

      OUTPUT FORMAT (JSON):
      {
        "image_url": "URL of the main artwork image (look for ![image](url) pattern)", 
        "artist": "Name (Year-Year)",
        "title": "Title of work",
        "medium": "Oil on canvas, etc",
        "dimensions": "Height x Width cm/in",
        "date": "Year of execution",
        "estimate": "GBP X - GBP Y",
        "provenance": "List of previous owners (summary)",
        "raw_description": "The main essay/description text about the lot"
      }

      If a field is missing, leave it as empty string "".
      Clean up the text (remove "Lot details", "Bid now" etc).
    `;

    const result = await model.generateContent(prompt);
    const jsonResponse = JSON.parse(result.response.text());

    return NextResponse.json(jsonResponse);

  } catch (error) {
    console.error('[Parser Error]:', error);
    return NextResponse.json(
      { error: 'Parsing failed. The site might be protected.', details: String(error) }, 
      { status: 500 }
    );
  }
}