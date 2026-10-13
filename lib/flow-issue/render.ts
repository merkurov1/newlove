
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
const INK = "#171717";
const PAPER = "#FFFFFF";
const MUTED = "#555555";
const RULE = "#D6D6D6";
const ACCENT = "#990F3D";
const MAX_IMAGE_WIDTH = 560;

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

function dateLabel(value: string, lang: IssueLang): string {
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

function fontSerif(template: IssueTemplateSettings): string {
  return esc(template.theme.serifFont);
}

function fontSans(template: IssueTemplateSettings): string {
  return esc(template.theme.sansFont);
}

function link(
  url: string | null,
  label: string,
  template: IssueTemplateSettings,
): string {
  const safe = safeUrl(url);
  if (!safe) return esc(label);

  return `<a href="${esc(safe)}" style="color:${ACCENT};text-decoration:underline;text-underline-offset:3px;">${esc(label)}</a>`;
}

function paragraphs(
  value: string,
  template: IssueTemplateSettings,
): string {
  return value
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(
      (part) => `
        <p style="
          margin:0 0 16px;
          color:${INK};
          font-family:${fontSerif(template)};
          font-size:16px;
          line-height:1.75;
          overflow-wrap:anywhere;
          white-space:pre-wrap;
        ">${esc(part).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

function sectionHeading(
  title: string,
  template: IssueTemplateSettings,
  email: boolean,
): string {
  return `
    <h2 style="
      margin:0 0 20px;
      padding-top:${email ? "20px" : "26px"};
      border-top:1px solid ${RULE};
      color:${INK};
      font-family:${fontSerif(template)};
      font-size:25px;
      font-weight:normal;
      line-height:1.2;
    ">${esc(title)}</h2>`;
}

function imageMarkup(
  url: unknown,
  alt: unknown,
  options: {
    maxHeight: number;
    fit: "cover" | "contain";
    email: boolean;
    linkUrl?: string | null;
  },
): string {
  const image = safeUrl(url);
  if (!image) return "";

  const width = MAX_IMAGE_WIDTH;
  const height = options.maxHeight;
  const imageStyle = [
    "display:block",
    "width:100%",
    `max-width:${width}px`,
    `max-height:${height}px`,
    "height:auto",
    "border:0",
    "outline:none",
    "text-decoration:none",
    `object-fit:${options.fit}`,
    "object-position:center",
    "margin:0 auto",
  ].join(";");

  const img = `<img src="${esc(image)}" alt="${esc(alt)}" width="${width}" style="${imageStyle}">`;
  const href = safeUrl(options.linkUrl);

  // Keep images bounded by the content column in both web and email.
  const wrapped = href
    ? `<a href="${esc(href)}" style="display:block;max-width:${width}px;margin:0 auto;text-decoration:none;">${img}</a>`
    : img;

  return `
    <div style="
      width:100%;
      max-width:${width}px;
      max-height:${height}px;
      margin:0 auto;
      overflow:hidden;
      line-height:0;
    ">${wrapped}</div>`;
}

function entryDate(entry: IssueEntry, lang: IssueLang): string {
  return dateLabel(entry.publishedAt, lang);
}

function entryLink(
  entry: IssueEntry,
  template: IssueTemplateSettings,
): string {
  const href = entry.url || `${SITE}/flow/${entry.id}`;
  return link(href, entry.title || href, template);
}

function renderLead({ payload, template }: RenderContext): string {
  const lead = payload.lead;
  if (!lead) return "";

  const label = template.labels[payload.lang].lead;

  return `
    <section style="margin:30px 0 38px;">
      <p style="
        margin:0 0 12px;
        color:${ACCENT};
        font-family:${fontSans(template)};
        font-size:11px;
        font-weight:bold;
        letter-spacing:1.8px;
        line-height:1.5;
        text-transform:uppercase;
      ">${esc(label)}</p>

      <h2 style="
        margin:0 0 14px;
        color:${INK};
        font-family:${fontSerif(template)};
        font-size:34px;
        font-weight:normal;
        line-height:1.13;
        letter-spacing:-0.5px;
        overflow-wrap:anywhere;
      ">${esc(lead.title || label)}</h2>

      <p style="
        margin:0 0 20px;
        color:${MUTED};
        font-family:${fontSans(template)};
        font-size:11px;
        line-height:1.6;
      ">${esc(entryDate(lead, payload.lang))}</p>

      ${paragraphs(lead.body, template)}

      ${lead.url ? `<p style="margin:18px 0 0;">${entryLink(lead, template)}</p>` : ""}
    </section>`;
}

function renderLatest({ payload, template, email }: RenderContext): string {
  if (!payload.latest.length) return "";

  const { theme, labels } = template;

  return `
    <section>
      ${sectionHeading(labels[payload.lang].latest, template, email)}

      ${payload.latest
        .map(
          (entry) => `
            <article style="
              margin:0 0 23px;
              padding:0 0 22px;
              border-bottom:1px solid ${RULE};
            ">
              <p style="
                margin:0 0 8px;
                color:${MUTED};
                font-family:${fontSans(template)};
                font-size:10px;
                letter-spacing:0.5px;
                line-height:1.5;
                text-transform:uppercase;
              ">${esc(entryDate(entry, payload.lang))} &nbsp;·&nbsp; ${esc(entry.type)}</p>

              <h3 style="
                margin:0 0 10px;
                color:${INK};
                font-family:${fontSerif(template)};
                font-size:23px;
                font-weight:normal;
                line-height:1.3;
                overflow-wrap:anywhere;
              ">${entry.url ? entryLink(entry, template) : esc(entry.title)}</h3>

              ${entry.body ? paragraphs(entry.body, template) : ""}
            </article>`,
        )
        .join("")}
    </section>`;
}

function renderLinks({ payload, template, email }: RenderContext): string {
  if (!payload.links.length) return "";

  const { theme, labels } = template;

  return `
    <section>
      ${sectionHeading(labels[payload.lang].links, template, email)}

      ${payload.links
        .map((item) => {
          const image = safeUrl(item.image);
          const sourceLine = [
            item.siteName,
            item.author,
            item.originalDate
              ? dateLabel(item.originalDate, payload.lang)
              : "",
          ]
            .filter(Boolean)
            .join(" · ");

          return `
            <article style="margin:0 0 30px;">
              ${
                image
                  ? `<div style="margin:0 0 13px;">${imageMarkup(image, item.title, {
                      maxHeight: 280,
                      fit: "cover",
                      email,
                      linkUrl: item.url,
                    })}</div>`
                  : ""
              }

              <h3 style="
                margin:0 0 8px;
                color:${INK};
                font-family:${fontSerif(template)};
                font-size:23px;
                font-weight:normal;
                line-height:1.3;
                overflow-wrap:anywhere;
              ">${entryLink(item, template)}</h3>

              ${
                item.description
                  ? `<p style="
                      margin:0 0 9px;
                      color:${INK};
                      font-family:${fontSerif(template)};
                      font-size:15px;
                      line-height:1.65;
                      overflow-wrap:anywhere;
                    ">${esc(item.description)}</p>`
                  : ""
              }

              ${
                sourceLine
                  ? `<p style="
                      margin:0;
                      color:${MUTED};
                      font-family:${fontSans(template)};
                      font-size:11px;
                      line-height:1.6;
                      overflow-wrap:anywhere;
                    ">${esc(sourceLine)}</p>`
                  : ""
              }
            </article>`;
        })
        .join("")}
    </section>`;
}

function renderVideos({ payload, template, email }: RenderContext): string {
  if (!payload.videos.length) return "";

  const { labels } = template;

  return `
    <section>
      ${sectionHeading(labels[payload.lang].videos, template, email)}

      ${payload.videos
        .map((video) => {
          const image = safeUrl(video.image);

          return `
            <article style="margin:0 0 30px;">
              ${
                image
                  ? `<div style="margin:0 0 12px;">${imageMarkup(image, video.title, {
                      maxHeight: 280,
                      fit: "cover",
                      email,
                      linkUrl: video.url,
                    })}</div>`
                  : ""
              }

              <h3 style="
                margin:0 0 9px;
                color:${INK};
                font-family:${fontSerif(template)};
                font-size:22px;
                font-weight:normal;
                line-height:1.35;
                overflow-wrap:anywhere;
              ">${entryLink(video, template)}</h3>

              ${video.body ? paragraphs(video.body, template) : ""}
            </article>`;
        })
        .join("")}
    </section>`;
}

function renderPhotos({ payload, template, email }: RenderContext): string {
  if (!payload.photos.length) return "";

  const { labels } = template;

  return `
    <section>
      ${sectionHeading(labels[payload.lang].photos, template, email)}

      ${payload.photos
        .map((photo) => {
          const image = safeUrl(photo.image);

          return `
            <figure style="margin:0 0 28px;">
              ${
                image
                  ? imageMarkup(image, photo.alt || photo.caption, {
                      maxHeight: 480,
                      fit: "contain",
                      email,
                    })
                  : ""
              }

              ${
                photo.caption
                  ? `<figcaption style="
                      max-width:${MAX_IMAGE_WIDTH}px;
                      margin:10px auto 0;
                      color:${INK};
                      font-family:${fontSerif(template)};
                      font-size:14px;
                      line-height:1.65;
                      overflow-wrap:anywhere;
                    ">${esc(photo.caption)}</figcaption>`
                  : ""
              }
            </figure>`;
        })
        .join("")}
    </section>`;
}

function formatDuration(seconds: number, lang: IssueLang): string {
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

function statRow(
  label: string,
  value: string | number,
  template: IssueTemplateSettings,
): string {
  return `
    <tr>
      <td style="
        width:70%;
        padding:11px 8px 11px 0;
        border-bottom:1px solid ${RULE};
        color:${MUTED};
        font-family:${fontSans(template)};
        font-size:12px;
        line-height:1.45;
      ">${esc(label)}</td>
      <td align="right" style="
        padding:11px 0;
        border-bottom:1px solid ${RULE};
        color:${INK};
        font-family:${fontSerif(template)};
        font-size:20px;
        line-height:1.2;
      ">${esc(value)}</td>
    </tr>`;
}

function renderMetrics({ payload, template, email }: RenderContext): string {
  const { stats, lang } = payload;
  const ru = lang === "ru";
  const labels = template.labels[lang];

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
        : formatDuration(stats.medianDelaySeconds, lang),
    ],
  ];

  const hours = stats.byUtcHour.filter((item) => item.count > 0);
  const maxHour = Math.max(1, ...hours.map((item) => item.count));

  const chart = hours.length
    ? `
      <div style="margin-top:22px;">
        ${hours
          .map((item) => {
            const barWidth = Math.max(
              2,
              Math.round((item.count / maxHour) * 100),
            );

            return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0;">
                <tr>
                  <td width="45" style="color:${MUTED};font-family:${fontSans(template)};font-size:10px;">${String(item.hour).padStart(2, "0")}:00</td>
                  <td>
                    <table role="presentation" width="${barWidth}%" cellpadding="0" cellspacing="0" border="0">
                      <tr><td height="7" bgcolor="${ACCENT}" style="height:7px;background:${ACCENT};font-size:0;line-height:0;">&nbsp;</td></tr>
                    </table>
                  </td>
                  <td width="25" align="right" style="color:${MUTED};font-family:${fontSans(template)};font-size:10px;">${item.count}</td>
                </tr>
              </table>`;
          })
          .join("")}
      </div>`
    : "";

  return `
    <section>
      ${sectionHeading(labels.metrics, template, email)}

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${metrics.map(([label, value]) => statRow(label, value, template)).join("")}
      </table>

      ${chart}

      <p style="
        margin:14px 0 0;
        color:${MUTED};
        font-family:${fontSans(template)};
        font-size:11px;
        line-height:1.6;
      ">${ru ? "Время указано по UTC." : "Times are shown in UTC."}</p>
    </section>`;
}

function renderSourceIndex({ payload, template, email }: RenderContext): string {
  if (!payload.sourceIndex.length) return "";

  const { labels } = template;

  return `
    <section>
