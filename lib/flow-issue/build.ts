
import { classifyNewItems, heuristicLanguage } from "./deepseek";
import {
  DEFAULT_ISSUE_TEMPLATE,
  normalizeIssueTemplate,
} from "./template";
import type {
  FlowItem,
  IssueEntry,
  IssueKind,
  IssueLang,
  IssuePayload,
  IssueTemplateSettings,
} from "./types";

const SITE = "https://www.merkurov.love";
const DAY = 86_400_000;

const SELECT_ITEMS =
  "id,type,status,visibility,lang,slug,title,body_md,source_url,ai_allowed,metadata,created_at,updated_at,published_at";

const safeDate = (value: unknown): Date | null => {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const clean = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const itemText = (item: FlowItem) =>
  [item.title, item.body_md].map(clean).filter(Boolean).join("\n\n");

const itemHasContent = (item: FlowItem) =>
  Boolean(clean(item.title) || clean(item.body_md));

const itemUrl = (item: FlowItem) => {
  const metadata = item.metadata || {};
  const raw =
    clean(metadata.canonical_url) ||
    clean(item.source_url) ||
    clean(item.slug && `${SITE}/flow/${item.slug}`);

  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

const metadataText = (item: IssueEntry, key: string) =>
  clean(item.metadata?.[key]);

function isOwn(item: FlowItem, url: string | null) {
  if (item.type === "note" || item.type === "photo") return true;
  if (!url) return false;

  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "merkurov.love" || host.endsWith(".merkurov.love");
  } catch {
    return false;
  }
}

function inferLanguage(item: FlowItem): IssueLang | "other" {
  const cached = item.metadata?.issue_ai;
  if (
    cached?.lang === "ru" ||
    cached?.lang === "en" ||
    cached?.lang === "other"
  ) {
    return cached.lang;
  }

  return heuristicLanguage(itemText(item));
}

function inferKind(item: FlowItem): IssueKind {
  const cached = item.metadata?.issue_ai?.kind;
  if (
    cached === "about_flow" ||
    cached === "world" ||
    cached === "other"
  ) {
    return cached;
  }

  return "other";
}

function toEntry(item: FlowItem): IssueEntry {
  const metadata = item.metadata || {};
  const url = itemUrl(item);

  return {
    id: item.id,
    type: item.type,
    title:
      clean(item.title) ||
      clean(metadata.title) ||
      clean(metadata.youtube?.title),
    body: clean(item.body_md),
    url,
    publishedAt: item.published_at || item.created_at,
    createdAt: item.created_at,
    metadata,
    lang: inferLanguage(item),
    kind: inferKind(item),
    own: isOwn(item, url),
  };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function formatDuration(
  seconds: number,
  lang: IssueLang = "ru",
) {
  const value = Math.max(0, Math.round(seconds));

  if (lang === "en") {
    if (value < 60) return `${value}s`;
    if (value < 3600) return `${Math.round(value / 60)}m`;

    const hours = Math.floor(value / 3600);
    const minutes = Math.round((value % 3600) / 60);
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  if (value < 60) return `${value} с`;
  if (value < 3600) return `${Math.round(value / 60)} мин`;

  const hours = Math.floor(value / 3600);
  const minutes = Math.round((value % 3600) / 60);
  return minutes ? `${hours} ч ${minutes}` : `${hours} ч`;
}

function countBy<T extends string>(
  values: T[],
): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function calculateMetrics(
  items: FlowItem[],
  drafts: FlowItem[],
  start: Date,
  end: Date,
) {
  const published = items.filter(
    (item) =>
      item.status === "published" &&
      item.visibility === "public" &&
      itemHasContent(item),
  );

  const delays = published
    .map((item) => {
      const created = safeDate(item.created_at);
      const publishedAt = safeDate(item.published_at);

      if (!created || !publishedAt) return null;

      return Math.max(
        0,
        Math.round(
          (publishedAt.getTime() - created.getTime()) / 1000,
        ),
      );
    })
    .filter((value): value is number => value !== null);

  const entries = published.map(toEntry);
  const dayCounts = new Map<string, number>();
  const hourCounts = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: 0,
  }));

  for (const item of published) {
    const date = safeDate(item.published_at);
    if (!date) continue;

    const key = dayKey(date);
    dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
    hourCounts[date.getUTCHours()].count++;
  }

  const byType = countBy(published.map((item) => item.type));
  const byKind = countBy(entries.map((item) => item.kind));

  const mismatch = published.filter((item) => {
    const detected = inferLanguage(item);
    return detected !== "other" && item.lang !== detected;
  }).length;

  const altEqualsFilename = published.filter((item) => {
    if (item.type !== "photo") return false;

    const alt = clean(item.metadata?.alt);
    const filename = clean(item.metadata?.filename);

    return Boolean(alt && filename && alt === filename);
  }).length;

  const emptyDrafts = drafts.filter(
    (item) => !itemHasContent(item),
  ).length;

  const startDay = new Date(start);
  startDay.setUTCHours(0, 0, 0, 0);

  const endDay = new Date(end);
  endDay.setUTCHours(0, 0, 0, 0);

  const perDay: { date: string; count: number }[] = [];

  for (
    let cursor = startDay.getTime();
    cursor <= endDay.getTime();
    cursor += DAY
  ) {
    const date = new Date(cursor);
    perDay.push({
      date: dayKey(date),
      count: dayCounts.get(dayKey(date)) || 0,
    });
  }

  const delayBuckets = new Map<number, number>();

  for (const seconds of delays) {
    const bucket =
      seconds <= 0 ? 0 : Math.floor(Math.log10(seconds));

    delayBuckets.set(
      bucket,
      (delayBuckets.get(bucket) || 0) + 1,
    );
  }

  const delayDistribution = [...delayBuckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([bucket, count]) => ({
      seconds: bucket === 0 ? 1 : Math.pow(10, bucket),
      count,
    }));

  return {
    total: published.length + drafts.length,
    published: published.length,
    drafts: drafts.length,
    days: Math.max(
      1,
      Math.ceil((end.getTime() - start.getTime()) / DAY),
    ),
    medianDelaySeconds: median(delays),
    byType,
    byKind: {
      about_flow: byKind.about_flow || 0,
      world: byKind.world || 0,
      other: byKind.other || 0,
    },
    own: entries.filter((entry) => entry.own).length,
    external: entries.filter((entry) => !entry.own).length,
    byUtcHour: hourCounts,
    perDay,
    delays: delayDistribution,
    quality: {
      langFieldMismatch: mismatch,
      photoAltEqualsFilename: altEqualsFilename,
      emptyDrafts,
    },
  };
}

