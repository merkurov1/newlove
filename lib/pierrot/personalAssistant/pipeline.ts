import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/pierrot/personalAssistant/pipeline');

import type OpenAI from 'openai';
import {
  buildWebEvidencePrompt,
  buildWebStatusPrompt,
  composeReplyWithWebSources,
} from '@/lib/knowledge/web/webContext';
import { decideWebSearch } from '@/lib/knowledge/web/searchDecision';
import { searchWebEvidence } from '@/lib/knowledge/web/exaSearch';
import type { WebSearchResult } from '@/lib/knowledge/web/types';
import { callPersonalAssistantModel, type PierrotModelResult } from '@/lib/pierrot/model';
import { detectAssistantLanguage, type AssistantLanguage } from './language';
import { parsePersonalAssistantMemoryCommand } from './memoryCommands';
import { buildPersonalAssistantSystemPrompt } from './prompt';
import {
  memoryDisabled,
  memoryEnabled,
  memoryForgotten,
  memoryList,
  memoryRemembered,
  memoryUnavailable,
  memoryUpdated,
  privacyExplanation,
} from './replies';
import type {
  PersonalAssistantMessage,
  PersonalAssistantProfile,
  PersonalAssistantStore,
} from './store';

export type PersonalAssistantTurnDependencies = {
  searchWeb?: (input: { query: string }) => Promise<WebSearchResult>;
  generate?: (
    systemPrompt: string,
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
  ) => Promise<PierrotModelResult>;
};

export type PersonalAssistantTurnInput = {
  profile: PersonalAssistantProfile;
  message: string;
  messageId: string;
  store: PersonalAssistantStore | null;
  dependencies?: PersonalAssistantTurnDependencies;
};

export type PersonalAssistantTurnResult = {
  reply: string;
  provider: string;
  model: string | null;
  language: AssistantLanguage;
  searchedWeb: boolean;
};

const MAX_HISTORY_TURNS = 20;
const MAX_REPLY_CHARS = 12_000;

function toModelMessages(
  history: PersonalAssistantMessage[],
  message: string
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return [
    ...history.slice(-MAX_HISTORY_TURNS).map((turn) => ({
      role: turn.role,
      content: turn.content,
    })),
    { role: 'user' as const, content: message },
  ];
}

async function safeAppend(
  store: PersonalAssistantStore | null,
  input: Parameters<PersonalAssistantStore['appendMessage']>[0]
): Promise<void> {
  if (!store) return;

  try {
    await store.appendMessage(input);
  } catch {
    // A transcript write must never turn a delivered answer into an error.
    // Memory commands report their own storage failures explicitly below.
  }
}

async function handleMemoryCommand(input: {
  command: NonNullable<ReturnType<typeof parsePersonalAssistantMemoryCommand>>;
  profile: PersonalAssistantProfile;
  store: PersonalAssistantStore | null;
  language: AssistantLanguage;
  messageId: string;
}): Promise<string> {
  const { command, profile, store, language, messageId } = input;

  if (command.kind === 'privacy') {
    return privacyExplanation(language);
  }

  if (!store) return memoryUnavailable(language);

  // Disabling memory stops new records. Existing records can still be read,
  // forgotten or re-enabled explicitly.
  if (!profile.memoryEnabled && (command.kind === 'remember' || command.kind === 'update')) {
    return memoryDisabled(language);
  }

  try {
    if (command.kind === 'remember') {
      await store.rememberMemory(profile.id, command.content, messageId);
      return memoryRemembered(language);
    }

    if (command.kind === 'update') {
      const updated = await store.updateLatestMemory(profile.id, command.content);
      return memoryUpdated(language, updated);
    }

    if (command.kind === 'forget') {
      const count = await store.forgetMemory(profile.id, command.query);
      return memoryForgotten(language, count);
    }

    if (command.kind === 'disable') {
      await store.setMemoryEnabled(profile.id, false);
      profile.memoryEnabled = false;
      return memoryDisabled(language);
    }

    if (command.kind === 'enable') {
      await store.setMemoryEnabled(profile.id, true);
      profile.memoryEnabled = true;
      return memoryEnabled(language);
    }

    const memories = await store.listMemories(profile.id);
    return memoryList(language, memories, profile.memoryEnabled);
  } catch {
    return memoryUnavailable(language);
  }
}

