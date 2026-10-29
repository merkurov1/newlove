import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import {
  getServiceLeadForContact,
  getServiceLeadSummaryById,
  recordServiceInquiryEvent,
  saveServiceLeadContact,
} from '@/lib/pierrot/serviceInquiryStore';
import { notifyServiceInquiry } from '@/lib/advising/notifyServiceInquiry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LeadIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const ContactSchema = z.object({
  leadId: LeadIdSchema,
  name: z.string().trim().max(100).optional().default(''),
  email: z.string().trim().email().max(254),
  consent: z.literal(true),
});

function client() {
  return getServerSupabaseClient({ useServiceRole: true });
}

export async function GET(request: Request) {
  const limited = checkRateLimit(getClientIp(request), {
    interval: 60 * 1000,
    maxRequests: 60,
    keyPrefix: 'advising-inquiry-read',
  });
  if (limited) return limited;

  const leadId = new URL(request.url).searchParams.get('lead') || '';

  if (!LeadIdSchema.safeParse(leadId).success) {
    return NextResponse.json({ error: 'Invalid request reference.' }, { status: 400 });
  }

  try {
    const store = client();
    const lead = await getServiceLeadSummaryById(store, leadId);

    if (!lead) {
      return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
    }

    return NextResponse.json({
      lead: {
        id: lead.id,
        status: lead.status,
        needType: lead.needType,
        stage: lead.stage,
        timeline: lead.timeline,
        summary: lead.summary,
        canSubmit: lead.status === 'qualified',
        alreadySubmitted:
          lead.status === 'contact_requested' ||
          lead.status === 'contacted' ||
          lead.status === 'closed',
      },
    });
  } catch (error) {
    console.error('Service inquiry lookup failed:', error);
    return NextResponse.json({ error: 'Request unavailable.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const limited = checkRateLimit(getClientIp(request), {
    interval: 60 * 60 * 1000,
    maxRequests: 10,
    keyPrefix: 'advising-inquiry-submit',
  });
  if (limited) return limited;

  const parsed = ContactSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please check the contact details and consent.' },
      { status: 400 }
    );
  }

  const { leadId, name, email } = parsed.data;

  try {
    const store = client();
    const lead = await getServiceLeadForContact(store, leadId);

    if (!lead) {
      return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
    }

    if (
      lead.status === 'contact_requested' ||
      lead.status === 'contacted' ||
      lead.status === 'closed'
    ) {
      return NextResponse.json({
        ok: true,
        status: lead.status,
        alreadySubmitted: true,
        notified: false,
      });
    }

    if (lead.status !== 'qualified') {
      return NextResponse.json(
        { error: 'This request is not qualified for contact yet.' },
        { status: 409 }
      );
    }

    await saveServiceLeadContact({
      store,
      leadId,
      name,
      email,
    });

    await recordServiceInquiryEvent(
      store,
      lead.conversation_id,
      'service_contact_consent',
      `service_contact_consent:${leadId}`,
      { lead_id: leadId, need_type: lead.need_type }
    );

    await recordServiceInquiryEvent(
      store,
      lead.conversation_id,
      'service_inquiry_submitted',
      `service_inquiry_submitted:${leadId}`,
      { lead_id: leadId, need_type: lead.need_type, has_timeline: Boolean(lead.timeline) }
    );

    const notified = await notifyServiceInquiry({
      leadId,
      needType: lead.need_type,
      stage: lead.stage,
      timeline: lead.timeline,
      name,
      email,
    });

    await recordServiceInquiryEvent(
      store,
      lead.conversation_id,
      'service_inquiry_received',
      `service_inquiry_received:${leadId}`,
      { lead_id: leadId, notified }
    );

    return NextResponse.json({
      ok: true,
      status: 'contact_requested',
      alreadySubmitted: false,
      notified,
    });
  } catch (error) {
    console.error('Service inquiry submission failed:', error);
    return NextResponse.json(
      { error: 'The request could not be saved. Please try again.' },
      { status: 500 }
    );
  }
}
