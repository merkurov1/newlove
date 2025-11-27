import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';
import { JSDOM } from 'jsdom';

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
  if (!curr) return 'USD';
  const map: Record<string, string> = {
    '£': 'GBP', 'gbp': 'GBP',
    '$': 'USD', 'usd': 'USD',
    '€': 'EUR', 'eur': 'EUR',
    'chf': 'CHF', 'hkd': 'HKD'
  };
  return map[curr.toLowerCase()] || curr.toUpperCase();
}

// --- EXTRACTORS (REGEX FALLBACK) ---

function extractJsonLdRegex(html: string): any | null {
  try {
    const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        if (data['@type'] === 'Product' || data['@type'] === 'VisualArtwork') return data;
        if (Array.isArray(data['@graph'])) {
          const product = data['@graph'].find((item: any) => 
            item['@type'] === 'Product' || item['@type'] === 'VisualArtwork'
          );
          if (product) return product;
        }
        if (Array.isArray(data)) {
           const product = data.find((item: any) => 
            item['@type'] === 'Product' || item['@type'] === 'VisualArtwork'
          );
          if (product) return product;
        }
      } catch { continue; }
    }
  } catch { }
  return null;
}

function extractImagesRegex(html: string, markdown: string): string[] {
  const images: Set<string> = new Set();
  
  // Regex for HTML
  const htmlPatterns = [
    /data-zoom-image=["']([^"']+)["']/gi,
    /data-fullscreen-src=["']([^"']+)["']/gi,
    /class="[^"]*lot-image[^"]*"[^>]*src=["']([^"']+)["']/gi,
    /"contentUrl":\s*"([^"]+)"/gi,
    /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i
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

  // Regex for Markdown
  const mdRegex = /!\[.*?\]\((https?:\/\/[^)]+)\)/g;
  let mdMatch;
  while ((mdMatch = mdRegex.exec(markdown)) !== null) {
    if (!mdMatch[1].includes('icon') && !mdMatch[1].includes('logo')) {
      images.add(mdMatch[1]);
    }
  }

  return Array.from(images).slice(0, 10);
}

// --- EXTRACTORS (JSDOM) ---

function extractJsonLd(dom: JSDOM): any | null {
  try {
    const scripts = dom.window.document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent || '{}');
        
        // Check for Product or VisualArtwork
        if (data['@type'] === 'Product' || data['@type'] === 'VisualArtwork') return data;
        
        // Check graph
        if (Array.isArray(data['@graph'])) {
          const product = data['@graph'].find((item: any) => 
            item['@type'] === 'Product' || item['@type'] === 'VisualArtwork'
          );
          if (product) return product;
        }
        
        // Check array root
        if (Array.isArray(data)) {
           const product = data.find((item: any) => 
            item['@type'] === 'Product' || item['@type'] === 'VisualArtwork'
          );
          if (product) return product;
        }
      } catch (e) { continue; }
    }
  } catch (e) { console.error("JSON-LD Error:", e); }
  return null;
}

function extractImages(dom: JSDOM, markdown: string): string[] {
  const images: Set<string> = new Set();
  const doc = dom.window.document;

  // 1. JSON-LD (via regex on HTML string to be safe, or we could use the extracted object)
  // We'll rely on the main flow for JSON-LD object, here we look for meta tags and DOM elements

  // 2. Open Graph
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
  if (ogImage) images.add(ogImage);

  // 3. Christie's Specific
  const zoomImages = doc.querySelectorAll('[data-zoom-image]');
  zoomImages.forEach(el => {
    const src = el.getAttribute('data-zoom-image');
    if (src) images.add(src.startsWith('//') ? 'https:' + src : src);
  });

  const lotImages = doc.querySelectorAll('.lot-image, .image-gallery-image');
  lotImages.forEach(el => {
    const src = el.getAttribute('src') || el.getAttribute('data-src');
    if (src) images.add(src.startsWith('//') ? 'https:' + src : src);
  });

  // 4. Markdown Images (Jina)
  const mdRegex = /!\[.*?\]\((https?:\/\/[^)]+)\)/g;
  let mdMatch;
  while ((mdMatch = mdRegex.exec(markdown)) !== null) {
    if (!mdMatch[1].includes('icon') && !mdMatch[1].includes('logo')) {
      images.add(mdMatch[1]);
    }
  }

  return Array.from(images).slice(0, 10);
}