/**
 * One personal assistant turn.
 *
 * Isolation invariants:
 * - history is loaded only through this profile's store;
 * - memory is loaded only through this profile's store;
 * - web search is the existing public Exa adapter;
 * - generation is DeepSeek-first and receives the same neutral persona on every
 *   fallback;
 * - no owner, Brain, project, decision, analytics or admin module is imported.
 */
export async function runPersonalAssistantTurn(
  input: PersonalAssistantTurnInput
): Promise<PersonalAssistantTurnResult> {
  const message = String(input.message || '').trim();
  const language = detectAssistantLanguage(message);
  const store = input.store;
  const dependencies = input.dependencies || {};

  let history: PersonalAssistantMessage[] = [];

  if (store) {
    try {
      history = await store.loadHistory(input.profile.id, MAX_HISTORY_TURNS);
    } catch {
      history = [];
    }
  }

  const command = parsePersonalAssistantMemoryCommand(message);

  if (command) {
    await safeAppend(store, {
      profileId: input.profile.id,
      messageId: input.messageId,
      role: 'user',
      content: message,
      language,
    });

    const reply = await handleMemoryCommand({
      command,
      profile: input.profile,
      store,
      language,
      messageId: input.messageId,
    });

    await safeAppend(store, {
      profileId: input.profile.id,
      messageId: `${input.messageId}:assistant`,
      role: 'assistant',
      content: reply,
      language,
    });

    return {
      reply,
      provider: 'system',
      model: null,
      language,
      searchedWeb: false,
    };
  }

  let memoryContext: string | null = null;

  if (store && input.profile.memoryEnabled) {
    try {
      memoryContext = await store.buildMemoryContext(input.profile.id);
    } catch {
      memoryContext = null;
    }
  }

  const webDecision = decideWebSearch({
    message,
    history,
    ownerMode: false,
  });
  const webRequested = Boolean(webDecision.shouldSearch);

  let webResult: WebSearchResult | null = null;

  if (webRequested) {
    const search = dependencies.searchWeb || searchWebEvidence;

    try {
      webResult = await search({ query: webDecision.query || message });
    } catch {
      // A failed search is represented as an explicit unavailable status in
      // the prompt, so the model cannot pretend that it found sources.
      webResult = null;
    }
  }

  const systemPrompt = buildPersonalAssistantSystemPrompt({
    language,
    memoryContext,
    webEvidencePrompt: buildWebEvidencePrompt(webResult),
    webStatusPrompt: webRequested ? buildWebStatusPrompt(webResult) : null,
    historyLength: history.length,
  });

  await safeAppend(store, {
    profileId: input.profile.id,
    messageId: input.messageId,
    role: 'user',
    content: message,
    language,
  });

  const generate = dependencies.generate || callPersonalAssistantModel;
  const generated = await generate(systemPrompt, toModelMessages(history, message));

  const reply =
    webResult?.outcome === 'relevant_results'
      ? composeReplyWithWebSources(generated.reply, webResult.sources, MAX_REPLY_CHARS)
      : generated.reply.slice(0, MAX_REPLY_CHARS);

  await safeAppend(store, {
    profileId: input.profile.id,
    messageId: `${input.messageId}:assistant`,
    role: 'assistant',
    content: reply,
    language,
    metadata: {
      provider: generated.provider,
      model: generated.model,
      web: webResult?.outcome || (webRequested ? 'unavailable' : 'not_requested'),
    },
  });

  return {
    reply,
    provider: generated.provider,
    model: generated.model,
    language,
    searchedWeb: webRequested,
  };
}
