import { BskyAgent, RichText } from '@atproto/api';

let cachedAgent: BskyAgent | null = null;

async function getBlueskyAgent(): Promise<BskyAgent> {
  if (cachedAgent && cachedAgent.hasSession) {
    return cachedAgent;
  }

  const identifier = process.env.BLUESKY_IDENTIFIER;
  const password = process.env.BLUESKY_PASSWORD;

  if (!identifier || !password) {
    throw new Error('BLUESKY_IDENTIFIER or BLUESKY_PASSWORD env variables are missing.');
  }

  const agent = new BskyAgent({ service: 'https://bsky.social' });
  await agent.login({ identifier, password });

  cachedAgent = agent;
  return agent;
}

/**
 * Обогащение текста через DeepSeek API (генерирует 2-3 аккуратных хэштега)
 */
async function enhanceTextWithDeepSeek(rawText: string, lang: string = 'ru'): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || !rawText.trim()) {
    return rawText;
  }

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant for publishing posts to Bluesky for Anton Merkurov's personal platform Flow. Analyze the given text (language: ${lang}). Generate 2-3 concise and highly relevant hashtags. Append them cleanly at the end of the text. Keep the message under 280 characters if possible. Return ONLY the final formatted string.`,
          },
          {
            role: 'user',
            content: rawText.slice(0, 500),
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      return rawText;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || rawText;
  } catch (error) {
    console.warn('[bluesky] DeepSeek tag generation skipped:', error);
    return rawText;
  }
}

/**
 * Публикация поста во Flow в сети Bluesky
 */
export async function publishToBluesky({
  title,
  body_md,
  source_url,
  slug,
  lang = 'ru',
}: {
  title?: string | null;
  body_md?: string | null;
  source_url?: string | null;
  slug?: string | null;
  lang?: string;
}): Promise<{ uri: string; cid: string } | null> {
  try {
    const agent = await getBlueskyAgent();

    // Формируем текст
    let text = title?.trim() ? `${title.trim()}\n\n` : '';
    
    if (body_md) {
      const cleanBody = body_md
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[#*_`~]/g, '')
        .trim();
      text += cleanBody;
    }

    // Ссылка на сам Flow или на источник
    const flowLink = slug ? `https://www.merkurov.love/flow/${encodeURIComponent(slug)}` : source_url;
    if (flowLink) {
      text += `\n\n${flowLink}`;
    }

    // Генерация хэштегов с помощью DeepSeek
    const finalText = await enhanceTextWithDeepSeek(text, lang);

    // Автоматический парсинг графем, URL и хэштегов через RichText (делает теги и ссылки интерактивными)
    const rt = new RichText({ text: finalText.slice(0, 300) });
    await rt.detectFacets(agent);

    const postRecord: {
      $type: string;
      text: string;
      facets?: unknown;
      createdAt: string;
      embed?: unknown;
    } = {
      $type: 'app.bsky.feed.post',
      text: rt.text,
      facets: rt.facets,
      createdAt: new Date().toISOString(),
    };

    const response = await agent.post(postRecord);

    return {
      uri: response.uri,
      cid: response.cid,
    };
  } catch (error) {
    console.error('[bluesky] Publish failed:', error);
    return null;
  }
}

/**
 * Удаление поста из Bluesky при его удалении из Flow
 */
export async function deleteFromBluesky(uri: string): Promise<boolean> {
  try {
    if (!uri) return false;
    const agent = await getBlueskyAgent();

    const parts = uri.replace('at://', '').split('/');
    const repo = parts[0];
    const collection = parts[1];
    const rkey = parts[2];

    await agent.deleteRecord({
      repo,
      collection,
      rkey,
    });

    return true;
  } catch (error) {
    console.error('[bluesky] Delete failed:', error);
    return false;
  }
}
