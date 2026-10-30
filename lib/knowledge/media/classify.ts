import OpenAI from 'openai';

export const MEDIA_KINDS = [
  'quote',
  'mention',
  'interview',
  'radio',
  'video',
  'column',
  'blog',
  'profile',
] as const;

export const MEDIA_TOPICS = [
  'Internet & Censorship',
  'AI & Tech',
  'Art & Culture',
  'Fintech & Crypto',
] as const;

/**
 * The public Media Archive currently renders only a subset of these, but the
 * database and the admin interface must not collapse French, Italian, Spanish
 * or other Latin-script publications into English.
 */
export const MEDIA_LANGUAGES = [
  'EN',
  'RU',
  'DE',
  'PL',
  'BS',
  'FR',
  'IT',
  'ES',
  'PT',
  'NL',
  'CS',
  'TR',
  'UK',
  'SR',
  'HR',
] as const;

export type MediaKind = (typeof MEDIA_KINDS)[number];
export type MediaTopic = (typeof MEDIA_TOPICS)[number];
export type MediaLanguage = (typeof MEDIA_LANGUAGES)[number];

export type MediaClassification = {
  lang: MediaLanguage;
  kind: MediaKind;
  topic: MediaTopic;
  model: string;
  error: string | null;
};

export type MediaClassificationInput = {
  title: string;
  outlet: string;
  summary: string;
  url: string;
  detectedLanguage?: string | null;
};

function isOneOf<T extends readonly string[]>(
  values: T,
  value: unknown
): value is T[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

export function normalizeMediaLanguage(
  value: string | null | undefined,
  fallback: MediaLanguage = 'EN'
): MediaLanguage {
  const tag = (value || '')
    .trim()
    .toUpperCase()
    .replace(/_/g, '-')
    .split('-')[0];

  return isOneOf(MEDIA_LANGUAGES, tag) ? tag : fallback;
}

export function fallbackMediaClassification(
  detectedLanguage?: string | null
): MediaClassification {
  return {
    lang: normalizeMediaLanguage(detectedLanguage),
    kind: 'mention',
    topic: 'Internet & Censorship',
    model: 'fallback',
    error: null,
  };
}

/**
 * Classification is best-effort. A provider failure must not block safe
 * ingestion: the caller gets a deterministic fallback with an explicit error
 * string for admin diagnostics.
 */
export async function classifyMediaPublication(
  input: MediaClassificationInput
): Promise<MediaClassification> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();

  if (!apiKey) return fallbackMediaClassification(input.detectedLanguage);

  try {
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    const client = new OpenAI({
      apiKey,
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      timeout: 12_000,
      maxRetries: 1,
    });

    const result = await client.chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Classify a media publication. Return JSON only with fields lang, kind, topic. ' +
            `lang must be one of ${MEDIA_LANGUAGES.join(', ')}. ` +
            `kind must be one of ${MEDIA_KINDS.join(', ')}. ` +
            `topic must be one of ${MEDIA_TOPICS.join(', ')}. ` +
            'Infer only from the supplied metadata. Do not invent facts. ' +
            'Use mention when the participation type is unclear. Choose the most relevant topic.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            title: input.title,
            outlet: input.outlet,
            summary: input.summary,
            url: input.url,
            detected_language: input.detectedLanguage || null,
          }),
        },
      ],
    });

    const raw = result.choices[0]?.message?.content || '{}';
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ...fallbackMediaClassification(input.detectedLanguage),
        model,
        error: 'invalid_response',
      };
    }

    const data = parsed as Record<string, unknown>;

    return {
      lang: isOneOf(MEDIA_LANGUAGES, data.lang)
        ? data.lang
        : normalizeMediaLanguage(input.detectedLanguage),
      kind: isOneOf(MEDIA_KINDS, data.kind) ? data.kind : 'mention',
      topic: isOneOf(MEDIA_TOPICS, data.topic)
        ? data.topic
        : 'Internet & Censorship',
      model,
      error: null,
    };
  } catch (error) {
    return {
      ...fallbackMediaClassification(input.detectedLanguage),
      error: error instanceof Error ? error.message.slice(0, 200) : 'classification_failed',
    };
  }
}
