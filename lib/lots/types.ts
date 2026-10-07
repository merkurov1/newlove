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
  source?: ParserSource;
  confidence?: number;
  warnings?: string[];
  raw?: Record<string, any>;
  parseErrors?: string[];
}
