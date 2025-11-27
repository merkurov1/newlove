import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Christie's heavy pages need time

const apiKey = (process.env.GOOGLE_API_KEY || "").trim();
const genAI = new GoogleGenerativeAI(apiKey);

// --- TYPES ---
interface ParsedLot {
  artist: string | null;
  title: string | null;
  image_url: string | null;
  medium: string | null;
  dimensions: string | null;
  year: string | null;
  auction_house: string;
  auction_date: string | null;
  sale_id: string | null;
  lot_number: string | null;
  location: string | null;
  estimate_low: number | null;
  estimate_high: number | null;
  currency: string | null;
  description: string | null;
  condition_report: string | null;
  provenance_list: string[];
  exhibitions: string[];
  literature: string[];
  signature: string | null;
  source_url: string;
}

// --- UTILS ---

function cleanJSON(text: string): string {
  // Remove markdown code blocks and aggressive cleanup
  return text.replace(/```json\s?|```/g, '').trim();
}

function normalizeCurrency(curr: string): string {
  const map: Record<string, string> = {
    '£': 'GBP', 'gbp': 'GBP',
    '$': 'USD', 'usd': 'USD',
    '€': 'EUR', 'eur': 'EUR',
    'chf': 'CHF', 'hkd': 'HKD'
  };
  return map[curr.toLowerCase()] || curr.toUpperCase();
}

// --- EXTRACTORS (HEURISTICS) ---

function extractLotNumber(url: string, content: string): string | null {
  // URL priority
  const urlMatch = url.match(/\/lot-.*-(\d+)\/?$/) || url.match(/\/(\d+)$/);
  if (urlMatch) return urlMatch[1];

  // Text patterns
  const patterns = [
    /Lot\s+(\d+)/i,
    /lot-number["']?\s*:?\s*["']?(\d+)/i,
    /"lotNumber"\s*:\s*"(\d+)"/i,
    /Lot (\d+) of/i
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function extractEstimate(text: string): { low: number | null; high: number | null; currency: string | null } {
  const result = { low: null as number | null, high: null as number | null, currency: null as string | null };
  const cleanText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ');

  // Standard Christie's: "GBP 10,000 – GBP 20,000" or "Estimate GBP 10,000 - 20,000"
  const patterns = [
    /(?:GBP|USD|EUR|CHF|HKD|£|\$|€)\s*([\d,]+)\s*[-–—]\s*(?:GBP|USD|EUR|CHF|HKD|£|\$|€)?\s*([\d,]+)/i,
    /(?:Estimate|Est\.?)[^:]*:\s*([\d,]+)\s*[-–—]\s*([\d,]+)\s*(GBP|USD|EUR|CHF|HKD)/i,
  ];

  for (const pattern of patterns) {
    const match = cleanText.match(pattern);
    if (match) {
      result.low = parseInt(match[1].replace(/,/g, ''), 10);
      result.high = parseInt(match[2].replace(/,/g, ''), 10);
      
      // Attempt to find currency in the match or near it
      const currencyMatch = cleanText.match(/(GBP|USD|EUR|CHF|HKD|£|\$|€)/i);
      if (currencyMatch) result.currency = normalizeCurrency(currencyMatch[1]);
      
      return result;
    }
  }
  return result;
}

function extractImages(html: string, markdown: string): string[] {
  const images: Set<string> = new Set();

  // 1. Markdown Images (Jina usually extracts these well)
  const mdRegex = /!\[.*?\]\((https?:\/\/[^)]+)\)/g;
  let mdMatch;
  while ((mdMatch = mdRegex.exec(markdown)) !== null) {
    if (!mdMatch[1].includes('icon') && !mdMatch[1].includes('logo')) {
      images.add(mdMatch[1]);
    }
  }

  // 2. HTML High-Res patterns (Christie's specific)
  const htmlPatterns = [
    /id="main_image"[^>]*src=["']([^"']+)["']/i,
    /data-fullscreen-src=["']([^"']+)["']/i,
    /"image":\s*"([^"]+)"/i,
    /<meta property="og:image" content="([^"]+)"/i
  ];

  for (const pattern of htmlPatterns) {
    const match = html.match(pattern);
    if (match) images.add(match[1].startsWith('//') ? 'https:' + match[1] : match[1]);
  }

  return Array.from(images).slice(0, 10); // Top 10 only
}

// --- MAIN HANDLER ---

