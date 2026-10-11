import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

export type FlowAIItem = {
  id: string;
  type: string;
  title: string | null;
  body_md: string | null;
  source_url: string | null;
  metadata: Record<string, unknown> | null;
  lang: string;
};

export type FlowAIResult = {
  content: string;
  model: string;
  provider: string;
};

function cleanText(value: unknown, max = 8000): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function buildEnhancedAnalysisPrompt(item: FlowAIItem): string {
  const metadata = item.metadata ?? {};
  const description = cleanText(metadata.description);
  const siteName = cleanText(metadata.site_name, 300);
  const author = cleanText(metadata.author, 300);

  const sections: string[] = [
    `TYPE: ${item.type}`,
    `LANGUAGE: ${item.lang || 'ru'}`,
    `TITLE: ${cleanText(item.title, 500)}`,
    `BODY: ${cleanText(item.body_md)}`,
    `SOURCE URL: ${cleanText(item.source_url, 1000)}`,
  ];

  if (description) sections.push(`SOURCE DESCRIPTION: ${description}`);
  if (siteName) sections.push(`SOURCE SITE: ${siteName}`);
  if (author) sections.push(`SOURCE AUTHOR: ${author}`);

  if (item.type === 'photo') {
    sections.push(
      'IMAGE NOTE: The visual artifact itself is an anchor for reflection. Build context from the title, concept, and metadata without fabricating visual details.',
    );
  }

  const isRu = (item.lang || 'ru').toLowerCase().startsWith('ru');

  return `ROLE & ARCHITECTURE:
You are the deep analytical context engine of Merkurov Flow (merkurov.love) — the intersection of High-Tech, Old Money, Art, and Context Architecture.

OBJECT TO ANALYZE:
${sections.join('\n')}

MISSION:
Produce a profound, intellectual editorial analysis (Context) for this item.

ANALYTICAL DIMENSIONS:
1. Subtext & Structural Tension: What is the underlying shift, paradox, or non-obvious question opened up by this artifact?
2. Context Architecture: How does this connect to broader historical, technological, cultural, or financial landscapes?
3. Strategic Insight: What does this signify for human agency, digital permanence, or cultural capital?

STRICT EDITORIAL RULES:
- This is NOT a summary. Never retell what the item already states.
- Be concise, dense, and piercing. 2–3 paragraphs of high-signal thought (140–280 words).
- Zero robotic filler, zero academic fluff, zero clichés (e.g. "в современном мире", "является важным", "стоит отметить").
- Do not mention that you are an AI or language model.
- Write in ${isRu ? 'Russian (русский язык, элегантный, точный авторский слог)' : 'English (discerning, intellectual, sharp)'}.
- Return clean plain text only (paragraphs separated by blank lines).`;
}

// 1. Direct DeepSeek API Call
async function callDeepSeekDirect(prompt: string): Promise<FlowAIResult> {
  const apiKey = (process.env.DEEPSEEK_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured.');
  }

  const client = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey,
  });

  const model = 'deepseek-chat'; // DeepSeek-V3
  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content:
          'You are a high-level strategic analyst and philosopher for an elite art and tech publication. Output plain text paragraphs.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.5,
  });

  const content = completion.choices?.[0]?.message?.content;
  if (!content || !content.trim()) {
    throw new Error('DeepSeek returned empty content.');
  }

  return {
    content: content.trim(),
    model: 'deepseek-chat',
    provider: 'deepseek',
  };
}

// 2. OpenRouter DeepSeek Fallback
async function callOpenRouterDeepSeek(prompt: string): Promise<FlowAIResult> {
  const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured.');
  }

  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    defaultHeaders: {
      'HTTP-Referer': 'https://merkurov.love',
      'X-Title': 'Merkurov Flow Context',
    },
  });

  const models = [
    'deepseek/deepseek-chat',
    'deepseek/deepseek-r1:free',
    'openrouter/free',
    'meta-llama/llama-3.3-70b-instruct:free',
  ];

  let lastError: unknown = null;

  for (const model of models) {
    try {
      const completion = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
      });

      const content = completion.choices?.[0]?.message?.content;
      if (typeof content === 'string' && content.trim()) {
        return {
          content: content.trim(),
          model,
          provider: 'openrouter',
        };
      }
    } catch (err) {
      lastError = err;
      console.warn(`[flow-ai] OpenRouter model ${model} failed:`, err);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('OpenRouter fallback failed.');
}

// 3. Google Gemini Fallback
async function callGeminiFallback(prompt: string): Promise<FlowAIResult> {
  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_KEY ||
    process.env.google_API_key ||
    ''
  ).trim();

  if (!apiKey) {
    throw new Error('Gemini API key is not configured.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  let lastError = null;

  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const res = await model.generateContent(prompt);
      const text = res.response.text();
      if (text && text.trim()) {
        return {
          content: text.trim(),
          model: modelName,
          provider: 'gemini',
        };
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error('Gemini fallback failed.');
}

export async function generateFlowContext(item: FlowAIItem): Promise<FlowAIResult> {
  const prompt = buildEnhancedAnalysisPrompt(item);

  // 1. Try DeepSeek direct first
  try {
    return await callDeepSeekDirect(prompt);
  } catch (dsError: any) {
    console.warn('[flow-ai] DeepSeek direct unavailable, trying fallbacks:', dsError?.message || dsError);
  }

  // 2. Try OpenRouter DeepSeek / models
  try {
    return await callOpenRouterDeepSeek(prompt);
  } catch (orError: any) {
    console.warn('[flow-ai] OpenRouter fallback failed, trying Gemini:', orError?.message || orError);
  }

  // 3. Try Gemini
  try {
    return await callGeminiFallback(prompt);
  } catch (gemError: any) {
    console.error('[flow-ai] All AI providers failed:', gemError?.message || gemError);
    throw new Error('Failed to generate Flow analysis across all providers.');
  }
}
