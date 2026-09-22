// app/api/curator/parse-lot/route.ts
import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { parseLotHtml } from '@/lib/lots/parse';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Allowlist doubles as SSRF guard and house registry. Add domains here.
const HOUSES: Record<string, string> = {
  'christies.com': "Christie's",
  'sothebys.com': "Sotheby's",
  'phillips.com': 'Phillips',
  'bonhams.com': 'Bonhams',
};

const houseFor = (host: string) => {
  const d = Object.keys(HOUSES).find((k) => host === k || host.endsWith('.' + k));
  return d ? HOUSES[d] : null;
};

const BLOCK_MARKERS = /access denied|captcha|cf-chl|are you a robot|pardon our interruption|unusual traffic/i;

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);
    const { url, html: pastedHtml, debug } = await req.json();

    let target: URL;
    try {
      target = new URL(url);
    } catch {
      return NextResponse.json({ error: 'bad_url' }, { status: 400 });
    }
    const house = houseFor(target.hostname);
    if (target.protocol !== 'https:' || !house) {
      return NextResponse.json({ error: 'host_not_allowed' }, { status: 400 });
    }

    let html: string;
    if (typeof pastedHtml === 'string' && pastedHtml.length > 500) {
      // HTML captured from the dealer's own browser session (bookmarklet / extension / paste)
      html = pastedHtml;
    } else {
      // Plain, honest fetch. No crawler impersonation; if the site says no, we stop.
      const res = await fetch(target.href, {
        headers: {
          'User-Agent': 'CuratorsEngine/1.0 (single-lot lookup for a dealer; contact: you@example.com)',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.8',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      });
      if (!houseFor(new URL(res.url).hostname)) {
        return NextResponse.json({ error: 'redirected_off_allowlist' }, { status: 502 });
      }
      html = await res.text();
      const blocked = [401, 403, 429, 503].includes(res.status) || (BLOCK_MARKERS.test(html) && !/ld\+json/.test(html));
      if (blocked || !res.ok) {
        return NextResponse.json(
          {
            error: 'blocked',
            status: res.status,
            hint: 'Site refused automated access. Send the page HTML captured from your own browser in the `html` field.',
          },
          { status: 422 },
        );
      }
    }

    const lot = parseLotHtml(html, target.href, house, { debug: !!debug });
    return NextResponse.json({ lot, rawLength: html.length });
  } catch (e: any) {
    console.error('[parse-lot]', e);
    return NextResponse.json({ error: 'parse_failed', details: e?.message ?? String(e) }, { status: 500 });
  }
}
