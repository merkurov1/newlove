import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { parseLotHtml } from '@/lib/lots/parse';
import { supabaseAdmin } from '@/lib/supabaseAdmin'; // Ваша обертка/клиент Supabase

export const runtime = 'nodejs';
export const maxDuration = 120; // 2 минуты на весь цикл

const SYSTEM_PROMPT = `
You are an elite international art curator, auction house expert, and archivist.
Analyze the provided lot data and JSON-LD context to generate an extensive curatorial JSON object.

RULES:
1. Do NOT invent or change the artist name or artwork title if provided in the context.
2. Output ONLY raw valid JSON.

JSON SCHEMA:
{
  "title": "Exact title",
  "artist": "Artist full name",
  "artist_dates": "1960-1988",
  "year": "1984",
  "medium": "Technique and materials",
  "dimensions": "Dimensions",
  "auction_house": "Christie's / Sotheby's / Phillips",
  "lot_number": "Lot number",
  "estimate_low": 100000,
  "estimate_high": 200000,
  "estimate_raw": "HKD 56,000,000 – 76,000,000",
  "currency": "USD/HKD/GBP/EUR",
  "provenance": ["Line 1", "Line 2"],
  "exhibited": ["Item 1"],
  "literature": ["Item 1"],
  "curatorial_essay": "Comprehensive multi-paragraph deep-dive essay.",
  "condition_report": "Summary",
  "tags": ["Tag1", "Tag2"]
}
`;

export async function POST(req: Request) {
  await requireAdminFromRequest(req);
  const { url } = await req.json();

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendLog = async (step: string, message: string, data?: any) => {
    const payload = JSON.stringify({ step, message, data, timestamp: new Date().toISOString() });
    await writer.write(encoder.encode(`data: ${payload}\n\n`));
  };

  // Фоновая асинхронная задача
  (async () => {
    try {
      await sendLog('INIT', `Starting pipeline for URL: ${url}`);

      // ----------------------------------------------------
      // ШАГ 1: Fetch & Scrape
      // ----------------------------------------------------
      await sendLog('SCRAPE', 'Fetching page HTML...');
      const pageRes = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (!pageRes.ok) {
        throw new Error(`Failed to fetch page. HTTP Status: ${pageRes.status}`);
      }

      const html = await pageRes.text();
      await sendLog('SCRAPE', `HTML fetched successfully (${Math.round(html.length / 1024)} KB)`);

      // ----------------------------------------------------
      // ШАГ 2: Structuring & Parsing (JSON-LD + HD Image)
      // ----------------------------------------------------
      await sendLog('PARSER', 'Parsing DOM and JSON-LD metadata...');
      
      let auctionHouse = "Christie's";
      if (url.includes('sothebys.com')) auctionHouse = "Sotheby's";
      if (url.includes('phillips.com')) auctionHouse = "Phillips";

      const parsedData = parseLotHtml(html, url, auctionHouse, { debug: true });

      // Повышаем качество картинки если Christie's / Sotheby's CDN
      let hdImageUrl = parsedData.imageUrl;
      if (hdImageUrl && hdImageUrl.includes('christies.com')) {
        hdImageUrl = hdImageUrl.replace(/width=\d+/, 'width=2000').replace(/maxwidth=\d+/, 'maxwidth=2000');
      }

      await sendLog('PARSER', 'Extracted structured data', {
        title: parsedData.title,
        artist: parsedData.artist,
        imageUrl: hdImageUrl,
        estimate: parsedData.estimate,
      });

      if (!hdImageUrl) {
        await sendLog('WARN', 'High-res image URL not found in JSON-LD or OpenGraph.');
      }

      // ----------------------------------------------------
      // ШАГ 3: AI Enrichment (OpenRouter)
      // ----------------------------------------------------
      await sendLog('AI', 'Sending payload to OpenRouter LLM...');
      const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
      if (!apiKey) throw new Error('OPENROUTER_API_KEY is missing in env vars');

      const openai = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: apiKey,
        defaultHeaders: {
          'HTTP-Referer': 'https://merkurov.love',
          'X-Title': 'Curator Engine',
        },
      });

      const userPrompt = JSON.stringify({
        source_url: url,
        extracted_artist: parsedData.artist,
        extracted_title: parsedData.title,
        extracted_estimate: parsedData.estimate,
        description: parsedData.description,
        page_sample: html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').slice(0, 25000)
      }, null, 2);

      const models = ['google/gemini-flash-1.5', 'openai/gpt-4o-mini', 'meta-llama/llama-3.3-70b-instruct'];
      let aiContent: any = null;

      for (const model of models) {
        try {
          await sendLog('AI', `Trying model: ${model}`);
          const completion = await openai.chat.completions.create({
            model: model,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.2,
          });

          const rawText = completion?.choices[0]?.message?.content;
          if (rawText) {
            const cleanedText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
            aiContent = JSON.parse(cleanedText);
            await sendLog('AI', `Successfully generated by ${model}`);
            break;
          }
        } catch (err: any) {
          await sendLog('WARN', `Model ${model} failed: ${err?.message || err}`);
        }
      }

      if (!aiContent) throw new Error('All AI models failed to enrich lot data');

      // ----------------------------------------------------
      // ШАГ 4: Database UPSERT (Supabase / Postgres)
      // ----------------------------------------------------
      await sendLog('DB', 'Saving lot into database (UPSERT)...');

      const record = {
        artist: parsedData.artist || aiContent.artist || 'Unknown Artist',
        title: parsedData.title || aiContent.title || 'Untitled',
        year: aiContent.year || null,
        medium: aiContent.medium || null,
        dimensions: aiContent.dimensions || null,
        estimate: parsedData.estimate || aiContent.estimate_raw || null,
        estimate_low: aiContent.estimate_low || null,
        estimate_high: aiContent.estimate_high || null,
        currency: aiContent.currency || 'USD',
        auction_house: auctionHouse,
        provenance: JSON.stringify(aiContent.provenance || []),
        source_url: url,
        image_path: hdImageUrl || '',
        ai_content: aiContent,
        status: 'published',
        tags: aiContent.tags || [],
        updated_at: new Date().toISOString()
      };

      // UPSERT по ключу source_url (исключает 23505 Duplicate Key error)
      const { data: dbData, error: dbError } = await supabaseAdmin
        .from('lots')
        .upsert(record, { onConflict: 'source_url' })
        .select()
        .single();

      if (dbError) {
        throw new Error(`DB Error: ${dbError.message} (${dbError.details})`);
      }

      await sendLog('SUCCESS', `Lot successfully saved with ID: ${dbData.id}`, { lot: dbData });

    } catch (err: any) {
      await sendLog('ERROR', err?.message || String(err));
    } finally {
      await writer.close();
    }
  })();

  return new NextResponse(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
