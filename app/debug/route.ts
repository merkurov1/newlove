import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

function redactEnvValue(key: string, value: string | undefined) {
  if (!value) return null;
  // Allow full disclosure for public variables
  if (key.startsWith('NEXT_PUBLIC_')) return value;
  // Short safe preview for non-public: show length and first/last chars
  const len = value.length;
  if (len <= 6) return '●'.repeat(len);
  return `${value.slice(0, 3)}…${value.slice(-3)} (len=${len})`;
}

function isSensitiveKey(k: string) {
  const sens = ['KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'PRIVATE', 'AUTH', 'SIGNING'];
  return sens.some(s => k.toUpperCase().includes(s));
}

async function tryRequire(name: string) {
  try {
    // dynamic import to avoid bundling issues
    const mod = await import(name as any).catch((e) => { throw e; });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

export async function GET() {
  const timestamp = new Date().toISOString();
  // Parse query to optionally include logs
  const url = new URL((globalThis as any).REQUEST_URL || 'http://localhost');
  const includeLogs = url.searchParams.get('includeLogs') === '1';

  // Basic runtime info
  const runtime: Record<string, any> = {
    nodeVersion: process?.version || null,
    platform: process?.platform || null,
    pid: typeof process !== 'undefined' ? process.pid : null,
    memoryUsage: typeof process !== 'undefined' && process.memoryUsage ? process.memoryUsage() : null,
    uptime: typeof process !== 'undefined' ? process.uptime && Math.floor(process.uptime()) : null,
  };

  // Env summary (redact secrets)
  const rawEnv = { ...(process.env || {}) } as Record<string, string | undefined>;
  const envSummary: Record<string, any> = {};
  Object.keys(rawEnv)
    .sort()
    .forEach((k) => {
      try {
        if (k.startsWith('NEXT_PUBLIC_')) {
          envSummary[k] = rawEnv[k];
        } else if (isSensitiveKey(k)) {
          envSummary[k] = { present: rawEnv[k] !== undefined, redacted: redactEnvValue(k, rawEnv[k]) };
        } else {
          envSummary[k] = { present: rawEnv[k] !== undefined, preview: redactEnvValue(k, rawEnv[k]) };
        }
      } catch (e) {
        envSummary[k] = { error: 'cannot read' };
      }
    });

  // Inspect package.json for native-ish deps
  let packageInfo: any = null;
  try {
    // read package.json from project root
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = await import('../../package.json');
    packageInfo = { name: pkg.name, version: pkg.version, engines: pkg.engines || null, dependencies: pkg.dependencies || {} };
  } catch (e) {
    packageInfo = { error: 'unable to read package.json', detail: String(e) };
  }

  const nativeCandidates = ['sharp', 'canvas', 'bcrypt', 'grpc', '@vercel/og', 'node-sass', 'sass'];
  const nativeChecks: Record<string, any> = {};
  for (const name of nativeCandidates) {
    if (packageInfo && packageInfo.dependencies && packageInfo.dependencies[name]) {
      nativeChecks[name] = { declared: true, version: packageInfo.dependencies[name] };
      // Try to require/import the module to see if it loads at runtime
      // Wrap in try-catch
      // eslint-disable-next-line no-await-in-loop
      const res = await tryRequire(name).catch((e) => ({ ok: false, error: String(e) }));
      nativeChecks[name].loaded = res.ok;
      if (!res.ok) nativeChecks[name].error = res.error;
    } else {
      nativeChecks[name] = { declared: false };
    }
  }

  // Internal endpoint checks (no cookies, safe)
  const internalChecks: Record<string, any> = {};
  try {
    const userRoleRes = await fetch(new URL('/api/user/role', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost').toString(), { cache: 'no-store' });
    internalChecks['/api/user/role'] = { status: userRoleRes.status, ok: userRoleRes.ok, body: await userRoleRes.text().catch(() => '') };
  } catch (e: any) {
    internalChecks['/api/user/role'] = { error: String(e?.message || e) };
  }

  try {
    const monitorRes = await fetch(new URL('/api/monitor/search', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost').toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artist: 'Pablo Picasso', source: 'invaluable' }),
      cache: 'no-store',
    });
    internalChecks['/api/monitor/search'] = { status: monitorRes.status, ok: monitorRes.ok, body: await monitorRes.text().catch(() => '') };
  } catch (e: any) {
    internalChecks['/api/monitor/search'] = { error: String(e?.message || e) };
  }

  // Build safe report
  const report = {
    timestamp,
    runtime,
    envSummary,
    packageInfo: packageInfo ? { name: packageInfo.name, version: packageInfo.version, engines: packageInfo.engines } : packageInfo,
    nativeChecks,
    internalChecks,
  };

  // If requested and DEBUG_LOG_PATH present, try to include tail of that log file
  if (includeLogs && process.env.DEBUG_LOG_PATH) {
    try {
      const logPath = process.env.DEBUG_LOG_PATH;
      // Ensure path is inside project or /tmp for safety
      const abs = path.isAbsolute(logPath) ? logPath : path.resolve(process.cwd(), logPath);
      const content = await fs.readFile(abs, { encoding: 'utf8' });
      const lines = content.split(/\r?\n/).filter(Boolean);
      const tail = lines.slice(-500);
      (report as any).logs = { path: abs, lines: tail };
    } catch (e: any) {
      (report as any).logs = { error: String(e?.message || e) };
    }
  }

  return NextResponse.json(report, { status: 200 });
}

export const runtime = 'nodejs';
