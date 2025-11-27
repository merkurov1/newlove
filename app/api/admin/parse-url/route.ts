import { GoogleGenerativeAI } from ‘@google/generative-ai’;
import { NextResponse } from ‘next/server’;

export const runtime = ‘nodejs’;
export const dynamic = ‘force-dynamic’;

const apiKey = (process.env.GOOGLE_API_KEY || “”).trim();
const genAI = new GoogleGenerativeAI(apiKey);

interface ParsedLot {
artist?: string | null;
title?: string | null;
image_url?: string | null;
medium?: string | null;
dimensions?: string | null;
year?: string | null;
auction_house?: string;
auction_date?: string | null;
sale_id?: string | null;
lot_number?: string | null;
location?: string | null;
estimate_low?: number | null;
estimate_high?: number | null;
currency?: string | null;
description?: string | null;
condition_report?: string | null;
provenance_list?: string[];
exhibitions?: string[];
literature?: string[];
signature?: string | null;
source_url?: string;
}

function cleanJSON(text: string): string {
return text.replace(/^`json\s*/, '').replace(/`\s*$/, ‘’).trim();
}

/**

- Extract all JSON-LD blocks from page
  */
  function extractAllJSONLD(html: string): any[] {
  const results: any[] = [];
  try {
  const matches = html.match(/<script type="application\/ld\+json">([\s\S]*?)</script>/gi);
  if (!matches) return results;
  
  for (const match of matches) {
  const content = match.replace(/<script type="application\/ld\+json">|</script>/gi, ‘’).trim();
  try {
  const data = JSON.parse(content);
  if (data) results.push(data);
  } catch (e) { continue; }
  }
  } catch (e) { }
  return results;
  }

