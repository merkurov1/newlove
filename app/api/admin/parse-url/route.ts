import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
// Ставим таймаут побольше, Jina иногда задумывается
export const maxDuration = 60; 

const apiKey = (process.env.GOOGLE_API_KEY || "").trim();
const genAI = new GoogleGenerativeAI(apiKey);

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 });

    // 1. THE HARVESTER (Jina Reader)
    // Скачиваем страницу в чистом Markdown
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

    // 2. THE BRAIN (Gemini Analysis)
    // Используем Flash 2.0 (или 1.5), она идеальна для экстракции данных
    const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash', // Или 'gemini-2.0-flash', если доступна
        generationConfig: { responseMimeType: "application/json" } 
    });

    const prompt = `
      TASK: You are an Art Data Specialist.
      Extract structured data from the scraped auction page content below.

      CRITICAL: Find the MAIN artwork image URL. Jina returns images in markdown format like ![alt](url). 
      Look for the largest/main image associated with the lot. Ignore icons, logos, or tiny thumbnails.

      SOURCE CONTENT (Markdown):
      ${markdown.substring(0, 25000)} 

      OUTPUT FORMAT (JSON):
      {
        "artist": "Name (Year-Year)",
        "title": "Title of work",
        "image_url": "HTTPS URL of the main image (or empty string if not found)",
        "medium": "Oil on canvas, etc",
        "dimensions": "Height x Width cm/in",
        "date": "Year of execution",
        "estimate": "GBP X - GBP Y",
        "provenance": "List of previous owners (summary)",
        "raw_description": "The main essay/description text about the lot"
      }

      If a field is missing, leave it as empty string "".
      Clean up the text (remove "Lot details", "Bid now", cookie warnings etc).
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // Парсим ответ модели
    const jsonResponse = JSON.parse(responseText);

    return NextResponse.json(jsonResponse);

  } catch (error) {
    console.error('[Parser Error]:', error);
    return NextResponse.json(
      { error: 'Parsing failed. The site might be protected.', details: String(error) }, 
      { status: 500 }
    );
  }
}