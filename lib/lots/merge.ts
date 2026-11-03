import type { ImageCandidate, LotData } from "./types";

function hasText(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = (value || "").trim();
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function uniqueCandidates(
  values: Array<ImageCandidate | null | undefined>,
): ImageCandidate[] {
  const seen = new Set<string>();
  const result: ImageCandidate[] = [];

  for (const value of values) {
    if (!value?.url) continue;

    const key = value.url.trim();
    if (!key || seen.has(key)) continue;

    seen.add(key);
    result.push(value);
  }

  return result;
}

/**
 * Merges a house-specific result (primary) with generic JSON-LD/DOM extraction
 * (fallback). House fields always win; generic fields only fill gaps.
 */
export function mergeLotData(
  primary: LotData,
  fallback: LotData,
): LotData {
  const merged: LotData = {
    ...fallback,
    ...primary,

    auctionHouse: primary.auctionHouse || fallback.auctionHouse,
    house: primary.house || fallback.house,
    title: hasText(primary.title) ? primary.title : fallback.title,
    artist: hasText(primary.artist) ? primary.artist : fallback.artist,
    artistDates: hasText(primary.artistDates)
      ? primary.artistDates
      : fallback.artistDates,
    year: primary.year ?? fallback.year,
    medium: hasText(primary.medium) ? primary.medium : fallback.medium,
    dimensions: hasText(primary.dimensions)
      ? primary.dimensions
      : fallback.dimensions,
    signature: hasText(primary.signature)
      ? primary.signature
      : fallback.signature,
    description: hasText(primary.description)
      ? primary.description
      : fallback.description,
    lotEssay: hasText(primary.lotEssay)
      ? primary.lotEssay
      : fallback.lotEssay,
    catalogueNote: hasText(primary.catalogueNote)
      ? primary.catalogueNote
      : fallback.catalogueNote,
    conditionReport: hasText(primary.conditionReport)
      ? primary.conditionReport
      : fallback.conditionReport,
    conditionReportStatus:
      primary.conditionReportStatus &&
      primary.conditionReportStatus !== "unknown"
        ? primary.conditionReportStatus
        : fallback.conditionReportStatus,
    lotNumber: hasText(primary.lotNumber)
      ? primary.lotNumber
      : fallback.lotNumber,
    auctionDate: hasText(primary.auctionDate)
      ? primary.auctionDate
      : fallback.auctionDate,
    estimate: primary.estimate || fallback.estimate,
    price: primary.price || fallback.price,
    sold: primary.sold ?? fallback.sold,
    imageUrl: hasText(primary.imageUrl)
      ? primary.imageUrl
      : fallback.imageUrl,
    canonicalUrl: primary.canonicalUrl || fallback.canonicalUrl,
    source: primary.source || fallback.source,
    parserName: primary.parserName || fallback.parserName,
    parserVersion: primary.parserVersion || fallback.parserVersion,
    confidence: primary.confidence ?? fallback.confidence,
    url: primary.url || fallback.url,
  };

  merged.provenance = uniqueStrings([
    ...(primary.provenance || []),
    ...(fallback.provenance || []),
  ]);
  merged.exhibitions = uniqueStrings([
    ...(primary.exhibitions || []),
    ...(fallback.exhibitions || []),
  ]);
  merged.literature = uniqueStrings([
    ...(primary.literature || []),
    ...(fallback.literature || []),
  ]);

  merged.imageCandidates = uniqueCandidates([
    ...(primary.imageCandidates || []),
    ...(primary.imageUrl ? [{ url: primary.imageUrl, source: primary.parserName || "primary" }] : []),
    ...(fallback.imageCandidates || []),
    ...(fallback.imageUrl ? [{ url: fallback.imageUrl, source: fallback.parserName || "fallback" }] : []),
  ]);

  merged.warnings = uniqueStrings([
    ...(fallback.warnings || []),
    ...(primary.warnings || []),
  ]);
  merged.parseErrors = uniqueStrings([
    ...(fallback.parseErrors || []),
    ...(primary.parseErrors || []),
  ]);

  merged.raw = {
    ...(fallback.raw || {}),
    ...(primary.raw || {}),
    merged_from: {
      primary: primary.parserName || primary.source || null,
      fallback: fallback.parserName || fallback.source || null,
    },
  };

  return merged;
}
