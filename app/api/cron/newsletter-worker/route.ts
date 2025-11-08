export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Maximum 60 seconds for Vercel Hobby plan

import { NextResponse } from 'next/server';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { sendNewsletterToSubscriber } from '@/lib/newsletter/sendNewsletterToSubscriber';
import { renderNewsletterEmail } from '@/emails/NewsletterEmail';
import { createId } from '@paralleldrive/cuid2';

/**
 * Type for newsletter log entries
 */
interface NewsletterLog {
  id: string;
  job_id: string;
  subscriber_id: string;
  status: 'sent' | 'failed' | 'bounced' | 'skipped';
  error_message?: string;
  provider_id?: string | null;
  provider_response?: any;
  sent_at: string;
}

/**
 * Newsletter Worker API Route
 * 
 * Purpose: Process pending newsletter jobs in background
 * 
 * How it works:
 * 1. Find pending jobs (status='pending')
 * 2. Mark job as 'processing'
 * 3. Get active subscribers
 * 4. Send emails in batches of 10 (rate limiting)
 * 5. Log each send to newsletter_logs
 * 6. Update job status to 'completed' or 'failed'
 * 
 * Trigger:
 * - Cron: Every minute via Vercel Cron
 * - Manual: POST https://merkurov.love/api/cron/newsletter-worker
 * 
 * Security:
 * - Protected by CRON_SECRET env variable
 */

const BATCH_SIZE = 10; // Send 10 emails per batch
const BATCH_DELAY_MS = 2000; // 2 second delay between batches (rate limiting)

export async function GET(request: Request) {
  return handleWorker(request);
}

export async function POST(request: Request) {
  return handleWorker(request);
}