export async function POST(req: Request) {
  const startTime = Date.now();
  let aiUsed = false;

  try {
    const body = await req.json();
    const url = body.url;

    if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 });

    // === STAGE 1: ROBUST FETCHING ===
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    };

    // Parallel fetch with error suppression (Promise.allSettled)
    const [jinaResult, rawResult] = await Promise.allSettled([
      fetch(`https://r.jina.ai/${encodeURIComponent(url)}`, {
        headers: { 'X-Return-Format': 'markdown', 'X-With-Images-Summary': 'true', ...headers }
      }),
      fetch(url, { headers })
    ]);

    const markdown = jinaResult.status === 'fulfilled' && jinaResult.value.ok ? await jinaResult.value.text() : '';
    const html = rawResult.status === 'fulfilled' && rawResult.value.ok ? await rawResult.value.text() : '';

    if (!markdown && !html) {
      throw new Error("Target blocked: Failed to retrieve content from both Jina and Direct connection.");
    }

    // === STAGE 2: PRE-PROCESSING ===
    const fullText = (markdown + "\n" + html).slice(0, 90000); // Limit context window
    const images = extractImages(html, markdown);
    
    // Quick Heuristics for fallback/validation
    const heuristicEst = extractEstimate(fullText);
    const heuristicLot = extractLotNumber(url, fullText);

    // === STAGE 3: GEMINI EXTRACTION ===
    // We use a stricter schema prompting approach
    const model = genAI.getGenerativeModel({
      model: process.env.GOOGLE_GEMINI_MODEL || 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.0, // Absolute determinism
      }
    });

    const prompt = `
      ROLE: Elite Art Market Analyst.
      TASK: Extract structured data from this Christie's auction lot.
      
      INPUT CONTEXT:
      URL: ${url}
      IMAGES_FOUND: ${JSON.stringify(images)}
      HEURISTIC_ESTIMATE: ${JSON.stringify(heuristicEst)}
      
      CONTENT (Markdown/HTML snippet):
      ${fullText}

      INSTRUCTIONS:
      1. Prioritize accuracy. If a field is missing, use null.
      2. For 'artist', prefer the format "Firstname Lastname" or "Lastname, Firstname".
      3. 'provenance_list' must be split by owner/transaction.
      4. 'description' should be a concise summary of the artwork visual and physical attributes.
      5. 'condition_report' is critical - look for "Condition Report" sections.

      OUTPUT JSON SCHEMAS:
      {
        "artist": "string",
        "title": "string",
        "medium": "string",
        "year": "string (YYYY)",
        "dimensions": "string",
        "lot_number": "string",
        "sale_id": "string",
        "estimate_low": "number (raw integer)",
        "estimate_high": "number (raw integer)",
        "currency": "string (ISO code)",
        "auction_date": "string",
        "location": "string",
        "provenance_list": ["string"],
        "exhibitions": ["string"],
        "literature": ["string"],
        "description": "string",
        "condition_report": "string"
      }
    `;

    let aiData: any = {};
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      aiData = JSON.parse(cleanJSON(text));
      aiUsed = true;
    } catch (e) {
      console.error("[Parser] AI Failure, reverting to heuristics", e);
    }

    // === STAGE 4: MERGE & VALIDATE ===
    const final: ParsedLot = {
      auction_house: "Christie's",
      source_url: url,
      
      artist: aiData.artist || null,
      title: aiData.title || null,
      
      // Image Logic: AI selection -> Heuristic extraction -> Fallback
      image_url: images.length > 0 ? images[0] : null,

      medium: aiData.medium || null,
      dimensions: aiData.dimensions || null,
      year: aiData.year || null,
      signature: null, // Hard to extract reliably without OCR, leaving null

      lot_number: aiData.lot_number || heuristicLot || null,
      sale_id: aiData.sale_id || null,
      location: aiData.location || null,
      auction_date: aiData.auction_date || null,

      estimate_low: aiData.estimate_low || heuristicEst.low || null,
      estimate_high: aiData.estimate_high || heuristicEst.high || null,
      currency: aiData.currency || heuristicEst.currency || null,

      description: aiData.description || null,
      condition_report: aiData.condition_report || null,
      
      provenance_list: Array.isArray(aiData.provenance_list) ? aiData.provenance_list : [],
      exhibitions: Array.isArray(aiData.exhibitions) ? aiData.exhibitions : [],
      literature: Array.isArray(aiData.literature) ? aiData.literature : [],
    };

    console.log(`[Merkurov Parser] Success | Lot: ${final.lot_number} | Time: ${Date.now() - startTime}ms`);
    
    return NextResponse.json(final);

  } catch (error: any) {
    console.error('[Parser Critical Error]:', error);
    return NextResponse.json({
      error: 'Extraction Failed',
      details: error.message
    }, { status: 500 });
  }
}