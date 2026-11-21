export type Lang = 'ru' | 'en';

export interface FrontIssue {
  id: string;
  slug: string;
  lang: Lang;
  number: number | null;
  headline: string;
  excerpt: string;
  summary: string;
  published: number | null;
  publishedAt: string | null;
  createdAt?: string | null;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface FlowEntry {
  id: string;
  slug: string | null;
  type: string;
  lang: Lang;
  text: string;
  at: string | null;
}
