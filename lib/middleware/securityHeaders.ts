// lib/middleware/securityHeaders.ts
import { NextResponse } from 'next/server';

export function addSecurityHeaders(response: NextResponse): NextResponse {
  // Content Security Policy
  const csp = [
    "default-src 'self'",
    // === ВАЖНО: ДОБАВЛЕН TELEGRAM ===
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://telegram.org https://vercel.live https://va.vercel-scripts.com https://cloud.umami.is https://analytics.umami.is",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://vercel.live wss://*.supabase.co https://cloud.umami.is https://analytics.umami.is",
    "frame-src 'self' https://www.youtube.com https://player.vimeo.com",
    "media-src 'self' https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');

  // Set security headers
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );

  // HSTS
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  return response;
}

// Relaxed CSP for development
export function addDevSecurityHeaders(response: NextResponse): NextResponse {
  const csp = [
    "default-src 'self'",
    // === ВАЖНО: ДОБАВЛЕН TELEGRAM ===
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://telegram.org",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss:",
    "frame-src 'self' https:",
    "media-src 'self' https:",
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('X-Content-Type-Options', 'nosniff');

  return response;
}