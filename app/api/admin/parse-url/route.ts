import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60; 

const apiKey = (process.env.GOOGLE_API_KEY || "").trim();
const genAI = new GoogleGenerativeAI(apiKey);

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 });

    // 1. THE HARVESTER
    // Добавляем параметр withImagesSummary, чтобы Jina лучше отдавала картинки
    const jinaResponse = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        'X-Return-Format': 'markdown',
        'X-With-Images-Summary': 'true', // Просим Jina собрать список картинок в конце
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
      }
    });

    if (!jinaResponse.ok) throw new Error(`Harvester failed: ${jinaResponse.statusText}`);
    const markdown = await jinaResponse.text();

    // 2. THE BRAIN
    const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        generationConfig: { responseMimeType: "application/json" } 
    });

    const prompt = `
      ROLE: You are an elite Data Extraction Specialist specialized in Art Auctions.
      
      TASK: Extract structured metadata from the raw auction page text below.
      
      SPECIFIC PLATFORM HINTS:
      - If "Invaluable.com": The DATE is often near "Starts:", "Live Auction", or "Upcoming". It might be in a header. Look closely for a Day/Month/Year pattern.
      - If "Artcurial": The IMAGE is often a long URL ending in .jpg or .jpeg. Ignore "logo.png" or "picto". Look for the Markdown image syntax ![...](url) that corresponds to the main artwork.

      SOURCE TEXT (Markdown):
      ${markdown.substring(0, 30000)}

      OUTPUT JSON STRUCTURE:
      {
        "artist": "Artist Name (Year-Year)",
        "title": "Title of the work",
        "image_url": "The DIRECT url of the main artwork image. Must start with http. Prefer high-res.",
        "medium": "Material/Technique",
        "dimensions": "Size",
        "date": "Year of creation (of the artwork)",
        "auction_date": "Date of the auction (e.g. '25 Nov 2025' or 'Starts in 2 days'). If not found, leave empty.",
        "estimate": "Price estimate range",
        "provenance": "History of ownership",
        "raw_description": "Full description text"
      }
      
      RULES:
      1. If you find multiple images, pick the one that looks like a Painting/Sculpture, NOT the auction house logo.
      2. If a field is missing, return empty string "". Do not invent data.
    `;

    const result = await model.generateContent(prompt);
    const jsonResponse = JSON.parse(result.response.text());

    return NextResponse.json(jsonResponse);

  } catch (error) {
    console.error('[Parser Error]:', error);
    return NextResponse.json({ error: 'Parsing failed', details: String(error) }, { status: 500 });
  }
}