async function loadActiveTemplate(
  supabase: any,
): Promise<{
  version: number;
  config: IssueTemplateSettings;
}> {
  const { data, error } = await supabase
    .from("flow_issue_template_versions")
    .select("version,config")
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;

  return {
    version: Number(data?.version) || 0,
    config: normalizeIssueTemplate(
      data?.config ?? DEFAULT_ISSUE_TEMPLATE,
    ),
  };
}

export async function resolveIssueWindow(
  supabase: any,
  lang: IssueLang,
  requestedStart?: string | null,
  requestedEnd?: string | null,
) {
  const end = safeDate(requestedEnd) || new Date();

  if (requestedStart) {
    const start = safeDate(requestedStart);

    if (!start) {
      throw new Error("Некорректная дата начала периода.");
    }

    if (start.getTime() >= end.getTime()) {
      throw new Error(
        "Начало периода должно быть раньше окончания.",
      );
    }

    return { start, end };
  }

  const { data: lastIssue, error: lastError } = await supabase
    .from("letters")
    .select("period_end")
    .eq("kind", "issue")
    .eq("lang", lang)
    .eq("status", "published")
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastError) throw lastError;

  const previousEnd = safeDate(lastIssue?.period_end);

  if (previousEnd) return { start: previousEnd, end };

  const { data: firstItem, error: firstError } = await supabase
    .from("items")
    .select("published_at,created_at")
    .eq("status", "published")
    .eq("visibility", "public")
    .not("published_at", "is", null)
    .order("published_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (firstError) throw firstError;

  const start =
    safeDate(firstItem?.published_at) ||
    safeDate(firstItem?.created_at) ||
    end;

  return { start, end };
}

