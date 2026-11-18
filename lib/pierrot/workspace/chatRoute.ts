/**
 * Next.js 15+ passes `searchParams` to a server page as a Promise. Reading a
 * property such as `searchParams.history` directly therefore yields
 * `undefined` (and a sync-dynamic-API warning in development), silently
 * dropping every chat deep link: projects fall back to MAIN, `?history=` and
 * `?session=` never resume, and `?new=1` never starts a session.
 *
 * This module keeps the unwrapping in one place so the page, its regression
 * tests and any future route share the same synchronous-or-async contract.
 */
export type ChatSearchParams = Record<string, string | string[] | undefined>;

export type ChatSearchParamsInput = ChatSearchParams | Promise<ChatSearchParams> | null | undefined;

export type ChatRouteParams = {
  historyId: string;
  sessionId: string;
  conversationId: string;
  projectRef: string;
  startNew: boolean;
};

export function firstChatParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) || '';
}

/** Accepts the promise Next passes today and a plain object for older tests. */
export async function resolveChatRouteParams(
  input: ChatSearchParamsInput
): Promise<ChatRouteParams> {
  const params = (await input) || {};

  return {
    historyId: firstChatParam(params.history),
    sessionId: firstChatParam(params.session),
    conversationId: firstChatParam(params.conversation),
    projectRef: firstChatParam(params.project),
    startNew: firstChatParam(params.new) === '1',
  };
}
