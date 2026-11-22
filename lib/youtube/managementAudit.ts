import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';

import { YOUTUBE_MANAGEMENT_ACTIONS, type YouTubeManagementAction } from './management';

assertServerOnly('lib/youtube/managementAudit');

export type YouTubeManagementAuditInput = {
  userId: string;
  project: string;
  action: YouTubeManagementAction;
  status: 'completed' | 'failed' | 'confirmation_required' | 'scope_missing';
  channelId?: string | null;
  targetId?: string | null;
  errorCode?: string | null;
};

/**
 * Append-only operation outcome log. It stores identifiers and status only:
 * never video descriptions, comment text, caption bodies, file contents,
 * OAuth codes or tokens. A logging failure never changes the operation result.
 */
export async function recordYouTubeManagementAudit(
  store: SupabaseClient,
  input: YouTubeManagementAuditInput
): Promise<void> {
  try {
    const definition = YOUTUBE_MANAGEMENT_ACTIONS[input.action];
    const { error } = await store.from('youtube_management_audit').insert({
      actor_id: input.userId.slice(0, 200),
      project: input.project.slice(0, 40),
      action: input.action,
      status: input.status,
      channel_id: input.channelId?.slice(0, 200) ?? null,
      target_id: input.targetId?.slice(0, 200) ?? null,
      destructive: definition.destructive,
      external: definition.external,
      error_code: input.errorCode?.slice(0, 120) ?? null,
    });

    if (error) {
      console.error('[YouTube management] audit write failed');
    }
  } catch {
    console.error('[YouTube management] audit write failed');
  }
}
