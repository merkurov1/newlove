/**
 * Context assembly helpers shared by the Pierrot web route.
 *
 * They are deliberately pure so the budget and retry rules can be tested
 * without a database or a provider.
 */

export type NormalizedHistoryItem = { role: 'user' | 'assistant'; content: string };

/**
 * Keep the newest turns that fit the character budget.
 *
 * Walking oldest -> newest drops the most recent turns when an older message
 * is long. The model then answers an older conversation state. This walks from
 * the newest turn backwards and only then restores chronological order.
 */
export function selectRecentHistoryWindow(
  items: NormalizedHistoryItem[],
  maxItems: number,
  maxChars: number,
  maxItemChars: number
): NormalizedHistoryItem[] {
  const recent = items.slice(-Math.max(0, maxItems));
  const kept: NormalizedHistoryItem[] = [];
  let characters = 0;

  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const item = recent[index];
    const content = item.content.trim().slice(0, Math.max(0, maxItemChars));
    if (!content) continue;
    if (characters + content.length > maxChars) break;
    characters += content.length;
    kept.push({ role: item.role, content });
  }

  return kept.reverse();
}

/**
 * A retry with the same user message id already has that turn at the end of
 * the stored transcript. The current message is appended separately, so the
 * stored copy must be removed to avoid asking the model the same turn twice.
 */
export function dropTrailingDuplicateTurn(
  items: NormalizedHistoryItem[],
  currentMessage: string
): NormalizedHistoryItem[] {
  const trimmed = currentMessage.trim();
  if (!trimmed) return items;
  const last = items[items.length - 1];
  if (last?.role === 'user' && last.content.trim() === trimmed) {
    return items.slice(0, -1);
  }
  return items;
}
