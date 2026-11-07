export type KrassLang = 'en' | 'ru';

export type KrassConfidence = 'verified' | 'corroborated' | 'probable' | 'unknown';

export type KrassObjectType =
  | 'poster'
  | 'booklet-spread'
  | 'leaflet'
  | 'book-spread'
  | 'album-cover';

export type KrassScan = {
  width: number;
  height: number;
  bytes: number;
  colorspace: string;
  orientation: string;
  make: string;
  model: string;
  dateTimeOriginal: string;
  software: string;
  description: string;
  aspectRatio: number;
  icc?: string;
};

export type KrassItem = {
  id: string;
  file: string;
  order: number;
  type: KrassObjectType;
  titleRu: string;
  titleEn: string;
  filmYear: number | null;
  posterYear: number | null;
  director: string[] | null;
  artist: string | null;
  artistConfidence: KrassConfidence;
  publisher: string | null;
  technique: string | null;
  dimensionsCm: string | null;
  edition: string | null;
  price: string | null;
  inscriptions: string[];
  condition: string;
  scanNotes: string;
  sources: string[];
  confidence: KrassConfidence;
  notes: string;
  notesEn: string;
  imageUrl: string;
  scan: KrassScan;
};

export type KrassCatalog = {
  generatedAt: string;
  source: string;
  bucket: string;
  directory: string;
  count: number;
  items: KrassItem[];
};
