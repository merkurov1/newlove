import { assertServerOnly } from '@/lib/serverOnly';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

assertServerOnly('lib/pierrot/personalAssistant/store');

import { PERSONAL_ASSISTANT_DISPLAY_NAME, isPersonalAssistantSenderId } from './identity';
import { buildPersonalAssistantMemoryContext } from './prompt';

export type PersonalAssistantProfile = {
  id: string;
  telegramUserId: number;
  displayName: string | null;
  memoryEnabled: boolean;
};

export type PersonalAssistantMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type PersonalAssistantMemory = {
  id: string;
  content: string;
  updatedAt: string | null;
};

export type AppendMessageInput = {
  profileId: string;
  messageId: string;
  role: 'user' | 'assistant';
  content: string;
  language?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Minimal server-side store contract. Every method receives an explicit
 * profile UUID and every implementation query filters on it. There is no
 * method that reads across profiles and no link to owner history, Brain,
 * projects or decisions.
 */
export type PersonalAssistantStore = {
  ensureProfile(telegramUserId: number): Promise<PersonalAssistantProfile>;
  setMemoryEnabled(profileId: string, enabled: boolean): Promise<void>;
  loadHistory(profileId: string, limit: number): Promise<PersonalAssistantMessage[]>;
  appendMessage(input: AppendMessageInput): Promise<void>;
  listMemories(profileId: string): Promise<PersonalAssistantMemory[]>;
  rememberMemory(profileId: string, content: string, sourceMessageId: string): Promise<void>;
  updateLatestMemory(profileId: string, content: string): Promise<boolean>;
  forgetMemory(profileId: string, query: string | null): Promise<number>;
  buildMemoryContext(profileId: string): Promise<string | null>;
};

const PROFILE_TABLE = 'pierrot_assistant_profiles';
const MESSAGE_TABLE = 'pierrot_assistant_messages';
const MEMORY_TABLE = 'pierrot_assistant_memories';

const MAX_MESSAGE_CHARS = 12_000;

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function requireProfileId(profileId: string): string {
  if (!isUuid(profileId)) throw new Error('Invalid personal assistant profile id.');
  return profileId;
}

function sanitizeMessageId(value: string): string {
  const trimmed = String(value || '')
    .trim()
    .slice(0, 160);
  if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(trimmed)) {
    throw new Error('Invalid personal assistant message id.');
  }
  return trimmed;
}

function normalizeRole(value: unknown): 'user' | 'assistant' {
  return value === 'assistant' ? 'assistant' : 'user';
}

function normalizeContent(value: unknown): string {
  return String(value ?? '')
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, MAX_MESSAGE_CHARS);
}

function profileFromRow(row: Record<string, unknown>): PersonalAssistantProfile {
  return {
    id: String(row.id),
    telegramUserId: Number(row.telegram_user_id),
    displayName: typeof row.display_name === 'string' ? row.display_name : null,
    memoryEnabled: row.memory_enabled !== false,
  };
}

