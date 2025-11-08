// app/api/health/route.ts
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  environment: string;
  checks: {
    database: boolean;
    supabase: boolean;
    env: boolean;
  };
  details?: {
    error?: string;
    duration?: number;
  };
}

/**
 * Health check endpoint for monitoring
 * GET /api/health
 * 
 * Returns:
 * - 200: All systems operational
 * - 503: One or more systems unhealthy
 */
export async function GET() {
  const startTime = Date.now();
  const checks: HealthCheck['checks'] = {
    database: false,
    supabase: false,
    env: false,
  };

  try {
    // Check environment variables
    checks.env = !!(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // Check Supabase connection
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .limit(1)
        .maybeSingle();
      
      checks.supabase = !error;
      checks.database = !error;
    } catch (e) {
      console.error('[Health Check] Supabase check failed:', e);
      checks.supabase = false;
      checks.database = false;
    }

    const allHealthy = Object.values(checks).every(Boolean);
    const status: HealthCheck['status'] = allHealthy 
      ? 'healthy' 
      : checks.env && (checks.database || checks.supabase)
      ? 'degraded'
      : 'unhealthy';

    const response: HealthCheck = {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'unknown',
      checks,
      details: {
        duration: Date.now() - startTime,
      },
    };

    return NextResponse.json(response, {
      status: allHealthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    const response: HealthCheck = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'unknown',
      checks,
      details: {
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      },
    };

    return NextResponse.json(response, {
      status: 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }
}
