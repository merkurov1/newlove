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
            content: `You are an AI assistant for publishing posts to Bluesky for Anton Merkurov's personal platform Flow. Analyze the given text (language: ${lang}). Generate 2-3 concise and highly relevant hashtags. Append them cleanly at the end of the text. Keep the message under 260 characters if possible. Return ONLY the final formatted string.`,
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
 * Загрузка изображения в Bluesky как Blob для превью-карточки (thumb) или картинки
 */
async function uploadImageBlob(
  agent: BskyAgent,
  imageUrl: string
): Promise<any | null> {
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) {
      console.warn(`[bluesky] Failed to fetch image: ${res.status} ${res.statusText}`);
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    // Максимальный размер blob в Bluesky для превью — около 976 KB (1,000,000 байт)
    if (arrayBuffer.byteLength === 0 || arrayBuffer.byteLength > 990000) {
      console.warn(`[bluesky] Image size ${arrayBuffer.byteLength} exceeds 990KB limit for card thumb.`);
      return null;
    }

    const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
    const uploadRes = await agent.uploadBlob(new Uint8Array(arrayBuffer), {
      encoding: contentType,
    });

    return uploadRes.data?.blob || null;
  } catch (err) {
    console.warn('[bluesky] Blob upload error:', err);
    return null;
  }
}

/**
 * Безопасное усечение текста до лимита Bluesky (300 графем), сохраняя целостность ссылки и хэштегов
 */
function truncatePostText(text: string, maxLen = 300): string {
  if (text.length <= maxLen) return text;

  // Ищем последнее предложение или перенос строки перед лимитом
  const sliced = text.slice(0, maxLen - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  if (lastSpace > 100) {
    return `${sliced.slice(0, lastSpace)}…`;
  }
  return `${sliced}…`;
}

/**
 * Публикация поста во Flow в сети Bluesky с полноценной карточкой превью (External Embed)
 */
export async function publishToBluesky({
  title,
  body_md,
  source_url,
  slug,
  lang = 'ru',
  imageUrl,
  description,
}: {
  title?: string | null;
  body_md?: string | null;
  source_url?: string | null;
  slug?: string | null;
  lang?: string;
  imageUrl?: string | null;
  description?: string | null;
}): Promise<{ uri: string; cid: string } | null> {
  try {
    const agent = await getBlueskyAgent();

    // Очищаем markdown для основного текста
    const cleanBody = (body_md || '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[#*_`~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Формируем текст поста
    let text = title?.trim() ? `${title.trim()}` : '';
    if (cleanBody) {
      text = text ? `${text}\n\n${cleanBody}` : cleanBody;
    }

    // Ссылка на публикацию во Flow или оригинальный источник
    const flowLink = slug
      ? `https://www.merkurov.love/flow/${encodeURIComponent(slug)}`
      : source_url;

    // Генерируем обогащённый текст с хэштегами через DeepSeek
    const enrichedText = await enhanceTextWithDeepSeek(text || 'Flow // Anton Merkurov', lang);
    const finalText = truncatePostText(enrichedText, 290);

    // Автоматический парсинг фасетов (ссылок, хэштегов, упоминаний)
    const rt = new RichText({ text: finalText });
    await rt.detectFacets(agent);

    // Подготавливаем заголовок и описание для карточки превью
    const cardTitle = (title?.trim() || cleanBody.slice(0, 80) || 'Flow | Anton Merkurov').slice(0, 200);
    const cardDescription = (
      description?.trim() ||
      cleanBody.slice(0, 200) ||
      'Personal publishing by Anton Merkurov.'
    ).slice(0, 280);

    // Пытаемся загрузить картинку для превью
    let thumbBlob: any = null;
    const candidateImg = imageUrl || (slug ? `https://www.merkurov.love/flow/${encodeURIComponent(slug)}/opengraph-image` : null);
    if (candidateImg) {
      thumbBlob = await uploadImageBlob(agent, candidateImg);
    }

    // Формируем Embed для Bluesky
    let embed: any = undefined;

    if (flowLink) {
      // 1. Полноценная карточка внешней ссылки (External Embed Card)
      embed = {
        $type: 'app.bsky.embed.external',
        external: {
          uri: flowLink,
          title: cardTitle,
          description: cardDescription,
          ...(thumbBlob ? { thumb: thumbBlob } : {}),
        },
      };
    } else if (thumbBlob) {
      // 2. Если ссылки нет, но есть изображение — прикрепляем как Image Embed
      embed = {
        $type: 'app.bsky.embed.images',
        images: [
          {
            image: thumbBlob,
            alt: cardTitle,
          },
        ],
      };
    }

    const postRecord: any = {
      $type: 'app.bsky.feed.post',
      text: rt.text,
      facets: rt.facets,
      createdAt: new Date().toISOString(),
      ...(embed ? { embed } : {}),
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

    await agent.api.com.atproto.repo.deleteRecord({
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
