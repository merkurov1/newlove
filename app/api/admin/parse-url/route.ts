import Groq from 'groq-sdk';
import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const maxDuration = 30; 

const groq = new Groq({ apiKey: (process.env.GOOGLE_API_KEY || "").trim() });
const MODEL_NAME = 'llama-3.1-8b-instant';

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);
    const { url } = await req.json();

    if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 });

    console.log(`[Curator Engine] Fetching via Social Bot emulation: ${url}`);

    // Притворяемся сканером соцсетей (Facebook / Twitter), чтобы обойти жесткий Cloudflare-экран для браузеров
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });

    const htmlContent = await response.text();

    if (!response.ok || htmlContent.length < 500) {
      throw new Error(`Target auction house blocked the request (Status: ${response.status})`);
    }

    console.log(`[Curator Engine] Page fetched successfully. HTML length: ${htmlContent.length}. Parsing with Groq...`);

    const prompt = `
      TASK: You are an elite Art Data Specialist. 
      Extract structured data and the primary artwork image URL from the raw HTML page content or Open Graph meta tags below.

      RAW CONTENT:
      ${htmlContent.substring(0, 40000)}

      Return ONLY a strict JSON object in this exact format:
      {
        "artist": "Name (Year-Year)",
        "title": "Title of work",
        "medium": "Medium description",
        "dimensions": "Dimensions",
        "date": "Year",
        "estimate": "Estimate price",
        "provenance": "Provenance summary",
        "image_url": "Direct image URL from og:image meta tag or content if found, otherwise empty string",
        "raw_description": "Main essay/description text or og:description content about the lot"
      }
    `;

    const completion = await groq.chat.completions.create({
      model: MODEL_NAME,
      messages: [
        { role: 'system', content: 'You extract structured JSON data from HTML and Meta tags. Output strict JSON only.' },
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
