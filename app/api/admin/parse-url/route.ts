import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60; // Даем время на размышление

const apiKey = (process.env.GOOGLE_API_KEY || "").trim();
const genAI = new GoogleGenerativeAI(apiKey);

// Функция для очистки ответа от Markdown-обертки
function cleanJSON(text: string) {
  return text.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
}

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 });

    console.log(`[Parser] Target: ${url}`);

    // 1. THE HARVESTER (Jina)
    const jinaResponse = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        'X-Return-Format': 'markdown',
        'X-With-Images-Summary': 'true',
        // Притворяемся обычным браузером
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
      }
    });

    if (!jinaResponse.ok) {
        console.error(`[Parser] Jina failed: ${jinaResponse.status}`);
        return NextResponse.json({ error: 'Scraper failed' }, { status: 500 });
    }

    const markdown = await jinaResponse.text();

    if (!markdown || markdown.length < 100) {
         console.warn('[Parser] Markdown is too short/empty');
         return NextResponse.json({ error: 'Content empty' }, { status: 422 });
    }

    // 2. THE BRAIN (Gemini)
    const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash', // Или gemini-2.0-flash-exp если есть доступ
        generationConfig: { responseMimeType: "application/json" } 
    });

    const prompt = `
      ROLE: Data Extraction Bot.
      INPUT: Unstructured Markdown from an auction site.
      OUTPUT: Valid JSON only.

      EXTRACT THESE FIELDS:
      - artist (Name)
      - title (Artwork title)
      - image_url (Find the MAIN high-res image link in the markdown, usually ending in .jpg/.png)
      - medium (Technique/Material)
      - dimensions (Size)
      - date (Year of work)
      - estimate (Price range)
      - provenance (History)
      - raw_description (Full text description)

      CONTEXT SOURCE:
      ${markdown.substring(0, 28000)}

      JSON SCHEMA:
      {
        "artist": "string",
        "title": "string",
        "image_url": "string",
        "medium": "string",
        "dimensions": "string",
        "date": "string",
        "estimate": "string",
        "provenance": "string",
        "raw_description": "string"
      }
    `;

    const result = await model.generateContent(prompt);
    const rawText = result.response.text();
    
    console.log('[Parser] Raw Gemini Output (First 100 chars):', rawText.substring(0, 100));

    // Очищаем и парсим
    let jsonResponse;
    try {
        jsonResponse = JSON.parse(cleanJSON(rawText));
    } catch (e) {
        console.error('[Parser] JSON Parse Failed. Raw text:', rawText);
        return NextResponse.json({ error: 'AI produced invalid JSON' }, { status: 500 });
    }

    return NextResponse.json(jsonResponse);

  } catch (error) {
    console.error('[Parser Error]:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: String(error) }, 
      { status: 500 }
    );
  }
}