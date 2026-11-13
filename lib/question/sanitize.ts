export const QUESTION_SYNTHESIS_MAX_CHARS = 20_000;

/**
 * Converts model output into a conservative Markdown subset.
 *
 * The renderer additionally disables raw HTML and images. This function keeps
 * dangerous or editorial-dashboard structures out of storage in the first
 * place: fenced code, tables, images and HTML tags.
 */
export function sanitizeQuestionSynthesis(value: unknown): string {
  if (typeof value !== 'string') return '';

  let text = value
    .replace(/\r\n?/g, '\n')
    .split(String.fromCharCode(0))
    .join('')
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/```[\s\S]*?```/g, '\n\n')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/`([^`\n]+)`/g, '$1');

  text = text
    .split('\n')
    .filter((line) => {
      const pipes = (line.match(/\|/g) || []).length;
      return pipes < 2;
    })
    .join('\n');

  text = text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!/[\p{L}\p{N}]/u.test(text)) return '';

  return text.slice(0, QUESTION_SYNTHESIS_MAX_CHARS).trim();
}
