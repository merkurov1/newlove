import type {
  ImageCandidate,
  ImageMetadata,
  LotData,
} from '@/lib/lots/types';

export type IngestionStatus =
  | 'queued'
  | 'extracting'
  | 'ready'
  | 'partial'
  | 'failed';

export type ResearchStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'complete'
  | 'failed';

export type EditorialStatus =
  | 'idle'
  | 'draft'
  | 'review'
  | 'approved'
  | 'rejected'
  | 'failed';

export type PublicationStatus =
  | 'unpublished'
  | 'published'
  | 'update_pending';

export interface IngestionState {
  status: IngestionStatus;
  attempt_id?: string | null;
  attempt_ids?: string[];
  parser?: string | null;
  parser_version?: string | null;
  house?: string | null;
  source_url?: string | null;
  canonical_url?: string | null;
  http_status?: number | null;
  fetch_method?: 'direct' | 'scrapingant' | 'unknown';
  fetched_at?: string | null;
  extracted_at?: string | null;
  execution_time_ms?: number | null;
  warnings: string[];
  errors: string[];
  missing_fields: string[];
  image?: ImageMetadata | null;
  raw_excerpt_chars?: number | null;
  content_hash?: string | null;
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
  conditionReportStatus:
    | 'available'
    | 'unavailable'
    | 'login-required'
    | 'unknown';
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

export interface LotExtractionState {
  schema_version: 1;
  normalized: NormalizedExtraction;
  raw?: Record<string, any> | null;
  imageCandidates?: ImageCandidate[];
  parser?: string | null;
  parserVersion?: string | null;
  sourceUrl?: string | null;
  extractedAt?: string | null;
  warnings?: string[];
  errors?: string[];
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

export interface IdentityCandidate {
  lot_id: string;
  score: number;
  reasons: string[];
}

export interface IdentityState {
  status: 'unresolved' | 'proposed' | 'confirmed' | 'new';
  key?: string | null;
  confidence?: number | null;
  primary_lot_id?: string | null;
  candidates?: IdentityCandidate[];
  confirmed_by?: string | null;
  confirmed_at?: string | null;
  notes?: string[];
}

export interface ResearchSource {
  id: string;
  url: string;
  title?: string | null;
  domain?: string | null;
  author?: string | null;
  published_at?: string | null;
  retrieved_at: string;
  excerpt?: string | null;
  provider?: string | null;
}

export type EvidenceStatus =
  | 'confirmed'
  | 'reported'
  | 'disputed'
  | 'interpretation';

export interface EvidenceClaim {
  id: string;
  text: string;
  status: EvidenceStatus;
  source_ids: string[];
  quote?: string | null;
  notes?: string | null;
}

export interface ResearchContradiction {
  claim_ids: string[];
  description: string;
}

export interface ResearchState {
  status: ResearchStatus;
  cycle?: number;
  next_query_index?: number;
  queries_used?: number;
  sources_used?: number;
  started_at?: string | null;
  updated_at?: string | null;
  finished_at?: string | null;
  budget?: {
    max_cycles: number;
    max_queries: number;
    max_sources: number;
    timeout_ms: number;
  };
  sources: ResearchSource[];
  claims: EvidenceClaim[];
  contradictions: ResearchContradiction[];
  gaps: string[];
  errors: string[];
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

export interface EditorialState {
  status: EditorialStatus;
  current?: EditorialDraft | null;
  history?: Array<EditorialDraft & { archived_at: string }>;
  rejected_reason?: string | null;
  last_error?: string | null;
  last_attempt_at?: string | null;
  updated_at?: string | null;
}

export interface PublicationState {
  status: PublicationStatus;
  article_id?: string | null;
  slug?: string | null;
  version?: number | null;
  published_at?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  update_pending?: boolean;
  history?: Array<Record<string, unknown>>;
}

export interface AuditEvent {
  at: string;
  action: string;
  actor?: string | null;
  details?: Record<string, unknown>;
}

export interface VaultState {
  schema_version: 1;
  ingestion?: IngestionState;
  extraction?: LotExtractionState;
  wikipedia?: WikipediaState;
  identity?: IdentityState;
  research?: ResearchState;
  editorial?: EditorialState;
  publication?: PublicationState;
  image?: ImageMetadata | null;
  audit?: AuditEvent[];
}

export interface IngestionBuildInput {
  status: IngestionStatus;
  attemptId?: string | null;
  parser?: string | null;
  parserVersion?: string | null;
  house?: string | null;
  sourceUrl: string;
  canonicalUrl?: string | null;
  httpStatus?: number | null;
  fetchMethod?: 'direct' | 'scrapingant' | 'unknown';
  fetchedAt?: string | null;
  extractedAt?: string | null;
  executionTimeMs?: number | null;
  warnings?: string[];
  errors?: string[];
  missingFields?: string[];
  image?: ImageMetadata | null;
  rawExcerptChars?: number | null;
  contentHash?: string | null;
}

export interface IngestionResult {
  lot: LotData;
  vault: VaultState;
  status: IngestionStatus;
  warnings: string[];
  errors: string[];
}
