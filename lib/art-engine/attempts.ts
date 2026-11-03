export interface AttemptSummary {
  id: string;
  url: string;
  status: string;
  error_message: string | null;
  house: string | null;
  parsed_title: string | null;
  execution_time_ms: number | null;
  created_at: string | null;
  parser: string | null;
  parser_version: string | null;
  lot_id: string | null;
  http_status: number | null;
  fetch_method: string | null;
  warnings: string[];
  errors: string[];
  missing_fields: string[];
  image_availability: string | null;
  image_original_url: string | null;
}

export interface AttemptDossier {
  description: string | null;
  signature: string | null;
  lot_number: string | null;
  auction_date: string | null;
  estimate_raw: string | null;
  price_realized_raw: string | null;
  provenance: string[];
  exhibitions: string[];
  literature: string[];
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function summarizeAttempt(
  row: Record<string, any>,
): AttemptSummary {
  const payload =
    row.payload && typeof row.payload === 'object' ? row.payload : {};
  const image =
    payload.image && typeof payload.image === 'object' ? payload.image : {};

  return {
    id: String(row.id),
    url: String(row.url || ''),
    status: String(row.status || 'unknown'),
    error_message: stringValue(row.error_message),
    house: stringValue(row.house),
    parsed_title: stringValue(row.parsed_title),
    execution_time_ms:
      typeof row.execution_time_ms === 'number'
        ? row.execution_time_ms
        : null,
    created_at: stringValue(row.created_at),
    parser: stringValue(payload.parser),
    parser_version: stringValue(payload.parser_version),
    lot_id: stringValue(payload.lot_id),
    http_status:
      typeof payload.http_status === 'number'
        ? payload.http_status
        : null,
    fetch_method: stringValue(payload.fetch_method),
    warnings: stringArray(payload.warnings),
    errors: stringArray(payload.errors),
    missing_fields: stringArray(payload.missing_fields),
    image_availability: stringValue(image.availability),
    image_original_url: stringValue(image.originalUrl),
  };
}

export function extractAttemptDossier(
  row: Record<string, any> | null | undefined,
): AttemptDossier {
  const payload =
    row?.payload && typeof row.payload === 'object' ? row.payload : {};
  const result =
    payload.result && typeof payload.result === 'object'
      ? payload.result
      : {};

  const estimate =
    result.estimate && typeof result.estimate === 'object'
      ? result.estimate
      : {};
  const price =
    result.price && typeof result.price === 'object' ? result.price : {};

  return {
    description: stringValue(result.description),
    signature: stringValue(result.signature),
    lot_number: stringValue(result.lotNumber),
    auction_date: stringValue(result.auctionDate),
    estimate_raw: stringValue(estimate.raw),
    price_realized_raw: stringValue(price.raw),
    provenance: stringArray(result.provenance),
    exhibitions: stringArray(result.exhibitions),
    literature: stringValue(result.literature)
      ? [stringValue(result.literature) as string]
      : stringArray(result.literature),
  };
}
