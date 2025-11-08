export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabaseClient } from '@/lib/serverAuth';

/**
 * GET /api/newsletter-jobs/[jobId]
 * 
 * Returns the current status and statistics of a newsletter job
 */

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { jobId } = params;

  if (!jobId) {
    return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
  }

  try {
    const supabase = getServerSupabaseClient({ useServiceRole: true });

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('newsletter_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: job.id,
      letter_id: job.letter_id,
      status: job.status,
      total_count: job.total_count || 0,
      sent_count: job.sent_count || 0,
      failed_count: job.failed_count || 0,
      error_message: job.error_message,
      created_at: job.created_at,
      started_at: job.started_at,
      completed_at: job.completed_at
    });

  } catch (error) {
    console.error('[Newsletter Jobs API] Error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch job status',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
