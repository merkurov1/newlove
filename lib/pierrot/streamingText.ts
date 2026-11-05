/**
 * Small, client-safe helpers for rendering Markdown while tokens arrive.
 *
 * The renderer must never let a half-received fenced code block swallow the
 * rest of the answer. This is presentation-only: the completed payload remains
 * authoritative and replaces any partial text.
 */
export function stabilizeStreamingMarkdown(content: string, streaming: boolean): string {
  if (!streaming) return content;

  const fences = (content.match(/```/g) || []).length;
  return fences % 2 === 1 ? `${content}\n\`\`\`` : content;
}
