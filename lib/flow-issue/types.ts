
export type IssueLang = "ru" | "en";
export type IssueStatus = "draft" | "published";
export type IssueKind = "about_flow" | "world" | "other";
export type ItemType = "note" | "link" | "video" | "photo";

/**
 * The editorial role is a recommendation from the model. Selection still
 * applies explicit thresholds and diversity/redundancy rules, so a model
 * cannot unilaterally promote an item.
 */
export type IssueAIRole =
  | "lead"
  | "supporting"
  | "link"
  | "visual"
  | "omit";

/**
 * Analysis cached in `items.metadata.issue_ai`.
 *
 * Legacy records only have { lang, kind, model, at }. New fields are
 * optional so old cached records and old payloads remain valid.
 */
export type IssueAI = {
  lang: IssueLang | "other";
  kind: IssueKind;
  model: string;
  at: string;

  /** Schema version of the extended analysis (legacy records omit it). */
  schemaVersion?: number;
  /** Hash of the exact source material sent for analysis. */
  contentHash?: string;
  topic?: string;
  subtopic?: string;
  summary?: string;
  thesis?: string;
  /** Integer 0–5. 0 means the quality is absent, 5 means exceptional. */
  editorialValue?: number;
  /** Integer 0–5. Distinctiveness of the observation or selection. */
  originality?: number;
  /** Integer 0–5. Concrete detail, evidence, precision. */
  specificity?: number;
  /** Integer 0–5. What a thoughtful reader gains. */
  readerValue?: number;
  /** What the reader needs to know that the item does not explain. */
  contextRequired?: string;
  /** 0–1 confidence in the analysis given only the supplied material. */
  confidence?: number;
  role?: IssueAIRole;
  rationale?: string;
};

export type FlowItem = {
  id: string;
  type: ItemType | string;
  status: string;
  visibility: string;
  lang: string | null;
  slug: string | null;
  title: string | null;
  body_md: string | null;
  source_url: string | null;
  ai_allowed: boolean;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

export type IssueEntry = {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
  publishedAt: string;
  createdAt: string;
  metadata: Record<string, any>;
  lang: IssueLang | "other";
  kind: IssueKind;
  own: boolean;
};

export type IssueSectionKey =
  | "lead"
  | "latest"
  | "links"
  | "videos"
  | "photos"
  | "metrics"
  | "sources"
  | "subscribe";

export type IssueTemplateSettings = {
  theme: {
    accent: string;
    paper: string;
    ink: string;
    muted: string;
    rule: string;
    maxWidth: number;
    serifFont: string;
    sansFont: string;
  };
  limits: {
    latest: number;
    links: number;
    videos: number;
    photos: number;
  };
  sections: {
    order: IssueSectionKey[];
    enabled: Record<IssueSectionKey, boolean>;
  };
  labels: Record<
    IssueLang,
    {
      masthead: string;
      lead: string;
      latest: string;
      links: string;
      videos: string;
      photos: string;
      metrics: string;
      sources: string;
      subscribe: string;
      subscribeCopy: string;
    }
  >;
};

export type IssuePayload = {
  schemaVersion: 2;
  lang: IssueLang;
  period: {
    start: string;
    end: string;
    timezone: "UTC";
  };
  stats: {
    total: number;
    published: number;
    drafts: number;
    days: number;
    medianDelaySeconds: number | null;
    byType: Record<string, number>;
    byKind: Record<IssueKind, number>;
    own: number;
    external: number;
    byUtcHour: { hour: number; count: number }[];
    perDay: { date: string; count: number }[];
    delays: { seconds: number; count: number }[];
    quality: {
      langFieldMismatch: number;
      photoAltEqualsFilename: number;
      emptyDrafts: number;
    };
  };
  lead: (IssueEntry & { annotation?: string }) | null;
  latest: IssueEntry[];
  links: (IssueEntry & {
    description: string;
    siteName: string;
    author: string;
    image: string;
    originalDate: string | null;
    ageDays: number | null;
  })[];
  videos: (IssueEntry & {
    image: string;
    videoId: string | null;
  })[];
  photos: (IssueEntry & {
    image: string;
    alt: string;
    caption: string;
  })[];
  sourceIndex: {
    id: string;
    source: string;
    title: string;
    url: string | null;
    originalDate: string | null;
    addedAt: string;
  }[];
  modelAnnotation?: string | null;

  /** Immutable snapshot of the template used to build this issue. */
  templateVersion: number;
  template: IssueTemplateSettings;

  /** Kept for compatibility with the previous renderer and stored payloads. */
  design: {
    template: "classic" | "spread" | "data";
    tokens: {
      accent: string;
      paper: string;
      ink: string;
    };
  };
};

export type IssueRecord = {
  id: string;
  title: string;
  slug: string;
  content: string;
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  kind: "letter" | "issue";
  lang: IssueLang | null;
  number: number | null;
  period_start: string | null;
  period_end: string | null;
  status: IssueStatus | null;
  payload: IssuePayload | null;
  html_web: string | null;
  html_email: string | null;
  text_email: string | null;
  issue_sent_at: string | null;
};
