import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

interface JsonLdProduct {
  '@type'?: string;
  name?: string;
  description?: string;
  image?: string | string[];
  brand?: { name?: string };
  creator?: { name?: string };
  sku?: string;
  offers?: { priceCurrency?: string; lowPrice?: number; highPrice?: number };
}

// --- UTILS ---

function cleanJSON(text: string): string {
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

// --- JSON-LD EXTRACTION (Critical for Christie's) ---
function extractJsonLd(html: string): JsonLdProduct | null {
  try {
    const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        // Find Product or VisualArtwork
        if (data['@type'] === 'Product' || data['@type'] === 'VisualArtwork') {
          return data;
        }
        // Check @graph array
        if (Array.isArray(data['@graph'])) {
          const product = data['@graph'].find((item: any) => 
            item['@type'] === 'Product' || item['@type'] === 'VisualArtwork'
          );
          if (product) return product;
        }
      } catch { continue; }
    }
  } catch { }
  return null;
}

// --- EXTRACTORS (HEURISTICS) ---

function extractLotNumber(url: string, content: string): string | null {
  // URL patterns (most reliable)
  const urlPatterns = [
    /\/lot-.*?-(\d+)\/?$/,
    /\/lot\/(\d+)/,
    /lotid[=\/](\d+)/i,
    /\/(\d{5,})$/ // 5+ digit lot IDs
  ];
  for (const pattern of urlPatterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  // Text patterns
  const textPatterns = [
    /Lot\s+(\d+)/i,
    /"lotNumber":\s*"?(\d+)"?/i,
    /Lot (\d+) of/i
  ];
  for (const pattern of textPatterns) {
    const match = content.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function extractSaleId(url: string, content: string): string | null {
  // URL: /s/sale-name-here/ or /sale/12345
  const urlMatch = url.match(/\/s\/([^\/]+)\//) || url.match(/\/sale\/(\d+)/);
  if (urlMatch) return urlMatch[1];
  
  // JSON patterns
  const jsonMatch = content.match(/"saleNumber":\s*"([^"]+)"/i);
  if (jsonMatch) return jsonMatch[1];
  
  return null;
}

function extractSignature(content: string): string | null {
  const patterns = [
    /signed\s+['"]?([^'".,\n]+)['"]?/i,
    /inscribed\s+['"]?([^'".,\n]+)['"]?/i,
    /bearing\s+signature/i
  ];
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) return match[0].substring(0, 200); // Limit length
  }
  return null;
}

function extractEstimate(text: string): { low: number | null; high: number | null; currency: string | null } {
  const result = { low: null as number | null, high: null as number | null, currency: null as string | null };
  const cleanText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ');

  // Comprehensive patterns for all major auction formats
  const patterns = [
    // "GBP 10,000 – GBP 20,000" or "£10,000 - £20,000"
    /(GBP|USD|EUR|CHF|HKD|£|\$|€)\s*([\d,]+)\s*[-–—]\s*(?:GBP|USD|EUR|CHF|HKD|£|\$|€)?\s*([\d,]+)/i,
    // "Estimate: 10,000 - 20,000 GBP"
    /(?:Estimate|Est\.?)[^:]*?:\s*([\d,]+)\s*[-–—]\s*([\d,]+)\s*(GBP|USD|EUR|CHF|HKD)/i,
    // "10,000-20,000 USD"
    /([\d,]+)\s*[-–—]\s*([\d,]+)\s*(GBP|USD|EUR|CHF|HKD)/i,
  ];

  for (const pattern of patterns) {
    const match = cleanText.match(pattern);
    if (match) {
      // Detect which group has what
      if (match[1] && /^[£$€]|GBP|USD|EUR|CHF|HKD/i.test(match[1])) {
        result.currency = normalizeCurrency(match[1]);
        result.low = parseInt(match[2].replace(/,/g, ''), 10);
        result.high = parseInt(match[3].replace(/,/g, ''), 10);
      } else {
        result.low = parseInt(match[1].replace(/,/g, ''), 10);
        result.high = parseInt(match[2].replace(/,/g, ''), 10);
        if (match[3]) result.currency = normalizeCurrency(match[3]);
      }
      
      // Validate numbers are reasonable (>100, <1B)
      if (result.low && result.high && result.low > 100 && result.high < 1000000000) {
        return result;
      }
    }
  }
  return result;
}

function extractImages(html: string, markdown: string): string[] {
  const images: Set<string> = new Set();

  // 1. JSON-LD images (highest quality)
  const jsonLdMatch = html.match(/"image":\s*\[?"([^"]+)"?\]/);
  if (jsonLdMatch) {
    const url = jsonLdMatch[1].startsWith('//') ? 'https:' + jsonLdMatch[1] : jsonLdMatch[1];
    if (url.includes('christies.com')) images.add(url);
  }

  // 2. OG Image (reliable fallback)
  const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  if (ogMatch) images.add(ogMatch[1]);

  // 3. Christie's specific high-res patterns
  const htmlPatterns = [
    /data-zoom-image=["']([^"']+)["']/gi,
    /data-fullscreen-src=["']([^"']+)["']/gi,
    /class="[^"]*lot-image[^"]*"[^>]*src=["']([^"']+)["']/gi,
    /"contentUrl":\s*"([^"]+)"/gi,
  ];

  for (const pattern of htmlPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      let url = match[1];
      if (url.startsWith('//')) url = 'https:' + url;
      if (!url.includes('icon') && !url.includes('logo') && !url.includes('thumb')) {
        images.add(url);
      }
    }
  }

  // 4. Markdown Images (Jina extraction)
  const mdRegex = /!\[.*?\]\((https?:\/\/[^)]+)\)/g;
  let mdMatch;
  while ((mdMatch = mdRegex.exec(markdown)) !== null) {
    if (!mdMatch[1].includes('icon') && !mdMatch[1].includes('logo')) {
      images.add(mdMatch[1]);
    }
  }

  return Array.from(images).slice(0, 10);
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
    const fullText = (markdown + "\n" + html).slice(0, 90000);
    const images = extractImages(html, markdown);
    const jsonLd = extractJsonLd(html);
    
    // Quick Heuristics for fallback/validation
    const heuristicEst = extractEstimate(fullText);
    const heuristicLot = extractLotNumber(url, fullText);
    const heuristicSaleId = extractSaleId(url, fullText);
    const heuristicSignature = extractSignature(fullText);

    // === STAGE 3: GEMINI EXTRACTION ===
    const model = genAI.getGenerativeModel({
      model: process.env.GOOGLE_GEMINI_MODEL || 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.0,
      }
    });

    const prompt = `You are an expert art auction data extractor. Extract ALL information from this Christie's lot page.

URL: ${url}
${jsonLd ? `JSON-LD DATA: ${JSON.stringify(jsonLd)}` : ''}

PAGE CONTENT:
${fullText.slice(0, 80000)}

Extract this JSON structure (use null for missing fields, arrays for lists):
{
  "artist": "Full name (Firstname Lastname)",
  "title": "Exact artwork title",
  "medium": "Materials/technique",
  "year": "Year created (YYYY or circa YYYY)",
  "dimensions": "Size with units",
  "lot_number": "Lot number",
  "sale_id": "Sale identifier",
  "estimate_low": number,
  "estimate_high": number,
  "currency": "ISO code (GBP/USD/EUR)",
  "auction_date": "Date of sale",
  "location": "Auction location",
  "signature": "Signature details if mentioned",
  "description": "Physical description of artwork",
  "condition_report": "Condition details if available",
  "provenance_list": ["Previous owner 1", "Previous owner 2"],
  "exhibitions": ["Exhibition 1", "Exhibition 2"],
  "literature": ["Publication 1", "Publication 2"]
}

Be thorough. Extract EVERYTHING mentioned.`;

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
    // Priority: AI > JSON-LD > Heuristics
    const final: ParsedLot = {
      auction_house: "Christie's",
      source_url: url,
      
      artist: aiData.artist || jsonLd?.creator?.name || jsonLd?.brand?.name || null,
      title: aiData.title || jsonLd?.name || null,
      
      image_url: images.length > 0 ? images[0] : (Array.isArray(jsonLd?.image) ? jsonLd.image[0] : jsonLd?.image) || null,

      medium: aiData.medium || null,
      dimensions: aiData.dimensions || null,
      year: aiData.year || null,
      signature: aiData.signature || heuristicSignature || null,

      lot_number: aiData.lot_number || heuristicLot || jsonLd?.sku || null,
      sale_id: aiData.sale_id || heuristicSaleId || null,
      location: aiData.location || null,
      auction_date: aiData.auction_date || null,

      estimate_low: aiData.estimate_low || heuristicEst.low || jsonLd?.offers?.lowPrice || null,
      estimate_high: aiData.estimate_high || heuristicEst.high || jsonLd?.offers?.highPrice || null,
      currency: aiData.currency || heuristicEst.currency || jsonLd?.offers?.priceCurrency || null,

      description: aiData.description || jsonLd?.description || null,
      condition_report: aiData.condition_report || null,
      
      provenance_list: Array.isArray(aiData.provenance_list) ? aiData.provenance_list : [],
      exhibitions: Array.isArray(aiData.exhibitions) ? aiData.exhibitions : [],
      literature: Array.isArray(aiData.literature) ? aiData.literature : [],
    };

    console.log(`[Merkurov Parser] Success | Lot: ${final.lot_number} | AI: ${aiUsed} | Time: ${Date.now() - startTime}ms`);
    
    return NextResponse.json(final);

  } catch (error: any) {
    console.error('[Parser Critical Error]:', error);
    return NextResponse.json({
      error: 'Extraction Failed',
      details: error.message
    }, { status: 500 });
  }
}