const labels = template.labels[payload.lang];
      <ol style="padding-left:22px;">
        ${payload.sourceIndex
          .map(
            (source) => `
              <li style="
                margin:0 0 12px;
                color:${INK};
                font-family:${fontSans(template)};
                font-size:13px;
                line-height:1.6;
                overflow-wrap:anywhere;
              ">
                ${
                  source.url
                    ? link(source.url, source.title || source.source, template)
                    : esc(source.title || source.source)
                }
                <span style="color:${MUTED};"> — ${esc(source.source)}</span>
              </li>`,
          )
          .join("")}
      </ol>
    </section>`;
}

function renderSubscription({ payload, template }: RenderContext): string {
  const labels = template.labels[payload.lang];

  return `
    <footer style="
      margin-top:36px;
      padding-top:18px;
      border-top:2px solid ${INK};
      color:${INK};
      font-family:${fontSans(template)};
      font-size:12px;
      line-height:1.7;
    ">
      <p style="margin:0 0 12px;">${esc(labels.subscribeCopy)}</p>
      <p style="margin:0;">${link(`${SITE}/flow/join`, labels.subscribe, template)}</p>
    </footer>`;
}

function renderBody(payload: IssuePayload, email: boolean): string {
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

function renderMasthead(
  title: string,
  period: string,
  lang: IssueLang,
  template: IssueTemplateSettings,
  email: boolean,
): string {
  const localized = template.labels[lang];

  return `
    <header style="margin:0 0 28px;color:${INK};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="
            padding:0 0 9px;
            border-bottom:1px solid ${INK};
            color:${INK};
            font-family:${fontSans(template)};
            font-size:9px;
            letter-spacing:1.5px;
            line-height:1.5;
            text-transform:uppercase;
          ">ANTON MERKUROV</td>
          <td align="right" style="
            padding:0 0 9px;
            border-bottom:1px solid ${INK};
            color:${MUTED};
            font-family:${fontSans(template)};
            font-size:9px;
            line-height:1.5;
            text-transform:uppercase;
          ">${lang === "ru" ? "Еженедельное издание" : "A weekly journal"}</td>
        </tr>
      </table>

      <div style="
        padding:${email ? "17px 0 12px" : "20px 0 12px"};
        border-bottom:4px double ${INK};
        text-align:center;
      ">
        <p style="
          margin:0;
          color:${INK};
          font-family:${fontSerif(template)};
          font-size:${email ? "42px" : "58px"};
          font-weight:normal;
          letter-spacing:-2px;
          line-height:1;
        ">FLOW</p>

        <p style="
          margin:8px 0 0;
          color:${ACCENT};
          font-family:${fontSans(template)};
          font-size:9px;
          font-weight:bold;
          letter-spacing:2.5px;
          line-height:1.5;
          text-transform:uppercase;
        ">${esc(localized.masthead)}</p>
      </div>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">
        <tr>
          <td style="
            padding:0;
            color:${MUTED};
            font-family:${fontSans(template)};
            font-size:10px;
            line-height:1.5;
          ">${esc(period)} · UTC</td>
          <td align="right" style="
            padding:0;
            color:${MUTED};
            font-family:${fontSans(template)};
            font-size:10px;
            line-height:1.5;
          ">${esc(title)}</td>
        </tr>
      </table>

      <div style="height:1px;margin-top:10px;background:${RULE};font-size:0;line-height:0;">&nbsp;</div>
    </header>`;
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

  // Preserve the template snapshot saved with this issue.
  const normalized = normalizeIssueTemplate(
    (payload as Partial<IssuePayload>).template ||
      DEFAULT_ISSUE_TEMPLATE,
  );

  // Keep a reliably readable newspaper palette even if an older saved
  // template used low-contrast or dark colors.
  const template: IssueTemplateSettings = {
    ...normalized,
    theme: {
      ...normalized.theme,
      paper: PAPER,
      ink: INK,
      muted: MUTED,
      rule: RULE,
      accent: ACCENT,
    },
  };

  const safePayload: IssuePayload = {
    ...payload,
    template,
  };

  const period = `${dateLabel(payload.period.start, lang)} — ${dateLabel(payload.period.end, lang)}`;
  const description =
    lang === "ru"
      ? `Выпуск Flow за период ${period}.`
      : `Flow issue for ${period}.`;

  const webHeader = renderMasthead(
    options.title,
    period,
    lang,
    template,
    false,
  );

  const emailHeader = renderMasthead(
    options.title,
    period,
    lang,
    template,
    true,
  );

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
<meta name="theme-color" content="#FFFFFF">
<link rel="canonical" href="${esc(canonical)}">
<style>
*{box-sizing:border-box}
html{background:#FFFFFF}
body{
  margin:0;
  background:#FFFFFF;
  color:${INK};
  font-family:${fontSans(template)};
  -webkit-font-smoothing:antialiased;
  text-rendering:optimizeLegibility;
}
a{color:${ACCENT}}
img{display:block;max-width:100%;height:auto}
figure{max-width:100%}
.issue{
  width:100%;
  max-width:${Math.min(800, Math.max(600, template.theme.maxWidth))}px;
  margin:0 auto;
  padding:38px 28px 72px;
  background:#FFFFFF;
}
.issue section{min-width:0}
.issue p,.issue h1,.issue h2,.issue h3,.issue li{
  overflow-wrap:anywhere;
}
@media(max-width:600px){
  .issue{padding:22px 17px 44px}
}
</style>
</head>
<body>
<main class="issue">
${webHeader}
${webBody}
<p style="margin:26px 0 0;color:${MUTED};font-family:${fontSans(template)};font-size:11px;line-height:1.6;">${link(canonical, lang === "ru" ? "Открыть постоянную страницу выпуска" : "Open the issue page", template)}</p>
</main>
</body>
</html>`;

  const preheader = esc(description);

  const htmlEmail = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#FFFFFF;color:${INK};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background:#FFFFFF;">
