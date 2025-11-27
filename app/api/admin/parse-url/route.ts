import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs'; // Node runtime required for heavier processing
export const dynamic = 'force-dynamic';

const apiKey = (process.env.GOOGLE_API_KEY || "").trim();
const genAI = new GoogleGenerativeAI(apiKey);

function cleanJSON(text: string) {
  return text.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
}

/**
 * BUREAUCRATIC MAGIC: Extract structured data intended for Search Engines.
 * Christie's Online Only pages always have this for SEO.
 */
function extractJSONLD(html: string) {
  try {
    const matches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
    if (!matches) return null;
    
    // Often there are multiple blocks (Breadcrumb, Product, Organization). We want 'Product' or 'CreativeWork'.
    for (const match of matches) {
      const content = match.replace(/<script type="application\/ld\+json">|<\/script>/gi, '').trim();
      try {
        const data = JSON.parse(content);
        const type = Array.isArray(data) ? data[0]?.['@type'] : data['@type'];
        
        // Target specific schemas
        if (['Product', 'CreativeWork', 'VisualArtwork'].includes(type)) {
            return {
                title: data.name || data.headline,
                image: data.image,
                description: data.description,
                sku: data.sku, // Often the Lot Number
                offers: data.offers // Contains price/currency
            };
        }
      } catch (e) { continue; }
    }
  } catch (e) { return null; }
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const url = body.url;

    if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 });

    console.log(`[Parser] Target: ${url}`);

    // 1. THE HARVESTER (Jina AI)
    // Using 'r.jina.ai' is good, but we need to ensure we get the content.
    // Christie's blocks generic bots. We mimic a standard browser.
    const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
    
    // PARALLEL EXECUTION: Fetch Jina (Markdown) AND Raw HTML (for JSON-LD)
    const [jinaRes, htmlRes] = await Promise.all([
        fetch(jinaUrl, {
            method: 'GET',
            headers: {
                'X-Return-Format': 'markdown',
                'X-With-Links-Summary': 'true', 
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            cache: 'no-store',
        }),
        fetch(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            }, 
            cache: 'no-store' 
        })
    ]);

    const markdown = jinaRes.ok ? await jinaRes.text() : '';
    const html = htmlRes.ok ? await htmlRes.text() : '';

    // 2. EXTRACT METADATA LAYERS
    const jsonLd = extractJSONLD(html);
    
    // Fallback: Check for Title/OG Image in HTML if Jina failed or JSON-LD missing
    const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    const ogImage = ogImageMatch ? ogImageMatch[1] : (jsonLd?.image || null);
    
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].trim() : null;

    // Image Candidates for AI to choose from if main one is missing
    const imgMatches = Array.from(html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)).map(m => m[1]);
    const imageCandidates = Array.from(new Set([...(ogImage ? [ogImage] : []), ...imgMatches].filter(Boolean))).slice(0, 20);

    // --- Heuristics (Regex) ---
    // (Kept your existing logic, it's solid for non-SPA pages)
    function extractHeuristics(text: string) {
      const heur: any = {}
      
      // Estimate (Improved regex for "GBP 1,000 - GBP 2,000")
      const estimateRe = /(?:Estimate|Est\.?|Guide Price)[\s\S]{0,20}?([£$€USDGBP]{1,3})\s?([\d,]+)(?:\s*[-–to]\s*([£$€USDGBP]{1,3})?\s?([\d,]+))?/i
      const estM = text.match(estimateRe)
      
      if (estM) {
        const cleanNum = (s: string) => Number(s.replace(/[^0-9.]/g, '')) || null
        heur.estimate_low = cleanNum(estM[2])
        heur.estimate_high = cleanNum(estM[4])
        heur.currency = estM[1] // Basic currency detection
      }

      // Year
      const yearRe = /(?:executed|painted|created|dated|circa|c\.)\s*(\d{4})/i
      const yM = text.match(yearRe)
      if (yM) heur.year = yM[1]
      
      return heur;
    }

    const heuristicData = extractHeuristics(markdown + " " + (pageTitle || ""));

    // === SAFETY CHECK ===
    if (!markdown && !jsonLd) {
        return NextResponse.json({ error: 'Content blocked or empty', url }, { status: 422 });
    }

    console.log(`[Parser] Data Check: Markdown (${markdown.length} chars), JSON-LD (${!!jsonLd})`);

    // 3. THE BRAIN (Gemini)
    const modelName = process.env.GOOGLE_GEMINI_MODEL || 'gemini-1.5-flash';
    const generationConfig = { 
        responseMimeType: "application/json", 
        temperature: 0.1
    };

    // MERGE CONTEXT FOR AI
    // We give AI the JSON-LD as a "Cheat Sheet" so it doesn't hallucinate.
    const prompt = `
      ROLE: Expert Art Market Analyst & Data Extractor.
      TASK: Extract structured data from the auction lot.
      
      CRITICAL INPUTS (TRUST THESE):
      - JSON-LD Data (Official): ${JSON.stringify(jsonLd)}
      - Page Title: ${pageTitle}
      - Detected Images: ${JSON.stringify(imageCandidates)}

      RAW CONTENT (Markdwon):
      ${markdown.substring(0, 50000)}

      INSTRUCTIONS:
      1. Prefer JSON-LD data for Title, Artist, and Description if available.
      2. Extract "provenance_list" (history of ownership) as an array of strings.
      3. Extract "literature" and "exhibitions" if present in the text.
      4. For "medium" (Materials), look for terms like "Oil on canvas", "Gouache", "Bronze".
      5. "estimate_low" and "high" must be numbers. 
      6. If "lot_number" is missing in text, try to find it in the URL or Title (e.g. "216").
      
      REQUIRED JSON OUTPUT:
      {
        "artist": "string | null",
        "title": "string | null",
        "image_url": "string | null",
        "medium": "string | null",
        "dimensions": "string | null",
        "year": "string | null",
        
        "auction_house": "Christie's", 
        "auction_date": "string | null",
        "sale_id": "string | null",
        "lot_number": "string | null",
        "location": "string | null",

        "estimate_low": "number | null",
        "estimate_high": "number | null",
        "currency": "string | null",
        
        "description": "string | null",
        "condition_report": "string | null",
        "provenance_list": "string[]",
        "exhibitions": "string[]",
        "literature": "string[]"
      }
    `;

    let finalJSON: any = {};
    
    try {
        const model = genAI.getGenerativeModel({ model: modelName, generationConfig });
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        finalJSON = JSON.parse(cleanJSON(text));
    } catch (e) {
        console.error("[Parser] AI Failed, falling back to heuristics");
        finalJSON = {};
    }

    // 4. MERGE & POLISH
    // Order of precedence: AI > JSON-LD > Heuristics
    const merged = {
        ...heuristicData,
        ...jsonLd, // JSON-LD usually has cleaner Title/Artist
        ...finalJSON,
        source_url: url
    };

    // Force Image Selection logic if AI failed to pick one
    if (!merged.image_url && jsonLd?.image) {
        merged.image_url = Array.isArray(jsonLd.image) ? jsonLd.image[0] : jsonLd.image;
    }
    if (!merged.image_url && ogImage) {
        merged.image_url = ogImage;
    }

    return NextResponse.json(merged);

  } catch (error: any) {
    console.error('[Parser Error]:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}