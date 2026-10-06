export interface NormalizedPrice {
  raw?: string;
  currency?: string;
  amountMin?: number;
  amountMax?: number;
  realized?: number;
}

export interface ImageCandidate {
  url: string;
  source?: string;
  width?: number;
  height?: number;
}

export interface LotData {
  title?: string;
  artist?: string;
  estimate?: string;
  price?: string;
  normalizedPrice?: NormalizedPrice;
  description?: string;
  imageUrl?: string;
  imageCandidates?: ImageCandidate[];
  house?: string;
  medium?: string;
  dimensions?: string;
  year?: string;
  auctionDate?: string;
  [key: string]: any;
}
