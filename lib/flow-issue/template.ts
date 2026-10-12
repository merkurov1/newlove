
import type { IssueLang } from "./types";

export const ISSUE_SECTION_KEYS = [
  "lead",
  "latest",
  "links",
  "videos",
  "photos",
  "metrics",
  "sources",
  "subscribe",
] as const;

export type IssueSectionKey = (typeof ISSUE_SECTION_KEYS)[number];

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

export const DEFAULT_ISSUE_TEMPLATE: IssueTemplateSettings = {
  theme: {
    accent: "#990F3D",
    paper: "#FFFFFF",
    ink: "#1C1A1B",
    muted: "#6B6568",
    rule: "#DDD6D8",
    maxWidth: 760,
    serifFont: "Georgia, 'Times New Roman', serif",
    sansFont: "Inter, Arial, sans-serif",
  },

  limits: {
    latest: 6,
    links: 5,
    videos: 4,
    photos: 4,
  },

  sections: {
    order: [
      "lead",
      "latest",
      "links",
      "videos",
      "photos",
      "metrics",
      "sources",
      "subscribe",
    ],
    enabled: {
      lead: true,
      latest: true,
      links: true,
      videos: true,
      photos: true,
      metrics: true,
      sources: true,
      subscribe: true,
    },
  },

  labels: {
    ru: {
      masthead: "Поток",
      lead: "Главное. Заметка автора",
      latest: "Последнее в потоке",
      links: "Читать",
      videos: "Смотреть",
      photos: "Кадр",
      metrics: "Цифры подробнее",
      sources: "Указатель источников",
      subscribe: "Подписка",
      subscribeCopy:
        "Раз в неделю из этого собирается выпуск без редакции, только вкус одного человека, умноженный на код.",
    },
    en: {
      masthead: "Flow",
      lead: "Lead story",
      latest: "Latest in Flow",
      links: "Read",
      videos: "Watch",
      photos: "Frames",
      metrics: "By the numbers",
      sources: "Sources",
      subscribe: "Subscribe",
      subscribeCopy:
        "A weekly issue assembled without an editorial desk: one person's taste, multiplied by code.",
    },
  },
};

const HEX = /^#[0-9a-fA-F]{6}$/;

function safeText(
  value: unknown,
  fallback: string,
  maxLength = 240,
): string {
  if (typeof value !== "string") return fallback;
  const result = value.trim().slice(0, maxLength);
  return result || fallback;
}

function safeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX.test(value)
    ? value
    : fallback;
}

function safeLimit(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n)
    ? Math.min(30, Math.max(0, Math.floor(n)))
    : fallback;
}

function safeWidth(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n)
    ? Math.min(1120, Math.max(480, Math.floor(n)))
    : fallback;
}

function safeFont(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const font = value.trim().slice(0, 120);
  // Prevent CSS declaration injection.
  return /^[a-zA-Z0-9 ,'"-]+$/.test(font) ? font : fallback;
}

export function normalizeIssueTemplate(
  input: unknown,
): IssueTemplateSettings {
  const base = DEFAULT_ISSUE_TEMPLATE;
  const value =
    input && typeof input === "object"
      ? (input as Record<string, any>)
      : {};

  const theme = value.theme || {};
  const limits = value.limits || {};
  const sections = value.sections || {};
  const enabled = sections.enabled || {};
  const labels = value.labels || {};

  const requestedOrder = Array.isArray(sections.order)
    ? sections.order.filter(
        (key: unknown): key is IssueSectionKey =>
          typeof key === "string" &&
          ISSUE_SECTION_KEYS.includes(key as IssueSectionKey),
      )
    : [];

  const order = [
    ...new Set<IssueSectionKey>(requestedOrder),
    ...ISSUE_SECTION_KEYS.filter(
      (key) => !requestedOrder.includes(key),
    ),
  ];

  function locale(lang: IssueLang) {
    const source = labels[lang] || {};
    const defaults = base.labels[lang];

    return {
      masthead: safeText(source.masthead, defaults.masthead),
      lead: safeText(source.lead, defaults.lead),
      latest: safeText(source.latest, defaults.latest),
      links: safeText(source.links, defaults.links),
      videos: safeText(source.videos, defaults.videos),
      photos: safeText(source.photos, defaults.photos),
      metrics: safeText(source.metrics, defaults.metrics),
      sources: safeText(source.sources, defaults.sources),
      subscribe: safeText(source.subscribe, defaults.subscribe),
      subscribeCopy: safeText(
        source.subscribeCopy,
        defaults.subscribeCopy,
        1000,
      ),
    };
  }

  return {
    theme: {
      accent: safeColor(theme.accent, base.theme.accent),
      paper: safeColor(theme.paper, base.theme.paper),
      ink: safeColor(theme.ink, base.theme.ink),
      muted: safeColor(theme.muted, base.theme.muted),
      rule: safeColor(theme.rule, base.theme.rule),
      maxWidth: safeWidth(theme.maxWidth, base.theme.maxWidth),
      serifFont: safeFont(
        theme.serifFont,
        base.theme.serifFont,
      ),
      sansFont: safeFont(
        theme.sansFont,
        base.theme.sansFont,
      ),
    },

    limits: {
      latest: safeLimit(limits.latest, base.limits.latest),
      links: safeLimit(limits.links, base.limits.links),
      videos: safeLimit(limits.videos, base.limits.videos),
      photos: safeLimit(limits.photos, base.limits.photos),
    },

    sections: {
      order,
      enabled: {
        lead: enabled.lead !== false,
        latest: enabled.latest !== false,
        links: enabled.links !== false,
        videos: enabled.videos !== false,
        photos: enabled.photos !== false,
        metrics: enabled.metrics !== false,
        sources: enabled.sources !== false,
        subscribe: enabled.subscribe !== false,
      },
    },

    labels: {
      ru: locale("ru"),
      en: locale("en"),
    },
  };
}
