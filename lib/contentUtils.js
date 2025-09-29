// lib/contentUtils.js

/**
 * Находит URL первого изображения в Markdown-контенте.
 * @param {string} content - Строка с Markdown-текстом.
 * @returns {string|null} URL изображения или null, если не найдено.
 */
export function getFirstImage(content) {
  if (!content) return null;
  const regex = /!\[.*?\]\((.*?)\)/;
  const match = content.match(regex);
  return match ? match[1] : null;
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
