import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import {
  loadConversationTranscript,
  redactPersonalData,
} from '@/lib/analytics/pierrotIntelligence';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminFromRequest(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const conversationId = new URL(request.url).searchParams.get('conversation') || '';

  if (!/^[A-Za-z0-9_-]{8,64}$/.test(conversationId)) {
    return NextResponse.json({ error: 'Invalid conversation id.' }, { status: 400 });
  }

  try {
    const transcript = await loadConversationTranscript(conversationId);

    if (!transcript) {
      return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
    }

    const payload = {
      exported_at: new Date().toISOString(),
      retention_days: 90,
      conversation: {
        id: transcript.conversation.id,
        status: transcript.conversation.status,
        language: transcript.conversation.language,
        start_page: transcript.conversation.start_page,
        started_at: transcript.conversation.started_at,
        ended_at: transcript.conversation.ended_at,
      },
      messages: transcript.messages.map((message) => ({
        id: message.id,
        role: message.role,
        message_index: message.message_index,
        provider: message.provider,
        created_at: message.created_at,
        content: redactPersonalData(message.content),
      })),
      events: transcript.events,
      subscription_events: transcript.subscriptionEvents,
      service_lead: transcript.lead
        ? {
            id: transcript.lead.id,
            status: transcript.lead.status,
            need_type: transcript.lead.need_type,
            stage: transcript.lead.stage,
            timeline: transcript.lead.timeline,
            summary: transcript.lead.summary,
            created_at: transcript.lead.created_at,
            submitted_at: transcript.lead.submitted_at,
          }
        : null,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="pierrot-${conversationId.slice(-10)}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[admin/pierrot/export] failed:', error);
    return NextResponse.json({ error: 'Export failed.' }, { status: 500 });
  }
}
