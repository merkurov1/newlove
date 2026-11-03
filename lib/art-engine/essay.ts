import OpenAI from 'openai';
import { assertServerOnly } from '@/lib/serverOnly';
import type {
  NormalizedExtraction,
  WikipediaState,
} from './types';

assertServerOnly('lib/art-engine/essay');

export const ESSAY_PROMPT_VERSION = 'selection-essay-v1';

export interface EssayInput {
  extraction: NormalizedExtraction;
  wikipedia: WikipediaState | null;
  sourceUrl?: string | null;
}

export interface EssayResult {
  essay: string;
  model: string;
  promptVersion: string;
}

export interface EssayClient {
  chat: {
    completions: {
      create: (input: Record<string, unknown>) => Promise<{
        choices?: Array<{ message?: { content?: string | null } }>;
      }>;
    };
  };
}

const SYSTEM_PROMPT = `
You are writing a curatorial essay for Selection, the editorial archive of Anton Merkurov.

Write about this specific artwork, not a generic artist biography. Use only the supplied auction-house data and the supplied Wikipedia extract. The auction-house description is source material, not copy to paraphrase mechanically.

Rules:
- Do not invent provenance, exhibitions, literature, dimensions, dates, quotes, condition, ownership, artistic intentions, or historical facts.
- If the supplied evidence is thin, write a shorter essay (roughly 180–320 words). Do not pad.
- If the evidence supports it, write 3–5 paragraphs and roughly 350–600 words.
- No headings, numbered sections, bullet lists, market analysis, investment thesis, auction results commentary, or "in conclusion".
- Avoid generic AI openings, marketing adjectives, and repeated summaries.
- Keep the existing Selection register: precise, quiet, observant, editorial.
- Distinguish what is visible in the work from what is documented by the source.
- Return plain text only. No markdown fences, no JSON, no title.
`;

function bounded(value: string | null | undefined, max = 8_000): string | null {
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function buildEssayUserPayload(input: EssayInput): string {
  const { extraction, wikipedia } = input;

  return JSON.stringify(
    {
      artwork: {
        artist: extraction.artist,
        artist_dates: extraction.artistDates,
        title: extraction.title,
        year: extraction.year,
        medium: extraction.medium,
        dimensions: extraction.dimensions,
        signature: extraction.signature,
        lot_number: extraction.lotNumber,
        auction_house: extraction.auctionHouse,
        auction_date: extraction.auctionDate,
        estimate: extraction.estimate?.raw || null,
        currency: extraction.currency,
        description: bounded(extraction.description),
        lot_essay: bounded(extraction.lotEssay),
        catalogue_note: bounded(extraction.catalogueNote),
        condition_report: bounded(extraction.conditionReport),
        condition_report_status: extraction.conditionReportStatus,
        provenance: extraction.provenance,
        exhibitions: extraction.exhibitions,
        literature: extraction.literature,
      },
      artist_context: wikipedia?.status === 'found'
        ? {
            source: 'Wikipedia',
            title: wikipedia.title,
            url: wikipedia.url,
            extract: bounded(wikipedia.extract),
          }
        : null,
      source_url: input.sourceUrl || null,
    },
    null,
    2,
  );
}

export function sanitizeEssay(value: string): string {
  return value
    .replace(/```(?:text|markdown)?/gi, '')
    .replace(/```/g, '')
    .replace(/^\s*#{1,6}\s+.*$/gm, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function generateCuratorialEssay(
  input: EssayInput,
  options: {
    client?: EssayClient;
    model?: string;
  } = {},
): Promise<EssayResult> {
  const apiKey = (process.env.DEEPSEEK_API_KEY || '').trim();
  if (!apiKey && !options.client) {
    throw new Error('DEEPSEEK_API_KEY is missing.');
  }

  const model =
    options.model || process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const client =
    options.client ||
    (new OpenAI({
      apiKey,
      baseURL: (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(
        /\/+$/,
        '',
      ),
      timeout: 55_000,
      maxRetries: 0,
    }) as unknown as EssayClient);

  const userPrompt = `Write the Selection essay for this work.\n\n${buildEssayUserPayload(input)}`;

  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.35,
      max_tokens: 1_200,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || '';
    const essay = sanitizeEssay(raw);

    if (!essay) {
      throw new Error('The essay model returned an empty response.');
    }

    return {
      essay,
      model,
      promptVersion: ESSAY_PROMPT_VERSION,
    };
  } catch (deepseekError) {
    // Tests inject a client and assert its failure directly.
    if (options.client) throw deepseekError;

    const { generateGeminiText } = await import('@/lib/ai/gemini');

    try {
      const fallback = await generateGeminiText({
        system: SYSTEM_PROMPT,
        prompt: userPrompt,
        temperature: 0.35,
        maxOutputTokens: 1_200,
        timeoutMs: 55_000,
      });

      const essay = sanitizeEssay(fallback.content);

      if (!essay) {
        throw new Error('The fallback essay model returned an empty response.');
      }

      return {
        essay,
        model: fallback.model,
        promptVersion: ESSAY_PROMPT_VERSION,
      };
    } catch (geminiError) {
      const deepseekMessage =
        deepseekError instanceof Error
          ? deepseekError.message
          : String(deepseekError);
      const geminiMessage =
        geminiError instanceof Error
          ? geminiError.message
          : String(geminiError);

      throw new Error(
        `Essay generation failed. DeepSeek: ${deepseekMessage}. Gemini fallback: ${geminiMessage}`,
      );
    }
  }
}
