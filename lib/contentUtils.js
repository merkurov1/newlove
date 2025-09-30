// lib/contentUtils.js

/**
 * Находит URL первого изображения в Markdown-контенте.
 * @param {string} content - Строка с Markdown-текстом.
 * @returns {string|null} URL изображения или null, если не найдено.
 */
import { createClient } from '@supabase/supabase-js';

/**
 * Находит URL первого изображения в Markdown-контенте и возвращает signedUrl для приватных файлов Supabase.
 * SSR: работает только на сервере (getFirstImage используется в getStaticProps/getServerSideProps или API).
 * @param {string} content - Markdown-текст.
 * @returns {Promise<string|null>} - URL изображения (signedUrl для приватных файлов) или null.
 */
export async function getFirstImage(content) {
  if (!content) return null;
  // 1. Markdown image ![alt](url)
  let regex = /!\[.*?\]\((.*?)\)/;
  let match = content.match(regex);
  let url = match ? match[1] : null;
  // 2. HTML <img src="...">
  if (!url) {
    const htmlImg = content.match(/<img[^>]*src=["']([^"'>]+)["'][^>]*>/i);
    url = htmlImg ? htmlImg[1] : null;
  }
  if (!url) return null;
  // Если это Supabase Storage путь (media bucket)
  if (url.startsWith('https://') && url.includes('/storage/v1/object/')) {
    // Определяем имя файла
    const publicMatch = url.match(/\/object\/public\/media%2F(.+)$/);
    const privateMatch = url.match(/\/object\/sign\/media%2F(.+?)\?/);
    const fileName = publicMatch ? decodeURIComponent(publicMatch[1]) : privateMatch ? decodeURIComponent(privateMatch[1]) : null;
    if (!fileName) return url;
    // Создаём серверный Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    // Пробуем получить signedUrl (даже для public, чтобы всегда был рабочий)
    const { data, error } = await supabase.storage.from('media').createSignedUrl(fileName, 60 * 60);
    if (data?.signedUrl) return data.signedUrl;
    // Fallback: возвращаем исходный url
    return url;
  }
  return url;
}

/**
 * Создаёт короткое текстовое описание из Markdown-контента для SEO.
 * @param {string} content - Строка с Markdown-текстом.
 * @returns {string} Очищенный и обрезанный текст.
 */
export function generateDescription(content) {
  if (!content) return '';
  const plainText = content
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/[`*_\-~]/g, '')
    .replace(/\s\s+/g, ' ')
    .trim();
  return plainText.substring(0, 160);
}
