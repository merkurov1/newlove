// data/media.ts — single source of truth for /media. Supabase-ready:
// replace MEDIA with a server fetch returning MediaRecord[] and nothing else changes.

export type MediaType =
  | "article" | "interview" | "broadcast" | "video"
  | "conference" | "profile" | "institutional" | "heritage";

export type MediaRole =
  | "author" | "interviewee" | "quoted" | "speaker"
  | "subject" | "heritage_representative";

export type MediaTier = "primary" | "institutional" | "context";

export type MediaRecord = {
  id: string;
  slug: string;
  /** "YYYY-MM-DD" | "YYYY-MM" | "YYYY" — never invent a precise date */
  date: string;
  year: number;
  title: string;
  titleEn?: string;
  publication: string;
  country: string;
  /** ISO 639-1: "en" | "ru" | "de" | "fr" ... */
  language: string;
  /** exact direct URL to the material — never a homepage or search page */
  url: string;
  canonicalSource?: string;
  syndicationSources?: string[];
  type: MediaType;
  role: MediaRole;
  topics: string[];
  description?: string;
  tier: MediaTier;
  verified: boolean;
  featured?: boolean;
  // future semantic layer
  entities?: string[];
  semanticTopics?: string[];
  relatedRecords?: string[];
  embedding?: number[];
};

// Fill from the cleaned archive. Records without a confirmed direct URL:
// verified: false, tier: "context" — they will not render a SOURCE link or count in stats.
export const MEDIA: MediaRecord[] = [];
