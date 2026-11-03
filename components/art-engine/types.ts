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

export interface NormalizedExtraction {
  title: string | null;
  artist: string | null;
  artistDates: string | null;
  auctionHouse: string | null;
  year: number | null;
  medium: string | null;
  dimensions: string | null;
  signature: string | null;
  description: string | null;
  lotEssay: string | null;
  catalogueNote: string | null;
  conditionReport: string | null;
  conditionReportStatus: string;
  provenance: string[];
  exhibitions: string[];
  literature: string[];
  lotNumber: string | null;
  auctionDate: string | null;
  estimate: {
    raw?: string | null;
    currency?: string | null;
    min?: number | null;
    max?: number | null;
  } | null;
  price: {
    raw?: string | null;
    currency?: string | null;
    realized?: number | null;
  } | null;
  currency: string | null;
}

export interface WikipediaCandidate {
  title: string;
  url: string | null;
  description: string | null;
  score: number;
}

export interface WikipediaState {
  status:
    | 'idle'
    | 'found'
    | 'not_found'
    | 'ambiguous'
    | 'unavailable'
    | 'skipped';
  artist: string;
  query?: string | null;
  title?: string | null;
  url?: string | null;
  language?: string | null;
  extract?: string | null;
  description?: string | null;
  retrieved_at?: string | null;
  match_score?: number | null;
  candidates?: WikipediaCandidate[];
  warnings: string[];
}

export interface EditorialDraft {
  version: number;
  title?: string | null;
  artist?: string | null;
  year?: string | null;
  medium?: string | null;
  dimensions?: string | null;
  signed?: string | null;
  auction_house?: string | null;
  auction_date?: string | null;
  lot_number?: string | null;
  estimate?: string | null;
  price_realized?: string | null;
  currency?: string | null;
  curatorial_essay: string;
  quote?: string | null;
  specs?: string | null;
  provenance: string[];
  exhibitions: string[];
  literature: string[];
  sources_used: string[];
  warnings: string[];
  model?: string | null;
  prompt_version?: string | null;
  generated_at: string;
}

export interface EditorialView {
  status: string;
  current: EditorialDraft | null;
  history_count: number;
  last_error: string | null;
  last_attempt_at: string | null;
  updated_at: string | null;
}

export interface PublicationView {
  status: string;
  article_id: string | null;
  slug: string | null;
  version: number | null;
  published_at: string | null;
  approved_at: string | null;
  update_pending: boolean;
  history_count: number;
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
  wikipedia_status: string | null;
  editorial_status: string | null;
  essay_version: number | null;
  publication_status: string | null;
  publication_url: string | null;
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
  artist_dates: string | null;
  lot_essay: string | null;
  catalogue_note: string | null;
  condition_report: string | null;
  condition_report_status: string;
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
  extraction: NormalizedExtraction;
  wikipedia: WikipediaState | null;
  editorial: EditorialView | null;
  publication: PublicationView | null;
}

export type VaultFilter = 'all' | 'ready' | 'partial' | 'failed' | 'attention';
