export type AuctionHouse =
  | "christies"
  | "sothebys"
  | "phillips"
  | "bonhams"
  | "unknown";

export type Currency = "USD" | "GBP" | "EUR" | "CHF" | "RUB" | "UNKNOWN";

export const PARSER_SOURCE = {
  HOUSE: "house-parser",
  FALLBACK: "fallback",
  GENERIC_JSON_LD: "generic-json-ld",
} as const;

export type ParserSource = (typeof PARSER_SOURCE)[keyof typeof PARSER_SOURCE];

export interface NormalizedPrice {
  raw?: string;
  currency?: Currency | string;
  amountMin?: number;
  amountMax?: number;
  realized?: number;
}

export interface EstimateRange {
  raw?: string;
  currency?: Currency | string;
  min?: number | null;
  max?: number | null;
}

export interface ImageCandidate {
  url: string;
  source?: string;
  width?: number;
  height?: number;
}

export type ImageAvailability =
  | "mirrored"
  | "hotlink-only"
  | "missing"
  | "unknown";

export type ImagePublicationRights =
  | "unreviewed"
  | "cleared"
  | "restricted"
  | "unknown";

export interface ImageMetadata {
  /** The exact image URL published by the auction house. */
  originalUrl?: string | null;
  /** Supabase Storage object path (not a public URL). */
  storedPath?: string | null;
  /** Public URL for the mirrored image, when available. */
  publicUrl?: string | null;
  /** Where the candidate came from: christies, json-ld, og:image, dom, etc. */
  source?: string | null;
  availability?: ImageAvailability;
  mimeType?: string | null;
  bytes?: number | null;
  sha256?: string | null;
  width?: number | null;
  height?: number | null;
  fetchedAt?: string | null;
  /** Rights are recorded, never assumed. Publication requires review. */
  rights?: {
    basis: "auction-house-original" | "unknown";
    publication: ImagePublicationRights;
    note?: string | null;
  };
  warnings?: string[];
}

export interface LotData {
  auctionHouse?: AuctionHouse;
  lotNumber?: string | null;
  title?: string | null;
  artist?: string | null;
  artistDates?: string | null;
  year?: number | null;
  medium?: string | null;
  dimensions?: string | null;
  signature?: string | null;
  estimate?: EstimateRange | null;
  price?: NormalizedPrice | null;
  sold?: boolean | null;
  description?: string | null;
  lotEssay?: string | null;
  catalogueNote?: string | null;
  conditionReport?: string | null;
  conditionReportStatus?:
    | "available"
    | "unavailable"
    | "login-required"
    | "unknown";
  provenance?: string[];
  exhibitions?: string[];
  literature?: string[];
  auctionDate?: string | null;
  currency?: string | null;
  imageUrl?: string | null;
  imageCandidates?: ImageCandidate[];
  imageMeta?: ImageMetadata | null;
  house?: string;
  url?: string;
  canonicalUrl?: string | null;
  source?: ParserSource;
  parserName?: string | null;
  parserVersion?: string | null;
  confidence?: number;
  warnings?: string[];
  raw?: Record<string, any>;
  parseErrors?: string[];
}