/**

- Extract metadata from HTML meta tags
  */
  function extractMetaTags(html: string): Record<string, string> {
  const meta: Record<string, string> = {};

const patterns = [
{ key: ‘og:title’, regex: /<meta[^>]+property=[”’]og:title[”’][^>]*content=[”’]([^"']+)[”’]/i },
{ key: ‘og:description’, regex: /<meta[^>]+property=[”’]og:description[”’][^>]*content=[”’]([^"']+)[”’]/i },
{ key: ‘og:image’, regex: /<meta[^>]+property=[”’]og:image[”’][^>]*content=[”’]([^"']+)[”’]/i },
{ key: ‘title’, regex: /<title[^>]*>([^<]+)</title>/i },
{ key: ‘description’, regex: /<meta[^>]+name=[”’]description[”’][^>]*content=[”’]([^"']+)[”’]/i },
];

for (const pattern of patterns) {
const match = html.match(pattern.regex);
if (match) meta[pattern.key] = match[1].trim();
}

return meta;
}

/**

- Extract lot number from various sources
  */
  function extractLotNumber(url: string, html: string, markdown: string): string | null {
  // From URL pattern: /lot-title-123/456789
  const urlMatch = url.match(//(\d+)$/);
  if (urlMatch) return urlMatch[1];

// From HTML/Markdown
const patterns = [
/Lot\s+(\d+)/i,
/lot-number[”’]?\s*:?\s*[”’]?(\d+)/i,
/“lotNumber”\s*:\s*”?(\d+)”?/i,
];

for (const pattern of patterns) {
const match = (html + markdown).match(pattern);
if (match) return match[1];
}

return null;
}

/**

- Extract sale/auction ID
  */
  function extractSaleId(url: string, html: string): string | null {
  // From URL: /s/sale-name-here/
  const urlMatch = url.match(//s/([^/]+)//);
  if (urlMatch) return urlMatch[1];

const saleMatch = html.match(/“saleNumber”\s*:\s*”([^”]+)”/i);
if (saleMatch) return saleMatch[1];

return null;
}

/**

- Extract estimate with sophisticated patterns
  */
  function extractEstimate(text: string): { low: number | null; high: number | null; currency: string | null } {
  const result = { low: null as number | null, high: null as number | null, currency: null as string | null };

// Normalize text
text = text.replace(/\n/g, ’ ’).replace(/\s+/g, ’ ’);

// Pattern 1: “GBP 1,000 - GBP 2,000” or “£1,000 - £2,000”
const pattern1 = /(?:Estimate|Est.?|Price|Guide)[:\s]*(GBP|USD|EUR|£|$|€)\s*([\d,]+)\s*[-–—]\s*(?:GBP|USD|EUR|£|$|€)?\s*([\d,]+)/i;
const match1 = text.match(pattern1);

if (match1) {
const cleanNum = (s: string) => parseInt(s.replace(/,/g, ‘’), 10);
result.low = cleanNum(match1[2]);
result.high = cleanNum(match1[3]);
result.currency = normalizeCurrency(match1[1]);
return result;
}

// Pattern 2: “Estimate: 1,000 - 2,000 GBP”
const pattern2 = /(?:Estimate|Est.?)[:\s]*([\d,]+)\s*[-–—]\s*([\d,]+)\s*(GBP|USD|EUR|£|$|€)/i;
const match2 = text.match(pattern2);

if (match2) {
const cleanNum = (s: string) => parseInt(s.replace(/,/g, ‘’), 10);
result.low = cleanNum(match2[1]);
result.high = cleanNum(match2[2]);
result.currency = normalizeCurrency(match2[3]);
return result;
}

// Pattern 3: Currency symbols in text
const pattern3 = /[£$€]\s*([\d,]+)\s*[-–—]\s*[£$€]?\s*([\d,]+)/;
const match3 = text.match(pattern3);

if (match3) {
const cleanNum = (s: string) => parseInt(s.replace(/,/g, ‘’), 10);
result.low = cleanNum(match3[1]);
result.high = cleanNum(match3[2]);
// Detect currency from context
if (text.includes(‘GBP’) || text.includes(‘£’)) result.currency = ‘GBP’;
else if (text.includes(‘USD’) || text.includes(’$’)) result.currency = ‘USD’;
else if (text.includes(‘EUR’) || text.includes(‘€’)) result.currency = ‘EUR’;
return result;
}

return result;
}

function normalizeCurrency(curr: string): string {
const map: Record<string, string> = {
‘£’: ‘GBP’, ‘gbp’: ‘GBP’,
‘$’: ‘USD’, ‘usd’: ‘USD’,
‘€’: ‘EUR’, ‘eur’: ‘EUR’
};
return map[curr.toLowerCase()] || curr.toUpperCase();
}

/**

- Extract dimensions
  */
  function extractDimensions(text: string): string | null {
  const patterns = [
  /(\d+.?\d*\s*[x×]\s*\d+.?\d*(?:\s*[x×]\s*\d+.?\d*)?\s*(?:cm|in|mm))/i,
  /(?:dimensions?|size|measurements?)[:\s]*(\d+.?\d*\s*[x×]\s*\d+.?\d*(?:\s*[x×]\s*\d+.?\d*)?\s*(?:cm|in|mm))/i,
  ];

for (const pattern of patterns) {
const match = text.match(pattern);
if (match) return match[1].trim();
}

return null;
}

/**

- Extract year/date
  */
  function extractYear(text: string): string | null {
  const patterns = [
  /(?:executed|painted|created|dated|made|circa|c.)\s*(?:in\s*)?(\d{4})/i,
  /\b(\d{4})\b/g, // Last resort: any 4-digit year
  ];

for (const pattern of patterns) {
const match = text.match(pattern);
if (match) {
const year = match[1];
// Validate year is reasonable (1400-2100)
if (parseInt(year) >= 1400 && parseInt(year) <= 2100) {
return year;
}
}
}

return null;
}

/**

- Extract provenance as list
  */
  function extractProvenance(text: string): string[] {
  const provList: string[] = [];

// Find “Provenance” section
const provMatch = text.match(/(?:Provenance|PROVENANCE)[:\s]+([\s\S]*?)(?=\n\n|Literature|LITERATURE|Exhibited|EXHIBITED|Condition|$)/i);
if (!provMatch) return provList;

const section = provMatch[1];

// Split by common delimiters
const lines = section.split(/[;\n]/).map(l => l.trim()).filter(l => l.length > 10);

return lines;
}

/**

- Extract exhibitions list
  */
  function extractExhibitions(text: string): string[] {
  const exhList: string[] = [];

const exhMatch = text.match(/(?:Exhibited|EXHIBITED|Exhibition)[:\s]+([\s\S]*?)(?=\n\n|Literature|LITERATURE|Provenance|PROVENANCE|Condition|$)/i);
if (!exhMatch) return exhList;

const section = exhMatch[1];
const lines = section.split(/[;\n]/).map(l => l.trim()).filter(l => l.length > 10);

return lines;
}

/**

- Extract literature references
  */
  function extractLiterature(text: string): string[] {
  const litList: string[] = [];

const litMatch = text.match(/(?:Literature|LITERATURE)[:\s]+([\s\S]*?)(?=\n\n|Exhibited|EXHIBITED|Provenance|PROVENANCE|Condition|$)/i);
if (!litMatch) return litList;

const section = litMatch[1];
const lines = section.split(/[;\n]/).map(l => l.trim()).filter(l => l.length > 10);

return lines;
}

/**

- Extract artist name from title or text
  */
  function extractArtist(title: string, text: string): string | null {
  // Pattern: “Artist Name (1878-1968) - Title”
  const pattern1 = /^([A-Z][a-zA-ZÀ-ÿ\s-’]+?)\s*(/;
  const match1 = title.match(pattern1);
  if (match1) return match1[1].trim();

// Look for artist signature pattern
const pattern2 = /(?:by|artist)[:\s]+([A-Z][a-zA-ZÀ-ÿ\s-’]+?)(?:\s*(|\s*,|\s*$)/i;
const match2 = text.match(pattern2);
if (match2) return match2[1].trim();

return null;
}

/**

- Extract all images from HTML
  */
  function extractImages(html: string): string[] {
  const images: Set<string> = new Set();

// High-res patterns for Christie’s
const patterns = [
/<img[^>]+src=[”’]([^"']*(?:image|img|lot)[^"']*.(?:jpg|jpeg|png|webp)[^"']*)[”’]/gi,
/data-src=[”’]([^"']*.(?:jpg|jpeg|png|webp)[^"']*)[”’]/gi,
/“image”:\s*”([^”]+)”/gi,
/“contentUrl”:\s*”([^”]+)”/gi,
];

for (const pattern of patterns) {
let match;
while ((match = pattern.exec(html)) !== null) {
let url = match[1];
// Skip tiny images, icons, logos
if (url.includes(‘icon’) || url.includes(‘logo’) || url.includes(‘thumb’)) continue;
// Make absolute URL
if (url.startsWith(’//’)) url = ‘https:’ + url;
else if (url.startsWith(’/’)) url = ‘https://www.christies.com’ + url;
images.add(url);
}
}

return Array.from(images).slice(0, 30);
}

/**

- Main parsing function with multiple strategies
  */
  export async function POST(req: Request) {
  try {
  const body = await req.json();
  const url = body.url;
  
  if (!url) return NextResponse.json({ error: ‘No URL provided’ }, { status: 400 });
  
  console.log(`[Christie's Parser] Processing: ${url}`);
  
  // === STAGE 1: FETCH DATA ===
  const headers = {
  ‘User-Agent’: ‘Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36’,
  ‘Accept’: ‘text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8’,
  ‘Accept-Language’: ‘en-US,en;q=0.9’,
  ‘Referer’: ‘https://www.google.com/’,
  };
  
  const [jinaRes, htmlRes] = await Promise.all([
  fetch(`https://r.jina.ai/${encodeURIComponent(url)}`, {
  method: ‘GET’,
  headers: {
  ‘X-Return-Format’: ‘markdown’,
  ‘X-With-Links-Summary’: ‘true’,
  ‘X-With-Images-Summary’: ‘true’,
  …headers,
  },
  cache: ‘no-store’,
  }),
  fetch(url, { headers, cache: ‘no-store’ })
  ]);
  
  const markdown = jinaRes.ok ? await jinaRes.text() : ‘’;
  const html = htmlRes.ok ? await htmlRes.text() : ‘’;
  
  if (!markdown && !html) {
  return NextResponse.json({ error: ‘Failed to fetch content’ }, { status: 422 });
  }
  
  console.log(`[Parser] Fetched: Markdown (${markdown.length} chars), HTML (${html.length} chars)`);
  
  // === STAGE 2: EXTRACT STRUCTURED DATA ===
  const jsonLdBlocks = extractAllJSONLD(html);
  const metaTags = extractMetaTags(html);
  const allImages = extractImages(html);
  
  // Find Product JSON-LD
  const productData = jsonLdBlocks.find(d =>
  [‘Product’, ‘CreativeWork’, ‘VisualArtwork’].includes(d[’@type’])
  );
  
  // === STAGE 3: HEURISTIC EXTRACTION ===
  const fullText = markdown + ’ ’ + (metaTags.title || ‘’) + ’ ’ + (metaTags.description || ‘’);
  
  const heuristics: Partial<ParsedLot> = {
  lot_number: extractLotNumber(url, html, markdown),
  sale_id: extractSaleId(url, html),
  …extractEstimate(fullText),
  dimensions: extractDimensions(fullText),
  year: extractYear(fullText),
  provenance_list: extractProvenance(markdown),
  exhibitions: extractExhibitions(markdown),
  literature: extractLiterature(markdown),
  image_url: metaTags[‘og:image’] || allImages[0] || null,
  };
  
  // Extract artist from title
  if (metaTags.title) {
  const artist = extractArtist(metaTags.title, fullText);
  if (artist) heuristics.artist = artist;
  }
  
  console.log(’[Parser] Heuristics extracted:’, Object.keys(heuristics));
  
  // === STAGE 4: AI ENHANCEMENT ===
  let aiData: Partial<ParsedLot> = {};
  
  try {
  const modelName = process.env.GOOGLE_GEMINI_MODEL || ‘gemini-1.5-flash’;
  const model = genAI.getGenerativeModel({
  model: modelName,
  generationConfig: {
  responseMimeType: “application/json”,
  temperature: 0.1
  }
  });
  
  const prompt = `You are an expert art auction data extractor. Extract ALL available information from this Christie’s auction lot.

STRUCTURED DATA (JSON-LD):
${JSON.stringify(productData, null, 2)}

META TAGS:
${JSON.stringify(metaTags, null, 2)}

ALREADY EXTRACTED (verify/enhance):
${JSON.stringify(heuristics, null, 2)}

FULL PAGE CONTENT:
${markdown.substring(0, 80000)}

EXTRACTION REQUIREMENTS:

1. Artist full name (including life dates if present)
1. Artwork title (exact as listed)
1. Medium/materials (e.g., “oil on canvas”, “gouache and watercolour”)
1. Dimensions (with units)
1. Year/date of execution
1. Signature details (signed, dated, inscribed)
1. Full description (detailed condition and artwork details)
1. Condition report (if available)
1. Provenance (ownership history) as array of strings
1. Exhibition history as array
1. Literature references as array
1. Estimate (low/high) and currency
1. Auction date (when sale occurred or will occur)
1. Location (sale location)

CRITICAL: Extract EVERYTHING mentioned. Be thorough. Use exact text from source.

OUTPUT VALID JSON:
{
“artist”: “string or null”,
“title”: “string or null”,
“medium”: “string or null”,
“dimensions”: “string or null”,
“year”: “string or null”,
“signature”: “string or null”,
“description”: “string or null (comprehensive)”,
“condition_report”: “string or null”,
“estimate_low”: number or null,
“estimate_high”: number or null,
“currency”: “string or null”,
“auction_date”: “string or null”,
“location”: “string or null”,
“provenance_list”: [“string”],
“exhibitions”: [“string”],
“literature”: [“string”]
}`;

```
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  aiData = JSON.parse(cleanJSON(text));
  console.log('[Parser] AI extraction successful');
} catch (e) {
  console.error('[Parser] AI extraction failed:', e);
}

// === STAGE 5: INTELLIGENT MERGE ===
// Priority: AI (most complete) > JSON-LD > Heuristics > Meta Tags
const final: ParsedLot = {
  auction_house: 'Christie\'s',
  source_url: url,
  
  // Core fields
  artist: aiData.artist || productData?.brand?.name || productData?.creator?.name || heuristics.artist || null,
  title: aiData.title || productData?.name || metaTags.title || null,
  
  // Visual
  image_url: aiData.image_url || heuristics.image_url || (Array.isArray(productData?.image) ? productData.image[0] : productData?.image) || allImages[0] || null,
  
  // Physical properties
  medium: aiData.medium || null,
  dimensions: aiData.dimensions || heuristics.dimensions || null,
  year: aiData.year || heuristics.year || null,
  signature: aiData.signature || null,
  
  // Auction details
  lot_number: aiData.lot_number || heuristics.lot_number || productData?.sku || null,
  sale_id: aiData.sale_id || heuristics.sale_id || null,
  auction_date: aiData.auction_date || null,
  location: aiData.location || null,
  
  // Financial
  estimate_low: aiData.estimate_low || heuristics.estimate_low || null,
  estimate_high: aiData.estimate_high || heuristics.estimate_high || null,
  currency: aiData.currency || heuristics.currency || productData?.offers?.priceCurrency || null,
  
  // Descriptive
  description: aiData.description || productData?.description || metaTags.description || null,
  condition_report: aiData.condition_report || null,
  
  // Historical data
  provenance_list: aiData.provenance_list?.length ? aiData.provenance_list : heuristics.provenance_list || [],
  exhibitions: aiData.exhibitions?.length ? aiData.exhibitions : heuristics.exhibitions || [],
  literature: aiData.literature?.length ? aiData.literature : heuristics.literature || [],
};

console.log('[Parser] Final result compiled');
return NextResponse.json(final);
```

} catch (error: any) {
console.error(’[Parser Error]:’, error);
return NextResponse.json({
error: error.message || ‘Internal Server Error’,
stack: process.env.NODE_ENV === ‘development’ ? error.stack : undefined
}, { status: 500 });
}
}