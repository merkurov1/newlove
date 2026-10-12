
import type {
  IssueEntry,
  IssuePayload,
  IssueLang,
  IssueSectionKey,
  IssueTemplateSettings,
} from "./types";
import {
  DEFAULT_ISSUE_TEMPLATE,
  normalizeIssueTemplate,
} from "./template";

const SITE = "https://www.merkurov.love";

type RenderContext = {
  payload: IssuePayload;
  template: IssueTemplateSettings;
  email: boolean;
};

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const url = new URL(value, SITE);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function dateLabel(value: string, lang: IssueLang) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(
    lang === "ru" ? "ru-RU" : "en-GB",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    },
  ).format(date);
}

function paragraphs(value: string, template: IssueTemplateSettings) {
  return value
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(
      (part) =>
        `<p style="margin:0 0 1em;line-height:1.75;white-space:pre-wrap;color:${template.theme.ink};">${esc(part).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

function link(
  url: string | null,
  label: string,
  template: IssueTemplateSettings,
) {
  const safe = safeUrl(url);
  if (!safe) return esc(label);

  return `<a href="${esc(safe)}" style="color:${template.theme.accent};text-decoration:underline;">${esc(label)}</a>`;
}

function sectionHeading(
  title: string,
  template: IssueTemplateSettings,
  email: boolean,
) {
  const { theme } = template;

  return `<h2 style="margin:0 0 18px;padding-top:${email ? "22px" : "28px"};border-top:1px solid ${theme.rule};font-family:${esc(theme.serifFont)};font-size:22px;font-weight:normal;color:${theme.ink};">${esc(title)}</h2>`;
}

function stat(
  label: string,
  value: string | number,
  template: IssueTemplateSettings,
) {
  const { theme } = template;

  return `<div style="padding:12px 0;border-bottom:1px solid ${theme.rule};"><div style="font:10px ${esc(theme.sansFont)};letter-spacing:1.5px;text-transform:uppercase;color:${theme.muted};">${esc(label)}</div><div style="margin-top:5px;font:24px ${esc(theme.serifFont)};color:${theme.ink};">${esc(value)}</div></div>`;
}

function entryDate(entry: IssueEntry, lang: IssueLang) {
  return dateLabel(entry.publishedAt, lang);
}

function entryLink(
  entry: IssueEntry,
  template: IssueTemplateSettings,
) {
  const href = entry.url || `${SITE}/flow/${entry.id}`;
  return link(href, entry.title || href, template);
}

function renderLead({ payload, template, email }: RenderContext) {
  const lead = payload.lead;
  if (!lead) return "";

  const { theme, labels } = template;
  const title = labels[payload.lang].lead;

  return `
    <section style="margin:28px 0;">
      <p style="font:10px ${esc(theme.sansFont)};letter-spacing:2px;text-transform:uppercase;color:${theme.accent};">${esc(title)}</p>
      <h2 style="font:normal 30px/1.2 ${esc(theme.serifFont)};margin:10px 0 14px;color:${theme.ink};">${esc(lead.title || title)}</h2>
      <p style="font:11px ${esc(theme.sansFont)};color:${theme.muted};">${esc(entryDate(lead, payload.lang))}</p>
      ${paragraphs(lead.body, template)}
      ${lead.url ? `<p>${entryLink(lead, template)}</p>` : ""}
    </section>`;
}

function renderLatest({ payload, template, email }: RenderContext) {
  const { theme, labels } = template;
  if (!payload.latest.length) return "";

  return `<section>${sectionHeading(labels[payload.lang].latest, template, email)}
    ${payload.latest
      .map(
        (entry) => `
      <article style="padding:0 0 20px;margin:0 0 20px;border-bottom:1px solid ${theme.rule};">
        <p style="font:10px ${esc(theme.sansFont)};color:${theme.muted};margin:0 0 7px;">${esc(entryDate(entry, payload.lang))} · ${esc(entry.type)}</p>
        <h3 style="font:normal 21px/1.35 ${esc(theme.serifFont)};margin:0 0 9px;color:${theme.ink};">${entry.url ? entryLink(entry, template) : esc(entry.title)}</h3>
        ${entry.body ? paragraphs(entry.body, template) : ""}
      </article>`,
      )
      .join("")}
  </section>`;
}

function renderLinks({ payload, template, email }: RenderContext) {
  const { theme, labels } = template;
  if (!payload.links.length) return "";

  return `<section>${sectionHeading(labels[payload.lang].links, template, email)}
    ${payload.links
      .map((item) => {
        const image = safeUrl(item.image);

        return `
      <article style="margin:0 0 22px;">
        ${image ? `<p style="margin:0 0 10px;"><a href="${esc(safeUrl(item.url) || SITE)}"><img src="${esc(image)}" alt="" style="display:block;width:100%;max-width:560px;height:auto;border:0;"></a></p>` : ""}
        <h3 style="font:normal 21px/1.35 ${esc(theme.serifFont)};margin:0 0 8px;">${entryLink(item, template)}</h3>
        ${item.description ? `<p style="font:14px/1.65 ${esc(theme.sansFont)};color:${theme.muted};">${esc(item.description)}</p>` : ""}
        <p style="font:11px/1.7 ${esc(theme.sansFont)};color:${theme.muted};">${esc([item.siteName, item.author, item.originalDate ? dateLabel(item.originalDate, payload.lang) : ""].filter(Boolean).join(" · "))}</p>
      </article>`;
      })
      .join("")}
  </section>`;
}

function renderVideos({ payload, template, email }: RenderContext) {
  const { theme, labels } = template;
  if (!payload.videos.length) return "";

  return `<section>${sectionHeading(labels[payload.lang].videos, template, email)}
    ${payload.videos
      .map((video) => {
        const image = safeUrl(video.image);
        const videoUrl = safeUrl(video.url);

        return `
      <article style="margin:0 0 24px;">
        ${image && videoUrl ? `<a href="${esc(videoUrl)}"><img src="${esc(image)}" alt="" style="display:block;width:100%;max-width:560px;height:auto;border:0;"></a>` : ""}
        <h3 style="font:normal 20px/1.4 ${esc(theme.serifFont)};margin:10px 0;">${entryLink(video, template)}</h3>
        ${video.body ? paragraphs(video.body, template) : ""}
      </article>`;
      })
      .join("")}
  </section>`;
}

function renderPhotos({ payload, template, email }: RenderContext) {
  const { theme, labels } = template;
  if (!payload.photos.length) return "";

  return `<section>${sectionHeading(labels[payload.lang].photos, template, email)}
    ${payload.photos
      .map((photo) => {
        const image = safeUrl(photo.image);

        return `
      <figure style="margin:0 0 24px;">
        ${image ? `<img src="${esc(image)}" alt="${esc(photo.alt)}" style="display:block;width:100%;height:auto;border:0;">` : ""}
        ${photo.caption ? `<figcaption style="margin-top:8px;font:14px/1.65 ${esc(theme.serifFont)};color:${theme.ink};">${esc(photo.caption)}</figcaption>` : ""}
      </figure>`;
      })
      .join("")}
  </section>`;
}

function formatDuration(seconds: number, lang: IssueLang) {
  const n = Math.max(0, Math.round(seconds));

  if (lang === "en") {
    if (n < 60) return `${n}s`;
    if (n < 3600) return `${Math.round(n / 60)}m`;

    const hours = Math.floor(n / 3600);
    const minutes = Math.round((n % 3600) / 60);
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  if (n < 60) return `${n} с`;
  if (n < 3600) return `${Math.round(n / 60)} мин`;

  const hours = Math.floor(n / 3600);
  const minutes = Math.round((n % 3600) / 60);
  return minutes ? `${hours} ч ${minutes}` : `${hours} ч`;
}

function renderMetrics({ payload, template, email }: RenderContext) {
  const { theme, labels } = template;
  const stats = payload.stats;
  const ru = payload.lang === "ru";

  const metrics: [string, string | number][] = [
    [ru ? "Публичных материалов" : "Public items", stats.published],
    [ru ? "Заметки" : "Notes", stats.byType.note || 0],
    [ru ? "Ссылки" : "Links", stats.byType.link || 0],
    [ru ? "Видео" : "Videos", stats.byType.video || 0],
    [ru ? "Фото" : "Photos", stats.byType.photo || 0],
    [
      ru ? "Медианное время до публикации" : "Median time to publication",
      stats.medianDelaySeconds == null
        ? "—"
        : formatDuration(stats.medianDelaySeconds, payload.lang),
    ],
  ];

  const hours = stats.byUtcHour.filter((item) => item.count > 0);
  const maxHour = Math.max(1, ...hours.map((item) => item.count));

  const chart = hours.length
    ? `<div style="margin-top:20px;">${hours
        .map(
          (item) => `
        <div style="margin:7px 0;">
          <span style="display:inline-block;width:38px;font:11px ${esc(theme.sansFont)};color:${theme.muted};">${String(item.hour).padStart(2, "0")}:00</span>
          <span style="display:inline-block;vertical-align:middle;width:${Math.max(2, Math.round((item.count / maxHour) * 65))}%;height:8px;background:${theme.accent};"></span>
          <span style="font:11px ${esc(theme.sansFont)};color:${theme.muted};"> ${item.count}</span>
        </div>`,
        )
        .join("")}</div>`
    : "";

  const cells = metrics
    .map(([label, value]) => stat(label, value, template))
    .join("");

  return `<section>${sectionHeading(labels[payload.lang].metrics, template, email)}
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 22px;">${cells}</div>
    ${chart}
    <p style="font:11px/1.6 ${esc(theme.sansFont)};color:${theme.muted};margin-top:14px;">${ru ? "Время указано по UTC." : "Times are shown in UTC."}</p>
  </section>`;
}

function renderSourceIndex({ payload, template, email }: RenderContext) {
  const { theme, labels } = template;
  if (!payload.sourceIndex.length) return "";

  return `<section>${sectionHeading(labels[payload.lang].sources, template, email)}
    <ol style="padding-left:22px;">
      ${payload.sourceIndex
        .map(
          (source) => `
        <li style="margin:0 0 10px;font:13px/1.55 ${esc(theme.sansFont)};">
          ${source.url ? link(source.url, source.title || source.source, template) : esc(source.title || source.source)}
          <span style="color:${theme.muted};"> — ${esc(source.source)}</span>
        </li>`,
        )
        .join("")}
    </ol>
  </section>`;
}

function renderSubscription({ payload, template }: RenderContext) {
  const { theme, labels } = template;
  const text = labels[payload.lang];

  return `<footer style="margin-top:34px;padding-top:18px;border-top:1px solid ${theme.rule};font:12px/1.6 ${esc(theme.sansFont)};color:${theme.muted};">
    <p>${esc(text.subscribeCopy)}</p>
    <p>${link(`${SITE}/flow/join`, text.subscribe, template)}</p>
  </footer>`;
}

function renderBody(payload: IssuePayload, email: boolean) {
  const context: RenderContext = {
    payload,
    template: payload.template,
    email,
  };

  const renderers: Record<
    IssueSectionKey,
    (context: RenderContext) => string
  > = {
    lead: renderLead,
    latest: renderLatest,
    links: renderLinks,
    videos: renderVideos,
    photos: renderPhotos,
    metrics: renderMetrics,
    sources: renderSourceIndex,
    subscribe: renderSubscription,
  };

  return payload.template.sections.order
    .filter((key) => payload.template.sections.enabled[key])
    .map((key) => renderers[key](context))
    .filter(Boolean)
    .join("\n");
}

export function renderIssue(
  payload: IssuePayload,
  options: {
    title: string;
    slug: string;
    siteUrl?: string;
  },
) {
  const siteUrl = options.siteUrl || SITE;
  const lang = payload.lang;

  // Older saved issues may not have the new template snapshot.
  const template = normalizeIssueTemplate(
    (payload as Partial<IssuePayload>).template ||
      DEFAULT_ISSUE_TEMPLATE,
  );

  const safePayload: IssuePayload = {
    ...payload,
    template,
  };

  const period = `${dateLabel(payload.period.start, lang)} — ${dateLabel(payload.period.end, lang)}`;
  const description =
    lang === "ru"
      ? `Выпуск Flow за период ${period}.`
      : `Flow issue for ${period}.`;

  const { theme, labels } = template;
  const localized = labels[lang];

  const header = `
    <header style="padding-bottom:22px;border-bottom:3px solid ${theme.accent};margin-bottom:24px;">
      <p style="font:10px ${esc(theme.sansFont)};letter-spacing:3px;color:${theme.accent};margin:0 0 10px;">ANTON MERKUROV / ${esc(localized.masthead.toUpperCase())}</p>
      <h1 style="font:normal 38px/1.12 ${esc(theme.serifFont)};color:${theme.ink};margin:0 0 10px;">${esc(options.title)}</h1>
      <p style="font:12px ${esc(theme.sansFont)};color:${theme.muted};margin:0;">${esc(period)} · UTC</p>
    </header>`;

  const webBody = renderBody(safePayload, false);
  const emailBody = renderBody(safePayload, true);
  const canonical = `${siteUrl}/letters/${options.slug}`;

  const htmlWeb = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(options.title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<style>
:root{color-scheme:light dark}
*{box-sizing:border-box}
body{margin:0;background:${theme.paper};color:${theme.ink};font-family:${esc(theme.sansFont)}}
a{color:${theme.accent}}
.issue{max-width:${theme.maxWidth}px;margin:0 auto;padding:48px 24px 72px}
img{max-width:100%;height:auto}
@media(prefers-color-scheme:dark){
body{background:#171516;color:#F4EFF1}
.issue{color:#F4EFF1}
h1,h2,h3,p,figcaption{color:inherit}
a{color:#F08AA8}
}
@media(max-width:600px){
.issue{padding:28px 17px 48px}
h1{font-size:30px!important}
}
</style>
</head>
<body><main class="issue">${header}${webBody}</main></body>
</html>`;

  const preheader = esc(description);

  const htmlEmail = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#F4F1EF;color:${theme.ink};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F4F1EF;">
<tr><td align="center" style="padding:18px 8px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${theme.paper};">
<tr><td style="padding:28px 24px;font-family:${esc(theme.sansFont)};color:${theme.ink};">
${header}${emailBody}
<p style="margin-top:28px;font:11px/1.6 ${esc(theme.sansFont)};color:${theme.muted};">${link(canonical, lang === "ru" ? "Открыть выпуск в браузере" : "Read in browser", template)}</p>
</td></tr></table>
</td></tr></table>
</body>
</html>`;

  

  const textEmail = [
    options.title,
    period,
    "",
    safePayload.template.sections.enabled.lead
      ? [payload.lead?.title, payload.lead?.body]
          .filter(Boolean)
          .join("\n")
      : "",
    safePayload.template.sections.enabled.latest
      ? payload.latest
          .map((entry) =>
            [entry.title, entry.body, entry.url || ""]
              .filter(Boolean)
              .join("\n"),
          )
          .join("\n\n")
      : "",
    safePayload.template.sections.enabled.links
      ? payload.links
          .map((entry) =>
            [entry.title, entry.url || "", entry.description]
              .filter(Boolean)
              .join("\n"),
          )
          .join("\n\n")
      : "",
    safePayload.template.sections.enabled.videos
      ? payload.videos
          .map((entry) =>
            [entry.title, entry.url || ""]
              .filter(Boolean)
              .join("\n"),
          )
          .join("\n\n")
      : "",
    safePayload.template.sections.enabled.photos
      ? payload.photos
          .map((entry) =>
            [entry.caption, entry.image].filter(Boolean).join("\n"),
          )
          .join("\n\n")
      : "",
    safePayload.template.sections.enabled.subscribe
      ? `${localized.subscribe}: ${localized.subscribeCopy}\n${SITE}/flow/join`
      : "",
    canonical,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { htmlWeb, htmlEmail, textEmail };
}
