export function parseRichTextContent(content: string): string {
  try {
    const parsed = JSON.parse(content);
    
    if (Array.isArray(parsed)) {
      return parsed
        .map(block => {
          if (block.type === 'richText' && block.data?.html) {
            // Убираем HTML теги для превью
            return block.data.html
              .replace(/<[^>]*>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
          }
          return '';
        })
        .join(' ');
    }
    
    return content;
  } catch (e) {
    // Если это не JSON, возвращаем как есть
    return content;
  }
}

export function parseRichTextContentHTML(content: string): string {
  try {
    const parsed = JSON.parse(content);
    
    if (Array.isArray(parsed)) {
      return parsed
        .map(block => {
          if (block.type === 'richText' && block.data?.html) {
            return block.data.html;
          }
          return '';
        })
        .join('');
    }
    
    return content;
  } catch (e) {
    return content;
  }
}