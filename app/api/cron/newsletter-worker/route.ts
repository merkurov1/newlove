
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { sendNewsletterToSubscriber } from '@/lib/newsletter/sendNewsletterToSubscriber';
import { renderNewsletterEmail } from '@/emails/NewsletterEmail';
import { createId } from '@paralleldrive/cuid2';

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 2000;
const EMAIL_DELAY_MS = 600;

interface NewsletterLog {
  id: string;
  job_id: string;
  subscriber_id: string;
  status: 'sent' | 'failed' | 'bounced' | 'skipped';
  error_message?: string;
  provider_id?: string | null;
  provider_response?: unknown;
  sent_at: string;
}

export async function GET(request: Request) {
  return handleWorker(request);
}

export async function POST(request: Request) {
  return handleWorker(request);
}

async function handleWorker(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 },
    );
  }

  const supabase = getServerSupabaseClient({
    useServiceRole: true,
  });

  try {
    const { data: pendingJobs, error: jobsError } = await supabase
      .from('newsletter_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);

    if (jobsError) {
      console.error('[Newsletter Worker] Job lookup failed:', jobsError);
      return NextResponse.json(
        { error: 'Database error' },
        { status: 500 },
      );
    }

    if (!pendingJobs?.length) {
      return NextResponse.json({
        message: 'No pending jobs',
        processed: 0,
      });
    }

    const job = pendingJobs[0];

    // Atomic claim: another worker cannot claim the same pending job.
    const { data: claimedJob, error: claimError } = await supabase
      .from('newsletter_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (claimError || !claimedJob) {
      return NextResponse.json(
        { message: 'Job was already claimed', processed: 0 },
        { status: 409 },
      );
    }

    const { data: letter, error: letterError } = await supabase
      .from('letters')
      .select(
        'id,title,slug,content,published,kind,html_email,text_email,status,sent_at,sentAt',
      )
      .eq('id', job.letter_id)
      .maybeSingle();

    if (letterError || !letter) {
      await supabase
        .from('newsletter_jobs')
        .update({
          status: 'failed',
          error_message: 'Letter not found',
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      return NextResponse.json(
        { error: 'Letter not found' },
        { status: 404 },
      );
    }

    if (!letter.published) {
      await supabase
        .from('newsletter_jobs')
        .update({
          status: 'failed',
          error_message: 'Cannot send an unpublished letter',
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      return NextResponse.json(
        { error: 'Letter is not published' },
        { status: 409 },
      );
    }

    if (letter.kind === 'issue' && letter.status !== 'published') {
      await supabase
        .from('newsletter_jobs')
        .update({
          status: 'failed',
          error_message: 'Cannot send an unpublished Flow issue',
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      return NextResponse.json(
        { error: 'Issue is not published' },
        { status: 409 },
      );
    }

    // Protect against duplicate jobs for the same issue.
    // A test send must not set sent_at.
    if (letter.kind === 'issue' && letter.sent_at) {
      await supabase
        .from('newsletter_jobs')
        .update({
          status: 'failed',
          error_message: 'This issue has already been sent',
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      return NextResponse.json(
        { error: 'Issue has already been sent' },
        { status: 409 },
      );
    }

    const { data: subscribers, error: subsError } = await supabase
      .from('subscribers')
      .select('id,email')
      .eq('isActive', true);

    if (subsError) {
      await supabase
        .from('newsletter_jobs')
        .update({
          status: 'failed',
          error_message: 'Failed to fetch subscribers',
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      return NextResponse.json(
        { error: 'Failed to fetch subscribers' },
        { status: 500 },
      );
    }

    if (!subscribers?.length) {
      await supabase
        .from('newsletter_jobs')
        .update({
          status: 'completed',
          total_count: 0,
          sent_count: 0,
          failed_count: 0,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      return NextResponse.json({
        message: 'No active subscribers',
        processed: 0,
      });
    }

    await supabase
      .from('newsletter_jobs')
      .update({ total_count: subscribers.length })
      .eq('id', job.id);

    let emailHtml = '';

    if (letter.kind === 'issue') {
      emailHtml = letter.html_email || '';

      if (!emailHtml) {
        await supabase
          .from('newsletter_jobs')
          .update({
            status: 'failed',
            error_message: 'Flow issue has no stored email HTML',
            completed_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        return NextResponse.json(
          { error: 'Issue email snapshot is missing' },
          { status: 409 },
        );
      }
    } else {
      try {
        emailHtml = renderNewsletterEmail(letter, '') || '';
      } catch (error) {
        console.error('[Newsletter Worker] Email rendering failed:', error);
      }
    }

    const letterObj = {
      id: letter.id,
      title: letter.title,
      content: letter.content,
      html: emailHtml,
      text: letter.kind === 'issue' ? letter.text_email || '' : '',
      kind: letter.kind || 'letter',
    };

    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
      const batch = subscribers.slice(i, i + BATCH_SIZE);
      const logs: NewsletterLog[] = [];

      for (const subscriber of batch) {
        try {
          const token = createId();
          const now = new Date();
          const expiresAt = new Date(
            now.getTime() + 7 * 24 * 60 * 60 * 1000,
          );

          const { error: tokenError } = await supabase
            .from('subscriber_tokens')
            .insert({
              subscriber_id: subscriber.id,
              type: 'unsubscribe',
              token,
              created_at: now.toISOString(),
              expires_at: expiresAt.toISOString(),
            });

          if (tokenError) {
            console.warn(
              '[Newsletter Worker] Token insert warning:',
              tokenError.message,
            );
          }

          const result = await sendNewsletterToSubscriber(
            subscriber,
            letterObj,
            {
              token,
              skipTokenInsert: true,
            },
          );

          if (result.status === 'sent' || result.status === 'skipped') {
            sentCount++;

            logs.push({
              id: createId(),
              job_id: job.id,
              subscriber_id: subscriber.id,
              status: result.status === 'sent' ? 'sent' : 'skipped',
              provider_id: result.providerResponse?.id || null,
              provider_response: result.providerResponse || null,
              sent_at: new Date().toISOString(),
            });
          } else {
            failedCount++;

            logs.push({
              id: createId(),
              job_id: job.id,
              subscriber_id: subscriber.id,
              status: 'failed',
              error_message: result.error || 'Unknown send error',
              provider_response: result.providerDetails || null,
              sent_at: new Date().toISOString(),
            });
          }
        } catch (error) {
          failedCount++;

          logs.push({
            id: createId(),
            job_id: job.id,
            subscriber_id: subscriber.id,
            status: 'failed',
            error_message:
              error instanceof Error ? error.message : String(error),
            sent_at: new Date().toISOString(),
          });
        }

        await new Promise((resolve) =>
          setTimeout(resolve, EMAIL_DELAY_MS),
        );
      }

      if (logs.length) {
        const { error: logError } = await supabase
          .from('newsletter_logs')
          .insert(logs);

        if (logError) {
          console.error('[Newsletter Worker] Log insert failed:', logError);
        }
      }

      await supabase
        .from('newsletter_jobs')
        .update({
          sent_count: sentCount,
          failed_count: failedCount,
        })
        .eq('id', job.id);

      if (i + BATCH_SIZE < subscribers.length) {
        await new Promise((resolve) =>
          setTimeout(resolve, BATCH_DELAY_MS),
        );
      }
    }

    const completedAt = new Date().toISOString();

    if (letter.kind === 'issue' && sentCount > 0) {
      // sent_at is canonical for Flow issue send tracking.
      await supabase
        .from('letters')
        .update({ sent_at: completedAt })
        .eq('id', letter.id)
        .is('sent_at', null);
    } else if (letter.kind !== 'issue' && sentCount > 0) {
      // Preserve the existing field used by regular letters.
      await supabase
        .from('letters')
        .update({ sentAt: completedAt })
        .eq('id', letter.id);
    }

    await supabase
      .from('newsletter_jobs')
      .update({
        status: 'completed',
        sent_count: sentCount,
        failed_count: failedCount,
        completed_at: completedAt,
      })
      .eq('id', job.id);

    return NextResponse.json({
      message: 'Job completed',
      jobId: job.id,
      letterId: job.letter_id,
      totalSubscribers: subscribers.length,
      sent: sentCount,
      failed: failedCount,
      successRate:
        subscribers.length > 0
          ? `${((sentCount / subscribers.length) * 100).toFixed(2)}%`
          : '0%',
    });
  } catch (error) {
    console.error('[Newsletter Worker] Unexpected error:', error);

    return NextResponse.json(
      {
        error: 'Worker failed',
        details:
          error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
