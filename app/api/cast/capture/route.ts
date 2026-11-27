import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  verifyCastCaptureTokenDetailed,
} from '@/lib/cast/captureToken';
import { consumeDistributedRateLimit } from '@/lib/cast/rateLimitServer';
import { sendCastResultEmail } from '@/lib/cast/sendCastResultEmail';
import { getClientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(sbUrl, sbKey);

const CAPTURE_RATE_LIMIT = { limit: 6, windowSeconds: 60 * 60 };

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

type CaptureRecord = {
  id: string;
  created_at: string;
  archetype?: string | null;
  language?: string | null;
  analysis?: Record<string, unknown> | null;
  capture_consumed_at?: string | null;
};

function analysisStrings(analysis: Record<string, unknown> | null | undefined) {
  const summary =
    typeof analysis?.executive_summary === 'string'
      ? analysis.executive_summary
      : null;
  const directive =
    typeof analysis?.strategic_directive === 'string'
      ? analysis.strategic_directive
      : null;
  const agencyIndex =
    typeof analysis?.agency_index === 'number'
      ? analysis.agency_index
      : null;

  return { summary, directive, agencyIndex };
}

export async function POST(req: Request) {
  const limited = await consumeDistributedRateLimit(supabase, {
    scope: 'cast:capture',
    identifier: `ip:${getClientIp(req)}`,
    ...CAPTURE_RATE_LIMIT,
  });

  if (!limited.allowed) {
    return NextResponse.json(
      {
        error:
          'Too many capture requests. Please wait before trying again.',
        code: 'rate_limited',
        retryAfter: limited.retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(limited.retryAfterSeconds),
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  try {
    let body: any;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body.' },
        { status: 400 }
      );
    }

    const recordId =
      typeof body?.recordId === 'string'
        ? body.recordId.trim()
        : '';

    const email =
      typeof body?.email === 'string'
        ? body.email.trim().toLowerCase()
        : '';
    const captureToken = body?.captureToken;

    if (!recordId || !email || typeof captureToken !== 'string') {
      return NextResponse.json(
        { error: 'Missing data.' },
        { status: 400 }
      );
    }

    if (email.length > 254 || !isValidEmail(email)) {
      return NextResponse.json(
        { error: 'Invalid email address.' },
        { status: 400 }
      );
    }

    const { data: existingRecord, error: lookupError } = await supabase
      .from('casts')
      .select(
        'id, created_at, archetype, language, analysis, capture_consumed_at'
      )
      .eq('id', recordId)
      .maybeSingle();

    if (lookupError) {
      console.error('[Cast Capture] Lookup error:', {
        code: lookupError.code,
      });

      return NextResponse.json(
        { error: 'Could not locate the protocol record.' },
        { status: 500 }
      );
    }

    if (!existingRecord) {
      return NextResponse.json(
        { error: 'Protocol record not found.' },
        { status: 404 }
      );
    }

    const record = existingRecord as CaptureRecord;

    // A capture token is only valid for a limited time; after that another
    // reading (and a new token) is required.
    const verification = verifyCastCaptureTokenDetailed(
      captureToken,
      record.id,
      record.created_at
    );

    if (!verification.valid) {
      return NextResponse.json(
        {
          error:
            verification.reason === 'expired'
              ? 'This capture link has expired. Run the reading again to receive a new one.'
              : 'Invalid capture authorization.',
          code:
            verification.reason === 'expired'
              ? 'capture_token_expired'
              : 'capture_token_invalid',
        },
        { status: 403 }
      );
    }

    if (record.capture_consumed_at) {
      return NextResponse.json(
        {
          error:
            'This reading has already been linked to an email address.',
          code: 'capture_already_consumed',
        },
        { status: 409 }
      );
    }

    /*
     * Single-use consumption is enforced by the database, not by a read-then-
     * write in the application. Only one concurrent request can move
     * `capture_consumed_at` from null to a timestamp.
     */
    const consumedAt = new Date().toISOString();
    const { data: consumed, error: consumeError } = await supabase
      .from('casts')
      .update({
        email,
        status: 'identified',
        capture_consumed_at: consumedAt,
        capture_token_nonce: verification.nonce,
        capture_token_expires_at: verification.expiresAt,
      })
      .eq('id', recordId)
      .is('capture_consumed_at', null)
      .select('id');

    if (consumeError) {
      if (
        consumeError.code === '42703' ||
        consumeError.code === 'PGRST204'
      ) {
        // Older schema: the email update still works, replay protection falls
        // back to the token TTL only. Report the degraded state honestly.
        const { error: legacyError } = await supabase
          .from('casts')
          .update({ email, status: 'identified' })
          .eq('id', recordId);

        if (legacyError) {
          console.error('[Cast Capture] DB update error:', {
            code: legacyError.code,
          });

          return NextResponse.json(
            { error: 'Could not secure the protocol record.' },
            { status: 500 }
          );
        }
      } else {
        console.error('[Cast Capture] DB update error:', {
          code: consumeError.code,
        });

        return NextResponse.json(
          { error: 'Could not secure the protocol record.' },
          { status: 500 }
        );
      }
    } else if (!Array.isArray(consumed) || consumed.length === 0) {
      return NextResponse.json(
        {
          error:
            'This reading has already been linked to an email address.',
          code: 'capture_already_consumed',
        },
        { status: 409 }
      );
    }

    const parts = analysisStrings(record.analysis);
    const delivery = await sendCastResultEmail({
      email,
      locale: record.language === 'ru' ? 'ru' : 'en',
      archetype:
        typeof record.archetype === 'string'
          ? record.archetype
          : 'CAST',
      agencyIndex: parts.agencyIndex,
      summary: parts.summary,
      directive: parts.directive,
    });

    if (delivery.status === 'sent') {
      try {
        await supabase
          .from('casts')
          .update({
            email_delivery_status: 'sent',
            email_delivered_at: new Date().toISOString(),
          })
          .eq('id', recordId);
      } catch {
        // Delivery already happened; a bookkeeping failure must not turn a
        // successful send into an error for the reader.
      }

      return NextResponse.json({
        success: true,
        emailDelivered: true,
      });
    }

    if (delivery.status === 'not_configured') {
      /*
       * The record is linked, but no message was sent. The UI must not claim a
       * copy was delivered, so the response says exactly that.
       */
      return NextResponse.json(
        {
          success: true,
          emailDelivered: false,
          code: 'email_delivery_not_configured',
          message:
            'The reading is linked to your email, but email delivery is not enabled on this server yet.',
        },
        { status: 202 }
      );
    }

    await supabase
      .from('casts')
      .update({ email_delivery_status: 'failed' })
      .eq('id', recordId);

    return NextResponse.json(
      {
        success: true,
        emailDelivered: false,
        code: 'email_delivery_failed',
        message:
          'The reading is linked to your email, but the provider could not deliver the message.',
      },
      { status: 502 }
    );
  } catch (error) {
    console.error('[Cast Capture] Fatal error', {
      message: error instanceof Error ? error.message : 'unknown',
    });

    return NextResponse.json(
      {
        error: 'Internal Core Error.',
      },
      {
        status: 500,
      }
    );
  }
}
