import type { LotData } from '@/lib/lots/types';
import type {
  LotExtractionState,
  NormalizedExtraction,
  VaultState,
} from './types';

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function lines(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(/\n+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeLotData(lot: LotData): NormalizedExtraction {
  return {
    title: text(lot.title),
    artist: text(lot.artist),
    artistDates: text(lot.artistDates),
    auctionHouse: text(lot.house) || text(lot.auctionHouse),
    year: typeof lot.year === 'number' ? lot.year : number(lot.year),
    medium: text(lot.medium),
    dimensions: text(lot.dimensions),
    signature: text(lot.signature),
    description: text(lot.description),
    lotEssay: text(lot.lotEssay),
    catalogueNote: text(lot.catalogueNote),
    conditionReport: text(lot.conditionReport),
    conditionReportStatus: lot.conditionReportStatus || 'unknown',
    provenance: stringArray(lot.provenance),
    exhibitions: stringArray(lot.exhibitions),
    literature: stringArray(lot.literature),
    lotNumber: text(lot.lotNumber),
    auctionDate: text(lot.auctionDate),
    estimate: lot.estimate
      ? {
          raw: text(lot.estimate.raw),
          currency: text(lot.estimate.currency),
          min: number(lot.estimate.min),
          max: number(lot.estimate.max),
        }
      : null,
    price: lot.price
      ? {
          raw: text(lot.price.raw),
          currency: text(lot.price.currency),
          realized: number(lot.price.realized),
        }
      : null,
    currency: text(lot.currency),
  };
}

export function buildLotExtractionState(
  lot: LotData,
  input: {
    imageCandidates?: LotData['imageCandidates'];
    warnings?: string[];
    errors?: string[];
    sourceUrl?: string | null;
  } = {},
): LotExtractionState {
  return {
    schema_version: 1,
    normalized: normalizeLotData(lot),
    raw: lot.raw || null,
    imageCandidates: input.imageCandidates || lot.imageCandidates || [],
    parser: lot.parserName || null,
    parserVersion: lot.parserVersion || null,
    sourceUrl: input.sourceUrl || lot.url || null,
    extractedAt: new Date().toISOString(),
    warnings: input.warnings || [],
    errors: input.errors || [],
  };
}

export function extractionFromVault(
  vault: VaultState | null | undefined,
): NormalizedExtraction | null {
  const normalized = vault?.extraction?.normalized;
  return normalized && typeof normalized === 'object' ? normalized : null;
}

export function extractionFromLotRow(
  lot: Record<string, any>,
  vault: VaultState | null | undefined,
  latestResult?: Record<string, any> | null,
): NormalizedExtraction {
  const stored = extractionFromVault(vault);
  if (stored) return stored;

  const result = latestResult || {};
  const estimate =
    result.estimate && typeof result.estimate === 'object'
      ? result.estimate
      : null;
  const price =
    result.price && typeof result.price === 'object' ? result.price : null;

  return {
    title: text(lot.title) || text(result.title),
    artist: text(lot.artist) || text(result.artist),
    artistDates: text(result.artistDates),
    auctionHouse: text(lot.auction_house) || text(result.house),
    year: number(lot.year) ?? number(result.year),
    medium: text(lot.medium) || text(result.medium),
    dimensions: text(lot.dimensions) || text(result.dimensions),
    signature: text(result.signature),
    description: text(result.description),
    lotEssay: text(result.lotEssay),
    catalogueNote: text(result.catalogueNote),
    conditionReport: text(result.conditionReport),
    conditionReportStatus: result.conditionReportStatus || 'unknown',
    provenance:
      stringArray(result.provenance).length > 0
        ? stringArray(result.provenance)
        : lines(lot.provenance),
    exhibitions: stringArray(result.exhibitions),
    literature: stringArray(result.literature),
    lotNumber: text(result.lotNumber) || text(lot.external_id),
    auctionDate: text(result.auctionDate) || text(lot.auction_date),
    estimate: estimate
      ? {
          raw: text(estimate.raw) || text(lot.estimate),
          currency: text(estimate.currency) || text(lot.currency),
          min: number(estimate.min) ?? number(lot.estimate_low),
          max: number(estimate.max) ?? number(lot.estimate_high),
        }
      : lot.estimate
        ? { raw: text(lot.estimate), currency: text(lot.currency) }
        : null,
    price: price
      ? {
          raw: text(price.raw) || text(lot.price_realized),
          currency: text(price.currency) || text(lot.currency),
          realized: number(price.realized),
        }
      : lot.price_realized
        ? { raw: text(lot.price_realized), currency: text(lot.currency) }
        : null,
    currency: text(result.currency) || text(lot.currency),
  };
}

export function missingForEssay(
  extraction: NormalizedExtraction,
): string[] {
  const missing: string[] = [];
  if (!extraction.artist) missing.push('artist');
  if (!extraction.title) missing.push('title');
  return missing;
}

export function missingForPublication(input: {
  extraction: NormalizedExtraction;
  essay: string | null;
  imageUrl: string | null;
}): string[] {
  const missing: string[] = [];
  if (!input.extraction.artist) missing.push('artist');
  if (!input.extraction.title) missing.push('title');
  if (!input.imageUrl) missing.push('image');
  if (!input.essay?.trim()) missing.push('essay');
  return missing;
}
