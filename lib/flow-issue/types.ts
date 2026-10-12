
export type IssueLang = "ru" | "en";
export type IssueStatus = "draft" | "published";
export type IssueKind = "about_flow" | "world" | "other";
export type ItemType = "note" | "link" | "video" | "photo";

export type IssueAI = {
  lang: IssueLang | "other";
  kind: IssueKind;
  model: string;
  at: string;
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

export type IssuePayload = {
  schemaVersion: 1;
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
  // Reserved for a future, explicitly opt-in model annotation.
  modelAnnotation?: string | null;
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
