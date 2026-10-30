import OpenAI from 'openai';

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

function cleanText(value: unknown, max = 4000): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function sanitizeAiOutput(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();
}

function buildTypeSpecificInstructions(type: string): string {
  switch (type) {
    case 'link':
      return `TYPE ANGLE (LINK/CURATION):
Focus on media architecture: why this link matters right now, the non-obvious shift behind the source, and its impact on the digital/cultural landscape.`;

    case 'video':
      return `TYPE ANGLE (VIDEO/MEDIA):
Focus on narrative and visual rhetoric: what this moving image/stream signals about contemporary culture, digital framing, or human attention.`;

    case 'article':
    default:
      return `TYPE ANGLE (ESSAY/TEXT):
Focus on subtext and structural tension: extract the underlying paradox, philosophical consequence, or hidden trajectory.`;
  }
}

function buildEnhancedAnalysisPrompt(item: FlowAIItem): string {
  const metadata = item.metadata ?? {};
  const description = cleanText(metadata.description);
  const siteName = cleanText(metadata.site_name, 300);
  const author = cleanText(metadata.author, 300);

  const effectiveBody =
    cleanText(item.body_md) ||
    description ||
    cleanText(item.title, 500) ||
    'External link artifact.';

  const isRu = (item.lang || 'ru').toLowerCase().startsWith('ru');

  const contextPayload = [
    `TYPE: ${item.type}`,
    `PRIMARY LANGUAGE: ${item.lang || 'ru'}`,
    `TITLE: ${cleanText(item.title, 500)}`,
    `BODY/CONTENT: ${effectiveBody}`,
    `SOURCE URL: ${cleanText(item.source_url, 1000)}`,
  ];

  if (description) contextPayload.push(`DESCRIPTION: ${description}`);
  if (siteName) contextPayload.push(`SOURCE SITE: ${siteName}`);
  if (author) contextPayload.push(`AUTHOR: ${author}`);

  return `ROLE & STYLE:
You are the editorial context engine of Merkurov Flow (merkurov.love) — intersecting High-Tech, Old Money, Art, and Context Architecture.

OBJECT:
${contextPayload.join('\n')}

${buildTypeSpecificInstructions(item.type)}

BILINGUAL DUAL-LAYER RULE:
Produce a tight, two-part bilingual insight (Primary Language + English translation/adaptation if Primary is RU, or Primary English + Russian if Primary is EN).

FORMAT & STRUCTURE:
${
  isRu
    ? `[RU] 1 dense, high-signal paragraph in Russian (40–60 words).
---
[EN] 1 sharp, elegant paragraph in English (40–60 words).`
    : `[EN] 1 dense, high-signal paragraph in English (40–60 words).
---
[RU] 1 sharp, elegant paragraph in Russian (40–60 words).`
}

CRITICAL CONSTRAINTS:
- Total length MUST NOT exceed 110 words across both languages.
- NO introductory fluff ("In this article...", "It is important to note...", "Данный материал...").
- NO summary or retelling. Provide PURE SUBTEXT AND INSIGHT.
- Do NOT mention that you are an AI or language model.`;
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

  const completion = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      {
        role: 'system',
        content:
          'You are a high-level strategic analyst for an elite media and tech publication. Output bilingual micro-insights.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.4,
  });

  const content = sanitizeAiOutput(completion.choices?.[0]?.message?.content || '');

  if (!content) {
    throw new Error('DeepSeek returned empty content.');
  }

  return {
    content,
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
  ];

  let lastError: unknown = null;

  for (const model of models) {
    try {
      const completion = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
      });

      const content = sanitizeAiOutput(completion.choices?.[0]?.message?.content || '');

      if (content) {
        return {
          content,
          model,
          provider: 'openrouter',
        };
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('OpenRouter fallback failed.');
}

export async function generateFlowContext(item: FlowAIItem): Promise<FlowAIResult | null> {
  // Фотки не обрабатываем вообще
  if (item.type === 'photo') {
    return null;
  }

  const prompt = buildEnhancedAnalysisPrompt(item);

  try {
    return await callDeepSeekDirect(prompt);
  } catch (dsError: any) {
    console.warn('[flow-ai] DeepSeek direct unavailable, trying fallbacks:', dsError?.message || dsError);
  }

  try {
    return await callOpenRouterDeepSeek(prompt);
  } catch (orError: any) {
    console.error(
      '[flow-ai] All DeepSeek providers failed:',
      orError?.message || orError
    );
    return null;
  }
}
