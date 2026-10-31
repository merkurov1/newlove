import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/pierrot/serviceInquiryStore');

import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  advanceServiceInquiryState,
  buildServiceSummary,
  markServiceQuestionAsked,
  type ServiceInquiryState,
  type ServiceLeadStatus,
  type ServiceNeed,
  type ServiceStage,
  type ServiceTimeline,
} from '@/lib/pierrot/serviceInquiry';
import { persistenceFailure, recordPierrotEvent } from '@/lib/pierrot/serverStore';
import type { PierrotServerEventName } from '@/lib/pierrot/conversation';

export type ServiceLeadRecord = {
  id: string;
  conversation_id: string;
  status: ServiceLeadStatus;
  need_type: ServiceNeed | null;
  stage: ServiceStage | null;
  timeline: ServiceTimeline | null;
  questions_asked: number;
  next_question: 'need' | 'stage' | 'timeline' | null;
  last_message_id: string | null;
  summary: string | null;
  contact_name: string | null;
  contact_email: string | null;
  consent_at: string | null;
  submitted_at: string | null;
};

export type ServiceLeadSummary = {
  id: string;
  status: ServiceLeadStatus;
  needType: ServiceNeed | null;
  stage: ServiceStage | null;
  timeline: ServiceTimeline | null;
  summary: string;
  questionsAsked: number;
};

function rowToState(row: ServiceLeadRecord): ServiceInquiryState {
  return {
    id: row.id,
    status: row.status,
    needType: row.need_type,
    stage: row.stage,
    timeline: row.timeline,
    questionsAsked: Number(row.questions_asked) || 0,
    qualified:
      row.status === 'qualified' ||
      row.status === 'contact_requested' ||
      row.status === 'contacted' ||
      row.status === 'closed',
    nextQuestion: row.next_question,
    summary:
      row.summary ||
      buildServiceSummary({
        needType: row.need_type,
        stage: row.stage,
        timeline: row.timeline,
      }),
  };
}

export function toServiceLeadSummary(row: ServiceLeadRecord): ServiceLeadSummary {
  const state = rowToState(row);

  return {
    id: state.id,
    status: state.status,
    needType: state.needType,
    stage: state.stage,
    timeline: state.timeline,
    summary: state.summary,
    questionsAsked: state.questionsAsked,
  };
}

async function loadLeadByConversation(
  store: SupabaseClient,
  conversationId: string
): Promise<{ row: ServiceLeadRecord | null; error: unknown }> {
  const { data, error } = await store
    .from('art_service_leads')
    .select('*')
    .eq('conversation_id', conversationId)
    .maybeSingle();

  return {
    row: data ? (data as ServiceLeadRecord) : null,
    error,
  };
}

async function createLead(
  store: SupabaseClient,
  conversationId: string
): Promise<ServiceLeadRecord> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const { data, error } = await store
    .from('art_service_leads')
    .insert({
      id,
      conversation_id: conversationId,
      status: 'new',
      questions_asked: 0,
      next_question: null,
      last_message_id: null,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .maybeSingle();

  if (error) {
    // A concurrent request may have created the row first.
    if ((error as { code?: string }).code === '23505') {
      const again = await loadLeadByConversation(store, conversationId);
      if (again.row) return again.row;
    }
    throw error;
  }

  if (!data) throw new Error('art_service_leads insert returned no row');

  return data as ServiceLeadRecord;
}

async function saveState(
  store: SupabaseClient,
  state: ServiceInquiryState,
  userMessageId: string
): Promise<void> {
  const { error } = await store
    .from('art_service_leads')
    .update({
      status: state.status,
      need_type: state.needType,
      stage: state.stage,
      timeline: state.timeline,
      questions_asked: state.questionsAsked,
      next_question: state.nextQuestion,
      last_message_id: userMessageId,
      summary: state.summary,
      updated_at: new Date().toISOString(),
    })
    .eq('id', state.id);

  if (error) throw error;
}

export async function recordServiceInquiryEvent(
  store: SupabaseClient,
  conversationId: string,
  eventName: PierrotServerEventName,
  eventKey: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const { data, error } = await store
      .from('pierrot_conversations')
      .select('session_id')
      .eq('id', conversationId)
      .maybeSingle();

    if (error || !data || typeof data.session_id !== 'string') return;

    await recordPierrotEvent(store, {
      conversationId,
      sessionId: data.session_id,
      eventName,
      eventKey,
      payload,
    });
  } catch (error) {
    persistenceFailure(error, 'service_inquiry_event');
  }
}

/**
 * Advances a qualification lead by at most one step per message. The model is
 * not involved: need, stage and timeline are parsed deterministically, and
 * `qualified` requires both a need and a stage.
 */
export async function advanceStoredServiceInquiry({
  store,
  conversationId,
  message,
  userMessageId,
}: {
  store: SupabaseClient;
  conversationId: string;
  message: string;
  userMessageId: string;
}): Promise<ServiceInquiryState | null> {
  const loaded = await loadLeadByConversation(store, conversationId);

  if (loaded.error) throw loaded.error;

  let created = false;
  let row = loaded.row;

  if (!row) {
    row = await createLead(store, conversationId);
    created = true;
  }

  // HTTP retries reuse the same user message id. Do not advance the lead a
  // second time or ask another question for the same turn.
  if (row.last_message_id === userMessageId) {
    return rowToState(row);
  }

  const before = rowToState(row);
  let state = advanceServiceInquiryState(before, message);

  if (state.nextQuestion) {
    state = markServiceQuestionAsked(state);
  }

  await saveState(store, state, userMessageId);

  if (created) {
    await recordServiceInquiryEvent(
      store,
      conversationId,
      'service_inquiry_started',
      `service_inquiry_started:${state.id}`,
      {
        lead_id: state.id,
        source: 'pierrot',
      }
    );
  }

  if (!before.needType && state.needType) {
    await recordServiceInquiryEvent(
      store,
      conversationId,
      'service_need_selected',
      `service_need_selected:${state.id}`,
      {
        lead_id: state.id,
        need_type: state.needType,
      }
    );
  }

  if (!before.qualified && state.qualified) {
    await recordServiceInquiryEvent(
      store,
      conversationId,
      'service_inquiry_qualified',
      `service_inquiry_qualified:${state.id}`,
      {
        lead_id: state.id,
        need_type: state.needType,
        stage: state.stage,
        has_timeline: Boolean(state.timeline),
      }
    );
  }

  return state;
}

export async function getServiceLeadSummaryById(
  store: SupabaseClient,
  leadId: string
): Promise<ServiceLeadSummary | null> {
  const { data, error } = await store
    .from('art_service_leads')
    .select('id, status, need_type, stage, timeline, summary, questions_asked')
    .eq('id', leadId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return toServiceLeadSummary(data as ServiceLeadRecord);
}

export async function getServiceLeadForContact(
  store: SupabaseClient,
  leadId: string
): Promise<ServiceLeadRecord | null> {
  const { data, error } = await store
    .from('art_service_leads')
    .select('*')
    .eq('id', leadId)
    .maybeSingle();

  if (error) throw error;
  return data ? (data as ServiceLeadRecord) : null;
}

export async function saveServiceLeadContact({
  store,
  leadId,
  name,
  email,
}: {
  store: SupabaseClient;
  leadId: string;
  name: string;
  email: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await store
    .from('art_service_leads')
    .update({
      status: 'contact_requested',
      contact_name: name || null,
      contact_email: email,
      consent_at: now,
      submitted_at: now,
      updated_at: now,
    })
    .eq('id', leadId);

  if (error) throw error;
}
