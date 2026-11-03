export type IngestionStatus =
  | 'queued'
  | 'extracting'
  | 'ready'
  | 'partial'
  | 'failed'
  | 'unknown';

export type AttemptStatus =
  | 'queued'
  | 'extracting'
  | 'ready'
  | 'partial'
  | 'failed'
  | 'success'
  | 'unknown';

export interface ArtworkImage {
  originalUrl?: string | null;
  storedPath?: string | null;
  publicUrl?: string | null;
  source?: string | null;
  availability?: string | null;
  mimeType?: string | null;
  bytes?: number | null;
  width?: number | null;
  height?: number | null;
  rights?: {
    basis?: string;
    publication?: string;
    note?: string | null;
  } | null;
  warnings?: string[];
}

export interface IngestionState {
  status?: IngestionStatus;
  attempt_id?: string | null;
  attempt_ids?: string[];
  parser?: string | null;
  parser_version?: string | null;
  house?: string | null;
  source_url?: string | null;
  canonical_url?: string | null;
  http_status?: number | null;
  fetch_method?: string | null;
  fetched_at?: string | null;
  extracted_at?: string | null;
  execution_time_ms?: number | null;
  warnings?: string[];
  errors?: string[];
  missing_fields?: string[];
  image?: ArtworkImage | null;
}

export interface AttemptSummary {
  id: string;
  url: string;
  status: AttemptStatus | string;
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

export interface VaultLot {
  id: string;
  artist: string;
  title: string;
  year: string | null;
  medium: string | null;
  dimensions: string | null;
  estimate: string | null;
  image_path: string | null;
  source_url: string | null;
  auction_house: string | null;
  status: string | null;
  created_at: string | null;
  ingestion_status: string | null;
  editorial_status: string | null;
  publication_status: string | null;
  warnings: string[];
  missing_fields: string[];
}

export interface ExtractedDossier {
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

export interface ArtworkDetail {
  lot: {
    id: string;
    artist: string;
    title: string;
    year: string | null;
    medium: string | null;
    dimensions: string | null;
    estimate: string | null;
    price_realized: string | null;
    provenance: string | null;
    source_url: string | null;
    image_path: string | null;
    image_url: string | null;
    auction_house: string | null;
    auction_date: string | null;
    currency: string | null;
    external_id: string | null;
    status: string | null;
    created_at: string | null;
  };
  vault: {
    ingestion: IngestionState | null;
    image: ArtworkImage | null;
  };
  attempts: AttemptSummary[];
  extracted: ExtractedDossier;
}

export type VaultFilter = 'all' | 'ready' | 'partial' | 'failed' | 'attention';