async function handleWorker(request: Request) {
  // Verify authorization
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.warn('Unauthorized newsletter worker attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.info('[Newsletter Worker] Starting...');

  try {
    const supabase = getServerSupabaseClient({ useServiceRole: true });
    
    // Find pending jobs
    const { data: pendingJobs, error: jobsError } = await supabase
      .from('newsletter_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1); // Process one job at a time

    if (jobsError) {
      console.error('[Newsletter Worker] Error fetching jobs:', jobsError);
      return NextResponse.json({ error: 'Database error', details: jobsError }, { status: 500 });
    }

    if (!pendingJobs || pendingJobs.length === 0) {
      console.info('[Newsletter Worker] No pending jobs');
      return NextResponse.json({ message: 'No pending jobs', processed: 0 });
    }

    const job = pendingJobs[0];
    console.info(`[Newsletter Worker] Processing job ${job.id} for letter ${job.letter_id}`);

    // Mark job as processing
    await supabase
      .from('newsletter_jobs')
      .update({ 
        status: 'processing', 
        started_at: new Date().toISOString() 
      })
      .eq('id', job.id);

    // Get letter data
    const { data: letter, error: letterError } = await supabase
      .from('letters')
      .select('id, title, slug, content, published')
      .eq('id', job.letter_id)
      .single();

    if (letterError || !letter) {
      console.error('[Newsletter Worker] Letter not found:', letterError);
      await supabase
        .from('newsletter_jobs')
        .update({ 
          status: 'failed', 
          error_message: 'Letter not found',
          completed_at: new Date().toISOString()
        })
        .eq('id', job.id);
      return NextResponse.json({ error: 'Letter not found' }, { status: 404 });
    }

    // Get active subscribers
    const { data: subscribers, error: subsError } = await supabase
      .from('subscribers')
      .select('id, email')
      .eq('isActive', true);

    if (subsError) {
      console.error('[Newsletter Worker] Error fetching subscribers:', subsError);
      await supabase
        .from('newsletter_jobs')
        .update({ 
          status: 'failed', 
          error_message: 'Failed to fetch subscribers',
          completed_at: new Date().toISOString()
        })
        .eq('id', job.id);
      return NextResponse.json({ error: 'Failed to fetch subscribers' }, { status: 500 });
    }

    if (!subscribers || subscribers.length === 0) {
      console.warn('[Newsletter Worker] No active subscribers');
      await supabase
        .from('newsletter_jobs')
        .update({ 
          status: 'completed',
          total_count: 0,
          sent_count: 0,
          completed_at: new Date().toISOString()
        })
        .eq('id', job.id);
      return NextResponse.json({ message: 'No active subscribers', processed: 0 });
    }

    // Update total count
    await supabase
      .from('newsletter_jobs')
      .update({ total_count: subscribers.length })
      .eq('id', job.id);

    // Prepare letter object
    const letterObj = {
      id: letter.id,
      title: letter.title,
      content: letter.content,
      html: (() => {
        try { 
          return renderNewsletterEmail(letter, ''); 
        } catch (e) { 
          console.error('Failed to render email:', e);
          return ''; 
        }
      })(),
    };

    let sentCount = 0;
    let failedCount = 0;
    const logs: NewsletterLog[] = [];

    // Process subscribers in batches
    for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
      const batch = subscribers.slice(i, i + BATCH_SIZE);
      console.info(`[Newsletter Worker] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}, subscribers ${i + 1}-${Math.min(i + BATCH_SIZE, subscribers.length)}`);

      // Send emails in parallel within batch
      const batchPromises = batch.map(async (subscriber) => {
        try {
          // Generate unique unsubscribe token
          const unsubToken = createId();
          
          // Insert token first
          const now = new Date();
          const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
          const { error: tokenError } = await supabase
            .from('subscriber_tokens')
            .insert({
              subscriber_id: subscriber.id,
              type: 'unsubscribe',
              token: unsubToken,
              created_at: now.toISOString(),
              expires_at: expiresAt.toISOString()
            });

          if (tokenError) {
            console.warn(`Token insert failed for ${subscriber.email}:`, tokenError);
          }

          // Send email
          const result = await sendNewsletterToSubscriber(
            subscriber, 
            letterObj, 
            { 
              token: unsubToken, 
              skipTokenInsert: true // Token already inserted above
            }
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
              sent_at: new Date().toISOString()
            });
          } else {
            failedCount++;
            logs.push({
              id: createId(),
              job_id: job.id,
              subscriber_id: subscriber.id,
              status: 'failed',
              error_message: result.error || 'Unknown error',
              provider_response: result.providerDetails || null,
              sent_at: new Date().toISOString()
            });
          }
        } catch (error) {
          failedCount++;
          console.error(`Failed to send to ${subscriber.email}:`, error);
          logs.push({
            id: createId(),
            job_id: job.id,
            subscriber_id: subscriber.id,
            status: 'failed',
            error_message: error instanceof Error ? error.message : String(error),
            sent_at: new Date().toISOString()
          });
        }
      });

      await Promise.all(batchPromises);

      // Insert logs for this batch
      if (logs.length > 0) {
        const { error: logError } = await supabase
          .from('newsletter_logs')
          .insert(logs);
        
        if (logError) {
          console.error('[Newsletter Worker] Failed to insert logs:', logError);
        }
        logs.length = 0; // Clear logs array
      }

      // Update job progress
      await supabase
        .from('newsletter_jobs')
        .update({ 
          sent_count: sentCount, 
          failed_count: failedCount 
        })
        .eq('id', job.id);

      // Rate limiting: delay between batches (except for last batch)
      if (i + BATCH_SIZE < subscribers.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    // Mark letter as sent
    await supabase
      .from('letters')
      .update({ sentAt: new Date().toISOString() })
      .eq('id', job.letter_id);

    // Mark job as completed
    await supabase
      .from('newsletter_jobs')
      .update({ 
        status: 'completed',
        sent_count: sentCount,
        failed_count: failedCount,
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id);

    console.info(`[Newsletter Worker] Job ${job.id} completed. Sent: ${sentCount}, Failed: ${failedCount}`);

    return NextResponse.json({
      message: 'Job completed successfully',
      jobId: job.id,
      letterId: job.letter_id,
      totalSubscribers: subscribers.length,
      sent: sentCount,
      failed: failedCount,
      successRate: subscribers.length > 0 ? ((sentCount / subscribers.length) * 100).toFixed(2) + '%' : '0%'
    });

  } catch (error) {
    console.error('[Newsletter Worker] Unexpected error:', error);
    return NextResponse.json({ 
      error: 'Worker failed', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}
