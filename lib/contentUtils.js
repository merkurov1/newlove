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
  
  let url = null;
  
  // 1. Markdown image ![alt](url)
  const markdownMatch = content.match(/!\[.*?\]\((.*?)\)/);
  if (markdownMatch) {
    url = markdownMatch[1].trim();
  }
  
  // 2. HTML <img src="...">
  if (!url) {
    const htmlMatch = content.match(/<img[^>]*src=["']([^"'>]+)["'][^>]*>/i);
    if (htmlMatch) {
      url = htmlMatch[1].trim();
    }
  }
  
  // 3. Ищем любые HTTP ссылки на изображения
  if (!url) {
    const urlMatch = content.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?/i);
    if (urlMatch) {
      url = urlMatch[0];
    }
  }

  if (!url) return null;  // Если это Supabase Storage путь - упрощаем логику
  if (url.includes('supabase') && url.includes('/storage/v1/object/')) {
    // Если уже публичный URL, возвращаем как есть
    if (url.includes('/object/public/')) {
      return url;
    }
    
    // Если это приватный URL, конвертируем в публичный
    if (url.includes('/object/sign/')) {
      return url.replace('/object/sign/', '/object/public/');
    }
    
    // Если это другой формат, пытаемся сделать его публичным
    if (url.includes('/object/')) {
      const parts = url.split('/object/');
      if (parts.length === 2) {
        const baseUrl = parts[0];
        const path = parts[1];
        return `${baseUrl}/object/public/${path}`;
      }
    }
  }
  
  // Возвращаем исходный URL как fallback
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
