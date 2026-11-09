import { assertServerOnly } from '@/lib/serverOnly';
import OpenAI from 'openai';
import { resolveIntakeOccurredAt } from './parser';
import { resolveOwnerTimeZone } from './time';
import type { IntakeParseResult, IntakeType, ParsedIntakeItem } from './types';

assertServerOnly('lib/pierrot/intake/llm');

type Provider = {
  baseURL: string;
  apiKey: string;
  model: string;
  headers?: Record<string, string>;
};

function provider(): Provider | null {
  const deepseek = (process.env.DEEPSEEK_API_KEY || '').trim();
  if (deepseek) {
    return {
      baseURL: (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').trim(),
      apiKey: deepseek,
      model: (process.env.PIERROT_INTAKE_MODEL || 'deepseek-chat').trim(),
    };
  }

  const openrouter = (process.env.OPENROUTER_API_KEY || '').trim();
  if (openrouter) {
    return {
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: openrouter,
      model: (process.env.PIERROT_INTAKE_OPENROUTER_MODEL || 'deepseek/deepseek-chat').trim(),
      headers: {
        'HTTP-Referer': 'https://merkurov.love',
        'X-Title': 'Merkurov Pierrot Intake',
      },
    };
  }

  return null;
}

export function isIntakeModelEnabled(): boolean {
  return process.env.PIERROT_INTAKE_LLM_ENABLED === 'true' && provider() !== null;
}

const SYSTEM_PROMPT = `You extract actual, already completed food and drink consumption from one owner message.
Return JSON only, no markdown:
{"detected":boolean,"items":[{"type":"food"|"drink","itemName":string,"quantity":number|null,"unit":string|null}],"confidence":number}
Rules:
- detected=false for questions, negations, plans, future, hypotheticals, recipes, quotes, third-party statements, or mere discussion of food.
- Only report what the owner actually ate or drank.
- Split multiple distinct products into separate items.
- quantity is null when the message does not state it. Never invent calories, macros, volume or units.
- Keep itemName in the message language, without the verb, time or quantity.
- confidence is 0..1 and must be below 0.6 when uncertain.`;

function parseJson(value: string): unknown {
  const trimmed = value.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Optional fallback for complex phrasing. It uses the existing DeepSeek or
 * OpenRouter credentials; no new AI provider is introduced.
 */
export async function parseIntakeWithModel(
  message: string,
  input: { now?: Date; timezone?: string; timezoneKnown?: boolean } = {}
): Promise<IntakeParseResult | null> {
  const config = provider();
  if (!config) return null;
  if (process.env.PIERROT_INTAKE_LLM_ENABLED !== 'true') return null;

  const zone = resolveOwnerTimeZone();
  const timezone = input.timezone || zone.timezone;
  const timezoneKnown = input.timezoneKnown ?? zone.known;
  const now = input.now || new Date();
  const client = new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    timeout: 20_000,
    maxRetries: 0,
    ...(config.headers ? { defaultHeaders: config.headers } : {}),
  });

  try {
    const completion = await client.chat.completions.create({
      model: config.model,
      temperature: 0,
      max_tokens: 500,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message.slice(0, 2_000) },
      ],
    });
    const raw = completion.choices[0]?.message?.content || '';
    const parsed = parseJson(raw) as
      | {
          detected?: unknown;
          confidence?: unknown;
          items?: Array<{
            type?: unknown;
            itemName?: unknown;
            quantity?: unknown;
            unit?: unknown;
          }>;
        }
      | null;

    if (!parsed || parsed.detected !== true || !Array.isArray(parsed.items)) {
      return null;
    }

    const time = resolveIntakeOccurredAt(message, { now, timezone });
    const items: ParsedIntakeItem[] = parsed.items
      .map((item): ParsedIntakeItem | null => {
        const type: IntakeType | null =
          item.type === 'food' || item.type === 'drink' ? item.type : null;
        const itemName =
          typeof item.itemName === 'string' ? item.itemName.trim().slice(0, 120) : '';
        if (!type || !itemName) return null;
        const quantity =
          typeof item.quantity === 'number' && Number.isFinite(item.quantity)
            ? item.quantity
            : null;
        const unit = typeof item.unit === 'string' && item.unit.trim() ? item.unit.trim() : null;
        return {
          type,
          itemName,
          quantity,
          unit,
          occurredAt: time.occurredAt,
          timezone: timezoneKnown ? timezone : 'UTC',
        };
      })
      .filter((item): item is ParsedIntakeItem => Boolean(item));

    if (items.length === 0) return null;

    const confidence = Math.min(
      0.85,
      Math.max(
        0,
        typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
          ? parsed.confidence
          : 0.6
      )
    );

    return {
      detected: true,
      items,
      confidence,
      reason: 'consumption_detected_model',
      language: /[\u0400-\u04FF]/.test(message) ? 'ru' : 'en',
      timezone: timezoneKnown ? timezone : 'UTC',
      timezoneKnown,
      usedModel: true,
    };
  } catch {
    return null;
  }
}
