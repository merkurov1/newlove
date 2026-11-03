import crypto from 'crypto';
import type { LotData } from '@/lib/lots/types';
import { houseDisplayName, normalizeHouseId } from '@/lib/lots/registry';
import type { VaultState } from './types';

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ldp_breadcrumb',
  'cmp',
  'cmpid',
  'source',
]);

const MAX_HTML_BYTES = 2_000_000;

export function normalizeSourceUrl(rawUrl: string): string {
  const url = new URL(rawUrl);

  url.hash = '';
  url.hostname = url.hostname.replace(/^www\./i, '');

  for (const key of Array.from(url.searchParams.keys())) {
    const normalized = key.toLowerCase();

    if (
      normalized.startsWith('utm_') ||
      TRACKING_PARAMS.has(normalized)
    ) {
      url.searchParams.delete(key);
    }
  }

  url.pathname = url.pathname.replace(/\/+$/g, '') || '/';

  return url.toString();
}

export function canonicalUrlFromHtml(
  html: string,
  baseUrl: string,
): string | null {
  const patterns = [
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) continue;

    try {
      const url = new URL(match[1], baseUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return normalizeSourceUrl(url.toString());
    } catch {
      return null;
    }
  }

  return null;
}

export function contentHash(html: string): string {
  return crypto.createHash('sha256').update(html).digest('hex');
}

export function rawHtmlExcerpt(html: string, maxChars = 120_000): string {
  return html.slice(0, Math.max(0, maxChars));
}

export function htmlByteLength(html: string): number {
  return Buffer.byteLength(html, 'utf8');
}

export function isHtmlTooLarge(html: string): boolean {
  return htmlByteLength(html) > MAX_HTML_BYTES;
}

export function mapAuctionHouse(lot: LotData): string {
  const houseId = normalizeHouseId(
    lot.auctionHouse || lot.house || lot.parserName,
  );

  if (houseId !== 'unknown') {
    return houseDisplayName(houseId);
  }

  return (lot.house || '').trim() || 'Unknown';
}

function auctionDateValue(value?: string | null): string | null {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toISOString();
}

function joinLines(values?: string[] | null): string | null {
  const items = (values || []).map((value) => value.trim()).filter(Boolean);
  return items.length ? items.join('\n') : null;
}

export interface LotRowInput {
  lot: LotData;
  image:
    | {
        storedPath?: string | null;
        originalUrl?: string | null;
      }
    | null
    | undefined;
  vault: VaultState;
  sourceUrl: string;
  existing?: Record<string, any> | null;
}

export function buildLotRow(input: LotRowInput): Record<string, any> {
  const { lot, image, vault, sourceUrl } = input;
  const existing = input.existing || {};

  const estimateRaw =
    lot.estimate?.raw ||
    existing.estimate ||
    null;

  const priceRaw =
    lot.price?.raw ||
    (lot.price?.realized !== undefined
      ? String(lot.price.realized)
      : null) ||
    existing.price_realized ||
    null;

  const currency =
    lot.currency ||
    lot.estimate?.currency ||
    lot.price?.currency ||
    existing.currency ||
    null;

  const auctionHouse = mapAuctionHouse(lot);

  return {
    artist: lot.artist?.trim() || existing.artist || '',
    title: lot.title?.trim() || existing.title || '',
    year: lot.year ? String(lot.year) : existing.year || null,
    medium: lot.medium?.trim() || existing.medium || null,
    dimensions: lot.dimensions?.trim() || existing.dimensions || null,
    estimate: estimateRaw,
    price_realized: priceRaw,
    provenance: joinLines(lot.provenance) || existing.provenance || null,
    source_url: sourceUrl,
    image_path:
      image?.storedPath ||
      image?.originalUrl ||
      existing.image_path ||
      null,
    status: existing.status || 'draft',
    tags: Array.isArray(existing.tags) ? existing.tags : null,
    auction_date:
      auctionDateValue(lot.auctionDate) ||
      existing.auction_date ||
      null,
    currency,
    estimate_low:
      lot.estimate?.min ??
      existing.estimate_low ??
      null,
    estimate_high:
      lot.estimate?.max ??
      existing.estimate_high ??
      null,
    auction_house:
      auctionHouse !== 'Unknown'
        ? auctionHouse
        : existing.auction_house || auctionHouse,
    external_id: lot.lotNumber || existing.external_id || null,
    vault,
    ai_content: existing.ai_content ?? null,
  };
}

export function toExtractedSpecs(lot: LotData): {
  medium: string;
  dimensions: string;
  estimate: string;
  date: string;
  provenance: string;
  lot_number: string;
  auction_house: string;
  auction_date: string;
  currency: string;
  signature: string;
} {
  return {
    medium: lot.medium || '',
    dimensions: lot.dimensions || '',
    estimate:
      lot.estimate?.raw ||
      (lot.price?.realized !== undefined ? String(lot.price.realized) : ''),
    date: lot.auctionDate || (lot.year ? String(lot.year) : ''),
    provenance: (lot.provenance || []).join('\n'),
    lot_number: lot.lotNumber || '',
    auction_house: mapAuctionHouse(lot),
    auction_date: lot.auctionDate || '',
    currency: lot.currency || lot.estimate?.currency || lot.price?.currency || '',
    signature: lot.signature || '',
  };
}
