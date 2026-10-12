
import OpenAI from "openai";
import { z } from "zod";
import type { IssueAI, IssueKind, IssueLang } from "./types";

const ResultSchema = z.object({
  lang: z.enum(["ru", "en", "other"]),
  kind: z.enum(["about_flow", "world", "other"]),
});

const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const TIMEOUT_MS = 12_000;
const MAX_RETRIES = 2;
const BATCH_SIZE = 8;

const client = () => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured");

  return new OpenAI({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    timeout: TIMEOUT_MS,
    maxRetries: 0,
  });
};

export function heuristicLanguage(text: string): IssueLang | "other" {
  const sample = (text || "").slice(0, 5000);
  let cyrillic = 0;
  let latin = 0;

  for (const char of sample) {
    if (/[А-Яа-яЁё]/.test(char)) cyrillic++;
    else if (/[A-Za-z]/.test(char)) latin++;
  }

  if (cyrillic >= 12 && cyrillic > latin * 1.15) return "ru";
  if (latin >= 12 && latin > cyrillic * 1.15) return "en";
  return "other";
}

export function heuristicKind(_text: string): IssueKind {
  return "other";
}

async function classifyOnce(text: string) {
  const response = await client().chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          'Classify the supplied text. Return JSON only: {"lang":"ru|en|other","kind":"about_flow|world|other"}. ' +
          "Do not write, rewrite, summarize, title, or annotate the text. " +
          "about_flow means specifically about the Flow project or its operation. " +
          "world means external world events, art, technology, politics, or society. " +
          "Everything else is other.",
      },
      {
        role: "user",
        content: text.slice(0, 7000),
      },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("DeepSeek returned an empty classification");

  return ResultSchema.parse(JSON.parse(raw));
}

async function classifyWithRetry(text: string) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await classifyOnce(text);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) =>
          setTimeout(resolve, 300 * (attempt + 1)),
        );
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("DeepSeek classification failed");
}

export async function classifyNewItems(
  supabase: any,
  items: any[],
): Promise<Map<string, IssueAI>> {
  const result = new Map<string, IssueAI>();

  // INTEGRATION: items with ai_allowed=false never leave Supabase.
  const eligible = items.filter(
    (item) =>
      item.ai_allowed === true &&
      !item.metadata?.issue_ai &&
      typeof item.id === "string",
  );

  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    const batch = eligible.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (item) => {
        const metadata = item.metadata || {};
        const text = [
          item.title || "",
          item.body_md || "",
          metadata.title || "",
          metadata.description || "",
          metadata.youtube?.title || "",
          metadata.youtube?.author_name || "",
        ]
          .filter(Boolean)
          .join("\n")
          .trim();

        if (!text) return;

        let lang: IssueAI["lang"];
        let kind: IssueKind;

        try {
          const classified = await classifyWithRetry(text);
          lang = classified.lang;
          kind = classified.kind;
        } catch (error) {
          console.warn("[flow-issue] DeepSeek fallback", item.id, error);
          lang = heuristicLanguage(text);
          kind = "other";
        }

        const tag: IssueAI = {
          lang,
          kind,
          model: MODEL,
          at: new Date().toISOString(),
        };

        result.set(item.id, tag);

        // Cache result in metadata without deleting unrelated metadata.
        const nextMetadata = { ...metadata, issue_ai: tag };
        const { error } = await supabase
          .from("items")
          .update({ metadata: nextMetadata })
          .eq("id", item.id);

        if (error) {
          console.error(
            "[flow-issue] failed to cache classification",
            item.id,
            error.message,
          );
        }
      }),
    );
  }

  return result;
}
