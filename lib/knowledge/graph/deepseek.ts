import OpenAI from 'openai';

const DEFAULT_MODEL = 'deepseek-chat';

export type GraphChatOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  json?: boolean;
};

export function getGraphModel(): string {
  return (process.env.BRAIN_GRAPH_MODEL || process.env.DEEPSEEK_MODEL || DEFAULT_MODEL).trim();
}

export function isGraphLlmConfigured(): boolean {
  return Boolean((process.env.DEEPSEEK_API_KEY || '').trim());
}

function createClient(timeoutMs: number): OpenAI {
  const apiKey = (process.env.DEEPSEEK_API_KEY || '').trim();

  if (!apiKey) throw new Error('deepseek_not_configured');

  return new OpenAI({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    timeout: timeoutMs,
    maxRetries: 0,
  });
}

async function complete(
  system: string,
  user: string,
  options: GraphChatOptions = {}
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const client = createClient(timeoutMs);
  const model = options.model || getGraphModel();

  const response = await client.chat.completions.create({
    model,
    temperature: options.temperature ?? 0,
    max_tokens: options.maxTokens ?? 4096,
    ...(options.json === false ? {} : { response_format: { type: 'json_object' } }),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  const content = response.choices[0]?.message?.content;

  if (!content || !content.trim()) {
    throw new Error('deepseek_empty_response');
  }

  return content.trim();
}

export async function graphChatJson(
  system: string,
  user: string,
  options: GraphChatOptions = {}
): Promise<unknown> {
  const raw = await complete(system, user, { ...options, json: true });

  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');

    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        // Fall through.
      }
    }

    throw new Error('deepseek_invalid_json');
  }
}

export async function graphChatText(
  system: string,
  user: string,
  options: GraphChatOptions = {}
): Promise<string> {
  return complete(system, user, { ...options, json: false });
}