export function createPersonalAssistantStore(client: SupabaseClient): PersonalAssistantStore {
  return {
    async ensureProfile(telegramUserId: number): Promise<PersonalAssistantProfile> {
      if (!isPersonalAssistantSenderId(telegramUserId)) {
        throw new Error('Telegram user is not allowed to use the personal assistant profile.');
      }

      const existing = await client
        .from(PROFILE_TABLE)
        .select('id, telegram_user_id, display_name, memory_enabled')
        .eq('telegram_user_id', telegramUserId)
        .maybeSingle();

      if (existing.error) throw existing.error;
      if (existing.data) return profileFromRow(existing.data as Record<string, unknown>);

      const inserted = await client
        .from(PROFILE_TABLE)
        .insert({
          telegram_user_id: telegramUserId,
          display_name: PERSONAL_ASSISTANT_DISPLAY_NAME,
        })
        .select('id, telegram_user_id, display_name, memory_enabled')
        .single();

      if (!inserted.error && inserted.data) {
        return profileFromRow(inserted.data as Record<string, unknown>);
      }

      // A concurrent first message may have created the row between the
      // lookup and the insert. Re-read instead of failing the turn.
      const raced = await client
        .from(PROFILE_TABLE)
        .select('id, telegram_user_id, display_name, memory_enabled')
        .eq('telegram_user_id', telegramUserId)
        .maybeSingle();

      if (raced.error) throw raced.error;
      if (raced.data) return profileFromRow(raced.data as Record<string, unknown>);

      throw inserted.error || new Error('Could not create personal assistant profile.');
    },

    async setMemoryEnabled(profileId: string, enabled: boolean): Promise<void> {
      const id = requireProfileId(profileId);
      const { error } = await client
        .from(PROFILE_TABLE)
        .update({ memory_enabled: enabled, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    },

    async loadHistory(profileId: string, limit: number): Promise<PersonalAssistantMessage[]> {
      const id = requireProfileId(profileId);
      const bounded = Math.max(1, Math.min(50, Math.trunc(limit)));

      const { data, error } = await client
        .from(MESSAGE_TABLE)
        .select('role, content, created_at')
        .eq('profile_id', id)
        .order('created_at', { ascending: false })
        .limit(bounded);

      if (error) throw error;

      return (Array.isArray(data) ? data : [])
        .reverse()
        .map((row) => {
          const record = row as Record<string, unknown>;
          return {
            role: normalizeRole(record.role),
            content: normalizeContent(record.content),
          };
        })
        .filter((message) => Boolean(message.content));
    },

    async appendMessage(input: AppendMessageInput): Promise<void> {
      const profileId = requireProfileId(input.profileId);
      const content = normalizeContent(input.content);
      if (!content) return;

      const { error } = await client.from(MESSAGE_TABLE).upsert(
        {
          profile_id: profileId,
          message_id: sanitizeMessageId(input.messageId),
          role: normalizeRole(input.role),
          content,
          language: input.language || null,
          metadata: input.metadata || {},
        },
        { onConflict: 'profile_id,message_id', ignoreDuplicates: true }
      );

      if (error) throw error;
    },

    async listMemories(profileId: string): Promise<PersonalAssistantMemory[]> {
      const id = requireProfileId(profileId);

      const { data, error } = await client
        .from(MEMORY_TABLE)
        .select('id, content, updated_at, created_at')
        .eq('profile_id', id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      return (Array.isArray(data) ? data : [])
        .map((row) => {
          const record = row as Record<string, unknown>;
          return {
            id: String(record.id),
            content: normalizeContent(record.content),
            updatedAt:
              typeof record.updated_at === 'string'
                ? record.updated_at
                : typeof record.created_at === 'string'
                  ? record.created_at
                  : null,
          };
        })
        .filter((memory) => Boolean(memory.content));
    },

    async rememberMemory(
      profileId: string,
      content: string,
      sourceMessageId: string
    ): Promise<void> {
      const id = requireProfileId(profileId);
      const normalized = normalizeContent(content);
      if (!normalized) return;

      const { error } = await client.from(MEMORY_TABLE).insert({
        profile_id: id,
        content: normalized,
        status: 'active',
        source_message_id: sanitizeMessageId(sourceMessageId),
      });

      if (error) throw error;
    },

    async updateLatestMemory(profileId: string, content: string): Promise<boolean> {
      const id = requireProfileId(profileId);
      const normalized = normalizeContent(content);
      if (!normalized) return false;

      const { data, error } = await client
        .from(MEMORY_TABLE)
        .select('id')
        .eq('profile_id', id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data || typeof (data as Record<string, unknown>).id !== 'string') return false;

      const memoryId = String((data as Record<string, unknown>).id);
      const { error: updateError } = await client
        .from(MEMORY_TABLE)
        .update({ content: normalized, updated_at: new Date().toISOString() })
        .eq('id', memoryId)
        .eq('profile_id', id);

      if (updateError) throw updateError;
      return true;
    },

    async forgetMemory(profileId: string, query: string | null): Promise<number> {
      const id = requireProfileId(profileId);
      const active = await client
        .from(MEMORY_TABLE)
        .select('id, content, created_at')
        .eq('profile_id', id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(200);

      if (active.error) throw active.error;

      const rows = (Array.isArray(active.data) ? active.data : []).map(
        (row) => row as Record<string, unknown>
      );
      const normalizedQuery = (query || '').replace(/\s+/g, ' ').trim().toLowerCase();

      const targets = normalizedQuery
        ? rows.filter((row) =>
            String(row.content || '')
              .toLowerCase()
              .includes(normalizedQuery)
          )
        : rows.slice(0, 1);

      if (targets.length === 0) return 0;

      const ids = targets.map((row) => String(row.id)).filter(Boolean);
      if (ids.length === 0) return 0;

      const { error } = await client
        .from(MEMORY_TABLE)
        .update({ status: 'forgotten', updated_at: new Date().toISOString() })
        .eq('profile_id', id)
        .in('id', ids);

      if (error) throw error;
      return ids.length;
    },

    async buildMemoryContext(profileId: string): Promise<string | null> {
      const id = requireProfileId(profileId);
      const { data, error } = await client
        .from(MEMORY_TABLE)
        .select('content, updated_at, created_at')
        .eq('profile_id', id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const memories = (Array.isArray(data) ? data : [])
        .map((row) => {
          const record = row as Record<string, unknown>;
          return {
            content: normalizeContent(record.content),
            updatedAt:
              typeof record.updated_at === 'string'
                ? record.updated_at
                : typeof record.created_at === 'string'
                  ? record.created_at
                  : null,
          };
        })
        .filter((memory) => Boolean(memory.content));

      return buildPersonalAssistantMemoryContext(memories);
    },
  };
}

export function createServiceRolePersonalAssistantStore(): PersonalAssistantStore | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  const client = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return createPersonalAssistantStore(client);
}
