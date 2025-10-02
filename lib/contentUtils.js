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
  
  if (!url) return null;
  
  // Если это Supabase Storage путь
  if (url.includes('supabase') && url.includes('/storage/v1/object/')) {
    try {
      // Попробуем получить имя файла из URL
      let fileName = null;
      
      // Для публичных файлов: /object/public/media/filename
      const publicMatch = url.match(/\/object\/public\/media[\/]?([^?]+)/);
      if (publicMatch) {
        fileName = decodeURIComponent(publicMatch[1]);
      }
      
      // Для приватных файлов: /object/sign/media/filename
      if (!fileName) {
        const privateMatch = url.match(/\/object\/sign\/media[\/]?([^?]+)/);
        if (privateMatch) {
          fileName = decodeURIComponent(privateMatch[1]);
        }
      }
      
      // Если удалось извлечь имя файла
      if (fileName && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        
        const { data, error } = await supabase.storage
          .from('media')
          .createSignedUrl(fileName, 60 * 60 * 24); // 24 часа
        
        if (data?.signedUrl && !error) {
          return data.signedUrl;
        }
        
        if (error) {
          console.error('Error creating signed URL:', error);
        }
      }
    } catch (error) {
      console.error('Error creating signed URL:', error);
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
