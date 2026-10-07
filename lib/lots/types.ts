export type AuctionHouse =
  | "christies"
  | "sothebys"
  | "phillips"
  | "bonhams"
  | "unknown";

export type Currency = "USD" | "GBP" | "EUR" | "CHF" | "RUB" | "UNKNOWN";

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

/**
 * Normalized lot data structure returned by all parsers.
 * Provides a unified interface regardless of source auction house.
 */
export interface LotData {
  auctionHouse?: AuctionHouse;
  lotNumber?: string | null;
  title?: string | null;
  artist?: string | null;
  artistDates?: string | null;
  year?: number | null;
  medium?: string | null;
  dimensions?: string | null;
  estimate?: EstimateRange | null;
  price?: NormalizedPrice | null;
  sold?: boolean | null;
  description?: string | null;
  imageUrl?: string | null;
  imageCandidates?: ImageCandidate[];
  house?: string;
  auctionDate?: string | null;
  url?: string;
  raw?: Record<string, any>;
  parseErrors?: string[];
}