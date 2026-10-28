
import {
  classifyNewItems,
  heuristicLanguage,
  translateIssueEntries,
} from "./deepseek";
import { candidateFromItem, selectIssueContent } from "./editorial";
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

const clean = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const safeDate = (value: unknown): Date | null => {
  if (typeof value !== "string" && !(value instanceof Date)) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const itemText = (item: FlowItem) =>
  [item.title, item.body_md].map(clean).filter(Boolean).join("\n\n");

/**
 * Metrics keep their original eligibility rule: a published record with a
 * title or body. Do not broaden this without treating it as a metrics change.
 */
const itemHasCoreContent = (item: FlowItem): boolean =>
  Boolean(clean(item.title) || clean(item.body_md));

/**
 * Selection eligibility is broader: a link or video whose only usable text is
 * preview metadata is still a real candidate, even though it never counted
 * toward the old metrics denominator.
 */
const itemIsSelectable = (item: FlowItem): boolean => {
  if (itemHasCoreContent(item)) return true;

  const metadata = item.metadata || {};

  switch (item.type) {
    case "link":
      return Boolean(clean(metadata.title) || clean(metadata.description));
    case "video":
      return Boolean(
        clean(metadata.youtube?.title) ||
          clean(metadata.youtube?.video_id),
      );
    case "photo":
      return Boolean(
        clean(metadata.public_url) ||
          clean(metadata.alt) ||
          clean(metadata.caption),
      );
    default:
      return Boolean(clean(metadata.title) || clean(metadata.description));
  }
};

const itemUrl = (item: FlowItem): string | null => {
  const metadata = item.metadata || {};

  const raw =
    clean(metadata.canonical_url) ||
    clean(item.source_url) ||
    (item.slug ? `${SITE}/flow/${item.slug}` : "");

  try {
    const url = new URL(raw);

    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

function isOwn(item: FlowItem, url: string | null): boolean {
  if (item.type === "note" || item.type === "photo") {
    return true;
  }

  if (!url) return false;

  try {
    const host = new URL(url).hostname.toLowerCase();

    return (
      host === "merkurov.love" ||
      host.endsWith(".merkurov.love")
    );
  } catch {
    return false;
  }
}

function inferLanguage(item: FlowItem): IssueLang | "other" {
  if (item.lang === "ru" || item.lang === "en") {
    return item.lang;
  }

  const cached = item.metadata?.issue_ai?.lang;

  if (cached === "ru" || cached === "en" || cached === "other") {
    return cached;
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
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function countBy<T extends string>(
  values: T[],
): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function calculateMetrics(
  published: FlowItem[],
  start: Date,
  end: Date,
): IssuePayload["stats"] {
  const entries = published.map(toEntry);

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

  const dayCounts = new Map<string, number>();
  const byUtcHour = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: 0,
  }));

  for (const item of published) {
    const date = safeDate(item.published_at);
    if (!date) continue;

    const key = dayKey(date);
    dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
    byUtcHour[date.getUTCHours()].count++;
  }

  const byType = countBy(published.map((item) => item.type));
  const byKind = countBy(entries.map((entry) => entry.kind));

  const mismatch = published.filter((item) => {
    const detected = inferLanguage(item);
    return detected !== "other" && item.lang !== detected;
  }).length;

  const photoAltEqualsFilename = published.filter((item) => {
    if (item.type !== "photo") return false;

    const alt = clean(item.metadata?.alt);
    const filename = clean(item.metadata?.filename);

    return Boolean(alt && filename && alt === filename);
  }).length;

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
    const key = dayKey(date);

    perDay.push({
      date: key,
      count: dayCounts.get(key) || 0,
    });
  }

  const delayBuckets = new Map<number, number>();

  for (const seconds of delays) {
    const bucket = seconds <= 0 ? 0 : Math.floor(Math.log10(seconds));

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
    // Count only records included in the published issue.
    total: published.length,
    published: published.length,
    drafts: 0,
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
    byUtcHour,
    perDay,
    delays: delayDistribution,
    quality: {
      langFieldMismatch: mismatch,
      photoAltEqualsFilename,
      emptyDrafts: 0,
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
      throw new Error("Начало периода должно быть раньше окончания.");
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

  if (previousEnd) {
    if (previousEnd.getTime() >= end.getTime()) {
      throw new Error(
        "Конец периода должен быть позже конца предыдущего опубликованного выпуска.",
      );
    }

    return { start: previousEnd, end };
  }

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
  const [publishedResult, activeTemplate] = await Promise.all([
    supabase
      .from("items")
      .select(SELECT_ITEMS)
      .eq("status", "published")
      .eq("visibility", "public")
      .gte("published_at", start.toISOString())
      .lte("published_at", end.toISOString())
      .order("published_at", { ascending: false }),

    loadActiveTemplate(supabase),
  ]);

  if (publishedResult.error) throw publishedResult.error;

  const records = ((publishedResult.data || []) as FlowItem[]).filter(
    (item) => safeDate(item.published_at) !== null,
  );

  const published = records.filter(itemIsSelectable);

  // Preserve the pre-existing metrics denominator (title/body records only).
  const metricSource = records.filter(itemHasCoreContent);

  // Analysis only enriches metadata; it does not rewrite Flow text.
  const analyses = await classifyNewItems(supabase, published);

  const ids = published.map((item) => item.id);
  let classifiedItems = published;

  if (ids.length > 0) {
    const { data, error } = await supabase
      .from("items")
      .select(SELECT_ITEMS)
      .in("id", ids);

    if (error) throw error;

    classifiedItems = ((data || []) as FlowItem[]).map((item) => {
      const analysis = analyses.get(item.id);

      // Only AI-eligible records may carry AI metadata. The per-run map is
      // merged so a failed cache write does not discard a valid analysis.
      if (!analysis || item.ai_allowed !== true) return item;

      return {
        ...item,
        metadata: {
          ...(item.metadata || {}),
          issue_ai: analysis,
        },
      };
    });
  }

  // Crucial: do not filter records by language here.
  // Both language versions must be built from this same canonical set.
  const candidates = classifiedItems.map((item) =>
    candidateFromItem(item, toEntry(item), end),
  );

  const { config: template, version: templateVersion } =
    activeTemplate;

  const selection = selectIssueContent(
    candidates,
    template.limits,
    end,
  );

  const lead = selection.lead;
  const latest = selection.latest;

  const links = selection.links.map((entry) => {
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
      description: clean(metadata.description),
      siteName:
        clean(metadata.site_name) ||
        clean(metadata.domain),
      author: clean(metadata.author),
      image: clean(metadata.image),
      originalDate,
      ageDays,
    };
  });

  const videos = selection.videos.map((entry) => {
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

  const photos = selection.photos.map((entry) => ({
    ...entry,
    image: clean(entry.metadata.public_url),
    alt: clean(entry.metadata.alt),
    caption: entry.body,
  }));

  // The source index describes the issue that was actually assembled,
  // not every external record in the period.
  const externalEntries: IssueEntry[] = [];

  if (lead && (lead.type === "link" || lead.type === "video")) {
    externalEntries.push(lead);
  }

  externalEntries.push(...selection.links, ...selection.videos);

  const sourceIndex = externalEntries
    .filter(
      (entry, index, all) =>
        all.findIndex((candidate) => candidate.id === entry.id) ===
        index,
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

  // Explicit payload shape prevents TypeScript from inferring lead as
  // a non-null IssueEntry and fixes the nullable-lead assignment error.
  type IssueContent = Pick<
    IssuePayload,
    "lead" | "latest" | "links" | "videos" | "photos" | "sourceIndex"
  >;

  let payloadEntries: IssueContent = {
    lead,
    latest,
    links,
    videos,
    photos,
    sourceIndex,
  };

  if (lang === "en") {
    const aiAllowedById = new Map(
      classifiedItems.map((item) => [
        item.id,
        item.ai_allowed === true,
      ]),
    );
    const translationInput: {
      key: string;
      title: string;
      body: string;
      description: string;
      alt: string;
      caption: string;
      aiAllowed: boolean;
    }[] = [];

    if (lead) {
      translationInput.push({
        key: "lead",
        title: lead.title || "",
        body: lead.body || "",
        description: "",
        alt: "",
        caption: "",
        aiAllowed: aiAllowedById.get(lead.id) === true,
      });
    }

    latest.forEach((entry, index) => {
      translationInput.push({
        key: `latest:${index}`,
        title: entry.title || "",
        body: entry.body || "",
        description: "",
        alt: "",
        caption: "",
        aiAllowed: aiAllowedById.get(entry.id) === true,
      });
    });

    links.forEach((entry, index) => {
      translationInput.push({
        key: `links:${index}`,
        title: entry.title || "",
        body: entry.body || "",
        description:
          typeof entry.description === "string"
            ? entry.description
            : "",
        alt: "",
        caption: "",
        aiAllowed: aiAllowedById.get(entry.id) === true,
      });
    });

    videos.forEach((entry, index) => {
      translationInput.push({
        key: `videos:${index}`,
        title: entry.title || "",
        body: entry.body || "",
        description: "",
        alt: "",
        caption: "",
        aiAllowed: aiAllowedById.get(entry.id) === true,
      });
    });

    photos.forEach((entry, index) => {
      translationInput.push({
        key: `photos:${index}`,
        title: entry.title || "",
        body: entry.body || "",
        description: "",
        alt: typeof entry.alt === "string" ? entry.alt : "",
        caption:
          typeof entry.caption === "string"
            ? entry.caption
            : "",
        aiAllowed: aiAllowedById.get(entry.id) === true,
      });
    });

    const translated = await translateIssueEntries(translationInput);
    const translations = new Map(
      translated.map((entry) => [entry.key, entry]),
    );

    const translateEntry = <T extends { title: string; body: string }>(
      entry: T,
      key: string,
    ): T => {
      const tr = translations.get(key);
      if (!tr) return entry;

      return {
        ...entry,
        title: tr.title || entry.title,
        body: tr.body || entry.body,
      };
    };

    const translationKeyById = new Map<string, string>();

    links.forEach((entry, index) =>
      translationKeyById.set(entry.id, `links:${index}`),
    );
    videos.forEach((entry, index) =>
      translationKeyById.set(entry.id, `videos:${index}`),
    );

    payloadEntries = {
      lead: lead ? translateEntry(lead, "lead") : null,

      latest: latest.map((entry, index) =>
        translateEntry(entry, `latest:${index}`),
      ),

      links: links.map((entry, index) => {
        const tr = translations.get(`links:${index}`);
        if (!tr) return entry;

        return {
          ...entry,
          title: tr.title || entry.title,
          body: tr.body || entry.body,
          description: tr.description || entry.description,
        };
      }),

      videos: videos.map((entry, index) =>
        translateEntry(entry, `videos:${index}`),
      ),

      photos: photos.map((entry, index) => {
        const tr = translations.get(`photos:${index}`);
        if (!tr) return entry;

        return {
          ...entry,
          title: tr.title || entry.title,
          body: tr.body || entry.body,
          alt: tr.alt || entry.alt,
          caption: tr.caption || entry.caption,
        };
      }),

      sourceIndex: sourceIndex.map((source) => {
        const key = translationKeyById.get(source.id);
        const tr = key ? translations.get(key) : undefined;

        return tr
          ? { ...source, title: tr.title || source.title }
          : source;
      }),
    };
  }

  const classifiedById = new Map(
    classifiedItems.map((item) => [item.id, item]),
  );
  const metricItems = metricSource.map(
    (item) => classifiedById.get(item.id) || item,
  );
  const stats = calculateMetrics(metricItems, start, end);

  // Keep the metrics unambiguous: published records are counted once;
  // drafts are not included in the issue header.
  const displayStats = {
    ...stats,
    total: undefined,
    drafts: undefined,
  } as unknown as IssuePayload["stats"];

  return {
    schemaVersion: 2,
    lang,
    period: {
      start: start.toISOString(),
      end: end.toISOString(),
      timezone: "UTC",
    },
    stats: displayStats,
    lead: payloadEntries.lead,
    latest: payloadEntries.latest,
    links: payloadEntries.links,
    videos: payloadEntries.videos,
    photos: payloadEntries.photos,
    sourceIndex: payloadEntries.sourceIndex,
    templateVersion,
    template,
    design: {
      template: "classic",
      tokens: {
        accent: template.theme.accent,
        paper: template.theme.paper,
        ink: template.theme.ink,
      },
    },
  };
}