<tr><td align="center" style="padding:0 8px;background:#FFFFFF;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:100%;max-width:600px;background:#FFFFFF;">
<tr><td style="padding:26px 20px 36px;background:#FFFFFF;color:${INK};font-family:${fontSans(template)};">
${emailHeader}
${emailBody}
<p style="margin:28px 0 0;padding-top:16px;border-top:1px solid ${RULE};color:${MUTED};font-family:${fontSans(template)};font-size:11px;line-height:1.6;">${link(canonical, lang === "ru" ? "Открыть выпуск в браузере" : "Read this issue online", template)}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const textSections: string[] = [
    options.title,
    period,
    "",
  ];

  if (template.sections.enabled.lead && payload.lead) {
    textSections.push(
      template.labels[lang].lead,
      payload.lead.title,
      payload.lead.body,
      payload.lead.url || "",
      "",
    );
  }

  if (template.sections.enabled.latest) {
    textSections.push(
      template.labels[lang].latest,
      ...payload.latest.map((entry) =>
        [entry.title, entry.body, entry.url || ""]
          .filter(Boolean)
          .join("\n"),
      ),
      "",
    );
  }

  if (template.sections.enabled.links) {
    textSections.push(
      template.labels[lang].links,
      ...payload.links.map((entry) =>
        [entry.title, entry.url || "", entry.description]
          .filter(Boolean)
          .join("\n"),
      ),
      "",
    );
  }

  if (template.sections.enabled.videos) {
    textSections.push(
      template.labels[lang].videos,
      ...payload.videos.map((entry) =>
        [entry.title, entry.url || ""].filter(Boolean).join("\n"),
      ),
      "",
    );
  }

  if (template.sections.enabled.photos) {
    textSections.push(
      template.labels[lang].photos,
      ...payload.photos.map((entry) =>
        [entry.caption, entry.image].filter(Boolean).join("\n"),
      ),
      "",
    );
  }

  if (template.sections.enabled.metrics) {
    textSections.push(
      template.labels[lang].metrics,
      `${lang === "ru" ? "Публичных материалов" : "Public items"}: ${payload.stats.published}`,
      "",
    );
  }

  if (template.sections.enabled.sources) {
    textSections.push(
      template.labels[lang].sources,
      ...payload.sourceIndex.map((entry) =>
        [entry.title || entry.source, entry.url || ""]
          .filter(Boolean)
          .join("\n"),
      ),
      "",
    );
  }

  if (template.sections.enabled.subscribe) {
    textSections.push(
      template.labels[lang].subscribeCopy,
      `${template.labels[lang].subscribe}: ${SITE}/flow/join`,
      "",
    );
  }

  textSections.push(canonical);

  const textEmail = textSections
    .filter(Boolean)
    .join("\n");

  return { htmlWeb, htmlEmail, textEmail };
}