export async function buildIssuePayload(
  supabase: any,
  lang: IssueLang,
  start: Date,
  end: Date,
): Promise<IssuePayload> {
  const [publishedResult, draftsResult, activeTemplate] =
    await Promise.all([
      supabase
        .from("items")
        .select(SELECT_ITEMS)
        .eq("status", "published")
        .eq("visibility", "public")
        .gte("published_at", start.toISOString())
        .lte("published_at", end.toISOString())
        .order("published_at", { ascending: false }),

      supabase
        .from("items")
        .select(SELECT_ITEMS)
        .eq("status", "draft")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString()),

      loadActiveTemplate(supabase),
    ]);

  if (publishedResult.error) throw publishedResult.error;
  if (draftsResult.error) throw draftsResult.error;

  const drafts = (draftsResult.data || []) as FlowItem[];

  const published = (
    (publishedResult.data || []) as FlowItem[]
  ).filter(
    (item) =>
      safeDate(item.published_at) !== null &&
      itemHasContent(item),
  );

  // The classifier is only used for metadata. Original Flow text
  // is never rewritten by the issue builder.
  await classifyNewItems(supabase, published);

  const ids = published.map((item) => item.id);
  let classifiedItems = published;

  if (ids.length) {
    const { data, error } = await supabase
      .from("items")
      .select(SELECT_ITEMS)
      .in("id", ids);

    if (error) throw error;
    classifiedItems = (data || []) as FlowItem[];
  }

  const entries = classifiedItems
    .map(toEntry)
    .filter((entry) => entry.lang === lang)
    .sort((a, b) =>
      b.publishedAt.localeCompare(a.publishedAt),
    );

  const { config: template, version: templateVersion } =
    activeTemplate;

  const lead =
    entries.find((entry) => entry.type === "note") ||
    entries[0] ||
    null;

  const latest = entries.slice(0, template.limits.latest);

  const links = entries
    .filter((entry) => entry.type === "link")
    .slice(0, template.limits.links)
    .map((entry) => {
      const metadata = entry.metadata;
      const originalDate =
        safeDate(metadata.published_at)?.toISOString() || null;
      const addedAt = safeDate(entry.publishedAt);
      const original = safeDate(originalDate);

      const ageDays =
        addedAt && original
          ? Math.max(
              0,
              Math.floor(
                (addedAt.getTime() - original.getTime()) / DAY,
              ),
            )
          : null;

      return {
        ...entry,
        description: metadataText(entry, "description"),
        siteName:
          clean(metadata.site_name) || clean(metadata.domain),
        author: clean(metadata.author),
        image: clean(metadata.image),
        originalDate,
        ageDays,
      };
    });

  const videos = entries
    .filter((entry) => entry.type === "video")
    .slice(0, template.limits.videos)
    .map((entry) => {
      const videoId = clean(entry.metadata.youtube?.video_id);

      return {
        ...entry,
        title:
          clean(entry.metadata.youtube?.title) || entry.title,
        image: clean(entry.metadata.youtube?.thumbnail_url),
        videoId: videoId || null,
        url: videoId
          ? `https://www.youtube.com/watch?v=${videoId}`
          : entry.url,
      };
    });

  const photos = entries
    .filter((entry) => entry.type === "photo")
    .slice(0, template.limits.photos)
    .map((entry) => ({
      ...entry,
      image: clean(entry.metadata.public_url),
      alt: clean(entry.metadata.alt),
      caption: entry.body,
    }));

  const sourceIndex = entries
    .filter(
      (entry) =>
        entry.type === "link" || entry.type === "video",
    )
    .map((entry) => ({
      id: entry.id,
      source:
        clean(entry.metadata.site_name) ||
        clean(entry.metadata.domain) ||
        "—",
      title: entry.title,
      url: entry.url,
      originalDate:
        safeDate(entry.metadata.published_at)?.toISOString() ||
        null,
      addedAt: entry.publishedAt,
    }));

  const stats = calculateMetrics(
    [...published, ...drafts],
    drafts,
    start,
    end,
  );

  return {
    schemaVersion: 2,
    lang,
    period: {
      start: start.toISOString(),
      end: end.toISOString(),
      timezone: "UTC",
    },
    stats,
    lead,
    latest,
    links,
    videos,
    photos,
    sourceIndex,
    templateVersion,
    template,
    design: {
      // Retain the old property for compatibility with older code.
      template: "classic",
      tokens: {
        accent: template.theme.accent,
        paper: template.theme.paper,
        ink: template.theme.ink,
      },
    },
  };
}
