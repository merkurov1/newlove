import OpenAI from 'openai';

export const FLOW_AI_MODELS = [
  'openrouter/free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-r1:free',
  'qwen/qwen-2.5-72b-instruct:free',
];

export type FlowAIItem = {
  id: string;
  type: string;
  title: string | null;
  body_md: string | null;
  source_url: string | null;
  metadata: Record<string, unknown> | null;
  lang: string;
};

function cleanText(
  value: unknown,
  max = 8000,
) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function buildPrompt(item: FlowAIItem) {
  const metadata = item.metadata ?? {};

  const description = cleanText(
    metadata.description,
  );

  const siteName = cleanText(
    metadata.site_name,
    300,
  );

  const author = cleanText(
    metadata.author,
    300,
  );

  const sections = [
    `TYPE: ${item.type}`,
    `LANGUAGE: ${item.lang}`,
    `TITLE: ${cleanText(item.title, 500)}`,
    `BODY: ${cleanText(item.body_md)}`,
    `SOURCE URL: ${cleanText(item.source_url, 1000)}`,
  ];

  if (description) {
    sections.push(
      `SOURCE DESCRIPTION: ${description}`,
    );
  }

  if (siteName) {
    sections.push(
      `SOURCE SITE: ${siteName}`,
    );
  }

  if (author) {
    sections.push(
      `SOURCE AUTHOR: ${author}`,
    );
  }

  if (item.type === 'photo') {
    sections.push(
      'IMAGE NOTE: The image itself has NOT been visually analyzed. Do not describe visible objects, people, places, colors, or composition as facts.',
    );
  }

  return `You are the editorial context layer of Merkurov Flow.

Write a concise, intelligent context for the published object below.

Rules:
- This is context, not a summary of the author's text.
- Explain what is interesting, what question or subject it opens, and why it may matter.
- For links, use the supplied source metadata and URL context.
- For photos, use only supplied text and metadata. Never pretend to have seen the image.
- Do not invent facts, sources, people, dates, quotations, or intentions.
- Do not mention that you are an AI.
- Do not use headings unless they genuinely improve clarity.
- 2–4 short paragraphs, normally 120–280 words.
- Preserve the language of the item. If the item is Russian, answer in Russian; otherwise answer in English.
- Return plain text only.

OBJECT:

${sections.join('\n')}`;
}

function getOpenRouterClient() {
  const apiKey = (
    process.env.OPENROUTER_API_KEY || ''
  ).trim();

  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY is missing.',
    );
  }

  return new OpenAI({
    baseURL:
      'https://openrouter.ai/api/v1',
    apiKey,
    defaultHeaders: {
      'HTTP-Referer':
        'https://merkurov.love',
      'X-Title':
        'Merkurov Flow',
    },
  });
}

export async function generateFlowContext(
  item: FlowAIItem,
) {
  const client =
    getOpenRouterClient();

  const prompt =
    buildPrompt(item);

  let lastError: unknown = null;

  for (
    const model of FLOW_AI_MODELS
  ) {
    try {
      const completion =
        await client.chat.completions.create(
          {
            model,
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.45,
          },
        );

      const content =
        completion.choices?.[0]
          ?.message?.content;

      if (
        typeof content === 'string' &&
        content.trim()
      ) {
        return {
          content:
            content.trim(),
          model,
        };
      }
    } catch (error) {
      lastError = error;

      console.warn(
        `[flow-ai] model ${model} failed:`,
        error,
      );
    }
  }

  throw (
    lastError instanceof Error
      ? lastError
      : new Error(
          'All Flow AI models are unavailable.',
        )
  );
}