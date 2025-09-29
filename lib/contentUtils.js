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
  // Убираем Markdown-разметку, чтобы получить чистый текст
  const plainText = content
    .replace(/!\[.*?\]\(.*?\)/g, '') // убираем картинки
    .replace(/\[(.*?)\]\(.*?\)/g, '$1') // убираем ссылки, оставляя текст
    .replace(/#{1,6}\s/g, '') // убираем заголовки
    .replace(/[`*_\-~]/g, '') // убираем прочее форматирование
    .replace(/\s\s+/g, ' ') // убираем лишние пробелы
    .trim();
  // Ограничиваем длину до 160 символов
  return plainText.substring(0, 160);
}
