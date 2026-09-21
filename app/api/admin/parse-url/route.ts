import Groq from 'groq-sdk';
import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const maxDuration = 60; 

const groq = new Groq({ apiKey: (process.env.GOOGLE_API_KEY || "").trim() });
const MODEL_NAME = 'llama-3.1-8b-instant';

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);
    const { url } = await req.json();

    if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 });

    const scrapingAntKey = process.env.SCRAPINGANT_API_KEY;
    if (!scrapingAntKey) {
      return NextResponse.json({ error: 'SCRAPINGANT_API_KEY is missing in environment variables.' }, { status: 500 });
    }

    console.log(`[Curator Engine] Scraping via ScrapingAnt: ${url}`);

    const scrapingAntUrl = `https://api.scrapingant.com/v2/general?url=${encodeURIComponent(url)}&x-api-key=${scrapingAntKey}&render_js=true&bypass_cloudflare=true`;

    const response = await fetch(scrapingAntUrl);
    const responseText = await response.text();

    if (!response.ok) {
      console.error('[ScrapingAnt Error Response]:', responseText);
      throw new Error(`ScrapingAnt failed with status ${response.status}`);
    }

    let scraperData;
    try {
      scraperData = JSON.parse(responseText);
    } catch (e) {
      console.error('[ScrapingAnt Non-JSON Output]:', responseText.substring(0, 300));
      throw new Error('ScrapingAnt returned HTML/Non-JSON data instead of API response.');
    }

    const htmlContent = scraperData.content || '';

    if (!htmlContent || htmlContent.length < 200) {
      throw new Error('Retrieved page content is empty or blocked.');
    }

    console.log(`[Curator Engine] Page fetched successfully. Length: ${htmlContent.length}. Parsing with Groq...`);

    const prompt = `
      TASK: You are an elite Art Data Specialist. 
      Extract structured data and the primary artwork image URL from the raw page content below.

      RAW CONTENT:
      ${htmlContent.substring(0, 35000)}

      Return ONLY a strict JSON object in this exact format:
      {
        "artist": "Name (Year-Year)",
        "title": "Title of work",
        "medium": "Medium description",
        "dimensions": "Dimensions",
        "date": "Year",
        "estimate": "Estimate price",
        "provenance": "Provenance summary",
        "image_url": "Direct image URL of the artwork if found, otherwise empty string",
        "raw_description": "Main essay/description text about the lot"
      }
    `;

    const completion = await groq.chat.completions.create({
      model: MODEL_NAME,
      messages: [
        { role: 'system', content: 'You extract structured JSON data from HTML content. Output strict JSON only.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const jsonResponse = JSON.parse(completion.choices[0]?.message?.content || '{}');
    return NextResponse.json(jsonResponse);

  } catch (error: any) {
    console.error('[Parser Error]:', error);
    return NextResponse.json(
      { error: 'Parsing failed.', details: error?.message || String(error) }, 
      { status: 500 }
    );
  }
}