function extractTextContent(dom: JSDOM): string {
  const doc = dom.window.document;
  
  // Remove scripts, styles, nav, footer to reduce noise
  const toRemove = doc.querySelectorAll('script, style, nav, footer, header, .cookie-banner, .newsletter-signup');
  toRemove.forEach(el => el.remove());

  // Get text from specific content areas if possible
  const contentArea = doc.querySelector('main') || doc.querySelector('#main-content') || doc.body;
  return contentArea.textContent?.replace(/\s+/g, ' ').trim().slice(0, 50000) || "";
}

// --- MAIN HANDLER ---

export async function POST(req: Request) {
  const startTime = Date.now();
  let aiUsed = false;
  let debugLog: string[] = [];

  try {
    const body = await req.json();
    const url = body.url;

    if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 });

    debugLog.push(`Fetching URL: ${url}`);

    // === STAGE 1: ROBUST FETCHING ===
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    };

    // Clean URL for Jina (remove query params that might confuse it)
    const cleanUrl = url.split('?')[0];

    // Parallel fetch with error suppression (Promise.allSettled)
    const [jinaResult, rawResult] = await Promise.allSettled([
      fetch(`https://r.jina.ai/${encodeURIComponent(cleanUrl)}`, {
        headers: { 'X-Return-Format': 'markdown', 'X-With-Images-Summary': 'true', ...headers }
      }),
      fetch(url, { headers })
    ]);    const markdown = jinaResult.status === 'fulfilled' && jinaResult.value.ok ? await jinaResult.value.text() : '';
    const html = rawResult.status === 'fulfilled' && rawResult.value.ok ? await rawResult.value.text() : '';

    debugLog.push(`Jina Status: ${jinaResult.status}, Length: ${markdown.length}`);
    debugLog.push(`Direct Fetch Status: ${rawResult.status}, Length: ${html.length}`);

    if (!markdown && !html) {
      console.error("Blocked: Failed to retrieve content from both sources.");
      // Don't throw immediately, try to return what we can or a specific error
      throw new Error("Content Retrieval Failed: Both Jina and Direct fetch returned empty results. The site might be blocking requests.");
    }

    // === STAGE 2: PARSING ===
    let dom: JSDOM | null = null;
    let jsonLd: any = null;
    let images: string[] = [];
    let cleanText = "";

    // Try JSDOM first
    try {
      debugLog.push("Attempting JSDOM parsing...");
      dom = new JSDOM(html || `<html><body>${markdown}</body></html>`);
      jsonLd = extractJsonLd(dom);
      images = extractImages(dom, markdown);
      cleanText = extractTextContent(dom);
      debugLog.push("JSDOM parsing successful.");
    } catch (e: any) {
      console.error("JSDOM Failed:", e);
      debugLog.push(`JSDOM Failed: ${e.message}. Falling back to Regex.`);
      
      // Fallback to Regex
      jsonLd = extractJsonLdRegex(html);
      images = extractImagesRegex(html, markdown);
      cleanText = (markdown + "\n" + html).replace(/<[^>]*>/g, ' ').slice(0, 50000);
    }
    
    debugLog.push(`JSON-LD Found: ${!!jsonLd}`);
    debugLog.push(`Images Found: ${images.length}`);
    debugLog.push(`Clean Text Length: ${cleanText.length}`);

    // === STAGE 3: AI EXTRACTION ===
    // We feed the AI the JSON-LD (if any) and the Clean Text + Markdown
    // This gives it structured data + unstructured context
    
    const model = genAI.getGenerativeModel({
      model: process.env.GOOGLE_GEMINI_MODEL || 'gemini-1.5-flash',
      generationConfig: { responseMimeType: "application/json", temperature: 0.0 }
    });

    // Truncate content to avoid token limits (Gemini Flash has large context but let's be safe)
    const safeCleanText = cleanText.slice(0, 30000);
    const safeMarkdown = markdown.slice(0, 30000);

    const prompt = `You are an expert art auction data extractor. Extract ALL information from this Christie's lot page.
    
    URL: ${url}
    
    ${jsonLd ? `STRUCTURED DATA (JSON-LD): ${JSON.stringify(jsonLd)}` : ''}
    
    PAGE TEXT CONTENT:
    ${safeCleanText}
    
    MARKDOWN CONTENT (Jina):
    ${safeMarkdown}
    
    Extract this JSON structure (use null for missing fields):
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
      "auction_date": "Date of sale (YYYY-MM-DD if possible)",
      "location": "Auction location",
      "signature": "Signature details",
      "description": "Physical description/essay",
      "condition_report": "Condition details",
      "provenance_list": ["Owner 1", "Owner 2"],
      "exhibitions": ["Exhibition 1"],
      "literature": ["Book 1"]
    }`;

    let aiData: any = {};
    let aiRawText: string | null = null;
    // Skip AI if API key missing
    if (!apiKey) {
      debugLog.push('Skipping AI: GOOGLE_API_KEY not set');
    } else {
      try {
        const result = await model.generateContent(prompt);
        // result.response.text() may include code fences or extra text
        let text: string;
        try {
          // support both sync and async text() shapes
          const maybe = result.response?.text();
          text = typeof maybe === 'string' ? maybe : await maybe;
          aiRawText = text;
        } catch (e) {
          // Fallback: if SDK shape differs, try toString
          text = String(result?.response ?? result);
          aiRawText = text;
        }

        debugLog.push(`AI raw length: ${String(text?.length || 0)}`);

        // Try clean parse first
        try {
          aiData = JSON.parse(cleanJSON(text));
          aiUsed = true;
        } catch (parseErr) {
          // Attempt to extract first JSON object substring
          const jsonMatch = text.match(/\{[\s\S]*\}/m);
          if (jsonMatch) {
            try {
              aiData = JSON.parse(cleanJSON(jsonMatch[0]));
              aiUsed = true;
            } catch (e2) {
              debugLog.push('AI JSON extraction failed');
              console.error('[Parser] AI JSON extraction failed', e2);
            }
          } else {
            debugLog.push('AI returned non-JSON text');
          }
        }
      } catch (e: any) {
        console.error('[Parser] AI Failure', e);
        debugLog.push(`AI Error: ${e?.message || String(e)}`);
      }
    }

    // === STAGE 4: MERGE ===
    // Heuristics for Lot Number if AI/JSON-LD failed
    let lotNumber = aiData.lot_number || jsonLd?.sku || null;
    if (!lotNumber) {
      const urlMatch = url.match(/\/(\d{5,})(\?|$)/); // Match 5+ digits at end of URL (ignoring query params)
      if (urlMatch) lotNumber = urlMatch[1];
    }

    const final: ParsedLot = {
      auction_house: "Christie's",
      source_url: url,
      
      artist: aiData.artist || jsonLd?.creator?.name || jsonLd?.brand?.name || null,
      title: aiData.title || jsonLd?.name || null,
      image_url: images[0] || (Array.isArray(jsonLd?.image) ? jsonLd.image[0] : jsonLd?.image) || null,
      
      medium: aiData.medium || null,
      dimensions: aiData.dimensions || null,
      year: aiData.year || null,
      signature: aiData.signature || null,
      
      lot_number: lotNumber,
      sale_id: aiData.sale_id || null,
      location: aiData.location || null,
      auction_date: aiData.auction_date || null,
      
      estimate_low: aiData.estimate_low || jsonLd?.offers?.lowPrice || null,
      estimate_high: aiData.estimate_high || jsonLd?.offers?.highPrice || null,
      currency: normalizeCurrency(aiData.currency || jsonLd?.offers?.priceCurrency),
      
      description: aiData.description || jsonLd?.description || null,
      condition_report: aiData.condition_report || null,
      
      provenance_list: Array.isArray(aiData.provenance_list) ? aiData.provenance_list : [],
      exhibitions: Array.isArray(aiData.exhibitions) ? aiData.exhibitions : [],
      literature: Array.isArray(aiData.literature) ? aiData.literature : [],
    };

    console.log(`[Parser] Success | Lot: ${final.lot_number} | AI: ${aiUsed}`);
    
    const responseBody: any = { ...final, _debug: debugLog };
    // If caller requested debug, include short raw snippets to help debugging
    if (body?.debug) {
      responseBody._raw = {
        html_snippet: (html || '').slice(0, 8000),
        markdown_snippet: (markdown || '').slice(0, 8000),
        ai_raw: aiRawText ? aiRawText.slice(0, 8000) : null
      };
    }

    return NextResponse.json(responseBody);

  } catch (error: any) {
    console.error('[Parser Critical Error]:', error);
    return NextResponse.json({
      error: 'Extraction Failed',
      details: error.message,
      _debug: debugLog
    }, { status: 500 });
  }
}