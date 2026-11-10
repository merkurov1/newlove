/**
 * Web evidence is independent from Brain evidence. It is deliberately a
 * separate type so a web result can never be mistaken for an owner-authorized
 * knowledge chunk, and so the full extracted page text never leaves the
 * server.
 */

export type WebSearchOutcome = 'relevant_results' | 'no_results' | 'unavailable';

export type WebSearchUnavailableCode =
  | 'disabled'
  | 'missing_api_key'
  | 'invalid_query'
  | 'timeout'
  | 'http_error'
  | 'network_error'
  | 'invalid_response';

export type WebEvidenceSource = {
  /** 1-based citation index, in Exa relevance order. */
  index: number;
  title: string;
  url: string;
  domain: string;
  publishedAt: string | null;
  author: string | null;
  /** Bounded extracted text. Server-side only; never returned to the browser whole. */
  text: string;
  /** Exa highlight fragments used to build `text`, when supplied. */
  highlights?: string[];
};

export type WebEvidenceSourceSummary = Omit<WebEvidenceSource, 'text'> & {
  excerpt: string;
};

export type WebSearchResult = {
  outcome: WebSearchOutcome;
  query: string;
  sources: WebEvidenceSource[];
  latencyMs: number;
  code?: WebSearchUnavailableCode;
};

export type PierrotAnswerSourceMode =
  | 'model'
  | 'brain'
  | 'web'
  | 'media'
  | 'brain+web'
  | 'brain+media'
  | 'media+web'
  | 'brain+media+web';

export type PierrotAnswerSources = {
  mode: PierrotAnswerSourceMode;
  label:
    | 'MODEL'
    | 'BRAIN'
    | 'WEB'
    | 'MEDIA'
    | 'BRAIN + WEB'
    | 'BRAIN + MEDIA'
    | 'MEDIA + WEB'
    | 'BRAIN + MEDIA + WEB';
  model: boolean;
  brain: boolean;
  web: boolean;
  media: boolean;
};

/**
 * Informational only. This does not expose a user-controlled search mode; the
 * server decides which sources actually contributed to the answer.
 */
export function buildPierrotAnswerSources(input: {
  brain: boolean;
  media?: boolean;
  web: boolean;
}): PierrotAnswerSources {
  const brain = input.brain;
  const media = input.media === true;
  const web = input.web;
  const selected = [
    brain ? 'brain' : null,
    media ? 'media' : null,
    web ? 'web' : null,
  ].filter((value): value is 'brain' | 'media' | 'web' => Boolean(value));
  const mode: PierrotAnswerSourceMode =
    selected.length === 0
      ? 'model'
      : (selected.join('+') as PierrotAnswerSourceMode);
  const label = (
    selected.length === 0 ? 'MODEL' : selected.join(' + ').toUpperCase()
  ) as PierrotAnswerSources['label'];

  return {
    mode,
    label,
    model: true,
    brain,
    media,
    web,
  };
}
