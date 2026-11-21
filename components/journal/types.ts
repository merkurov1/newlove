export type Lang = 'ru' | 'en';

export interface FrontIssue {
  id: string;
  slug: string;
  lang: Lang;
  number: number | null;
  headline: string;
  /** Short fallback description used by compact archive rows. */
  excerpt: string;
  /** Human-readable type breakdown, e.g. "Notes 3, Links 1". */
  summary: string;
  published: number | null;
  publishedAt: string | null;
  createdAt?: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  /** Full editorial lead from the stored issue payload. */
  lead?: string;
  /** Narrative summary written for the issue. */
  editorialSummary?: string;
  /** Raw type counts from payload.stats.byType. */
  typeCounts?: Record<string, number>;
}

export interface FlowEntry {
  id: string;
  slug: string | null;
  type: string;
  lang: Lang;
  text: string;
  at: string | null;
}
