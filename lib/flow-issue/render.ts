
import type {
  IssueEntry,
  IssuePayload,
  IssueLang,
} from "./types";

const SITE = "https://www.merkurov.love";
const ACCENT = "#990F3D";
const INK = "#1C1A1B";
const PAPER = "#FFFFFF";
const MUTED = "#6B6668";
const RULE = "#DED9DA";

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

function link(url: string | null, label: string, email = false) {
  const safe = safeUrl(url);
  if (!safe) return esc(label);
  return `<a href="${esc(safe)}" style="color:${ACCENT};text-decoration:underline;">${esc(label)}</a>`;
}

function dateLabel(value: string, lang: IssueLang) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function paragraphs(value: string) {
  // Deliberately simple: preserve the author's text, escape HTML.
  // This does not execute or accept HTML from Flow records.
  return value
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(
      (part) =>
        `<p style="margin:0 0 1em;line-height:1.75;white-space:pre-wrap;">${esc(part).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

function sectionHeading(title: string, email = false) {
  return `<h2 style="margin:0 0 18px;padding-top:${email ? "22px" : "28px"};border-top:1px solid ${RULE};font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:normal;color:${INK};">${esc(title)}</h2>`;
}

function stat(label: string, value: string | number) {
  return `<div style="padding:12px 0;border-bottom:1px solid ${RULE};"><div style="font:10px Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:${MUTED};">${esc(label)}</div><div style="margin-top:5px;font:24px Georgia,serif;color:${INK};">${esc(value)}</div></div>`;
}

function entryDate(entry: IssueEntry, lang: IssueLang) {
  return dateLabel(entry.publishedAt, lang);
}

function entryLink(entry: IssueEntry, email = false) {
  const href = entry.url || `${SITE}/flow/${entry.id}`;
  return link(href, entry.title || href, email);
}

function renderLead(payload: IssuePayload, email = false) {
  const lead = payload.lead;
  if (!lead) return "";
  const label = payload.lang === "ru" ? "Главная заметка" : "Lead";
  return `
    <section style="margin:28px 0;">
      <p style="font:10px Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:${ACCENT};">${label}</p>
      <h2 style="font:normal 30px/1.2 Georgia,'Times New Roman',serif;margin:10px 0 14px;color:${INK};">${esc(lead.title || label)}</h2>
      <p style="font:11px Arial,sans-serif;color:${MUTED};">${esc(entryDate(lead, payload.lang))}</p>
      ${paragraphs(lead.body)}
      ${lead.url ? `<p>${entryLink(lead, email)}</p>` : ""}
    </section>`;
}

function renderLatest(payload: IssuePayload, email = false) {
  const label = payload.lang === "ru" ? "Последние записи" : "Latest entries";
  if (!payload.latest.length) return "";
  return `<section>${sectionHeading(label, email)}
    ${payload.latest.map((entry) => `
      <article style="padding:0 0 20px;margin:0 0 20px;border-bottom:1px solid ${RULE};">
        <p style="font:10px Arial,sans-serif;color:${MUTED};margin:0 0 7px;">${esc(entryDate(entry, payload.lang))} · ${esc(entry.type)}</p>
        <h3 style="font:normal 21px/1.35 Georgia,'Times New Roman',serif;margin:0 0 9px;">${entry.url ? entryLink(entry, email) : esc(entry.title || "")}</h3>
        ${entry.body ? paragraphs(entry.body) : ""}
      </article>`).join("")}
  </section>`;
}

function renderLinks(payload: IssuePayload, email = false) {
  if (!payload.links.length) return "";
  const heading = payload.lang === "ru" ? "Ссылки и чтение" : "Reading list";
  return `<section>${sectionHeading(heading, email)}
    ${payload.links.map((item) => `
      <article style="margin:0 0 22px;">
        ${item.image && safeUrl(item.image) ? `<p style="margin:0 0 10px;"><img src="${esc(safeUrl(item.image))}" alt="" style="display:block;width:100%;max-width:560px;height:auto;"></p>` : ""}
        <h3 style="font:normal 21px/1.35 Georgia,'Times New Roman',serif;margin:0 0 8px;">${entryLink(item, email)}</h3>
        ${item.description ? `<p style="font:14px/1.65 Arial,sans-serif;color:${MUTED};">${esc(item.description)}</p>` : ""}
        <p style="font:11px/1.7 Arial,sans-serif;color:${MUTED};">
          ${esc([item.siteName, item.author, item.originalDate ? dateLabel(item.originalDate, payload.lang) : ""].filter(Boolean).join(" · "))}
        </p>
      </article>`).join("")}
  </section>`;
}

function renderVideos(payload: IssuePayload, email = false) {
  if (!payload.videos.length) return "";
  const heading = payload.lang === "ru" ? "Видео" : "Video";
  return `<section>${sectionHeading(heading, email)}
    ${payload.videos.map((video) => `
      <article style="margin:0 0 24px;">
        ${video.image && safeUrl(video.image) ? `<a href="${esc(safeUrl(video.url))}"><img src="${esc(safeUrl(video.image))}" alt="" style="display:block;width:100%;max-width:560px;height:auto;"></a>` : ""}
        <h3 style="font:normal 20px/1.4 Georgia,'Times New Roman',serif;margin:10px 0;">${entryLink(video, email)}</h3>
        ${video.body ? paragraphs(video.body) : ""}
      </article>`).join("")}
  </section>`;
}

function renderPhotos(payload: IssuePayload, email = false) {
  if (!payload.photos.length) return "";
  const heading = payload.lang === "ru" ? "Фотографии" : "Photographs";
  return `<section>${sectionHeading(heading, email)}
    ${payload.photos.map((photo) => `
      <figure style="margin:0 0 24px;">
        ${safeUrl(photo.image) ? `<img src="${esc(safeUrl(photo.image))}" alt="${esc(photo.alt)}" style="display:block;width:100%;height:auto;">` : ""}
        ${photo.caption ? `<figcaption style="margin-top:8px;font:14px/1.65 Georgia,'Times New Roman',serif;color:${INK};">${esc(photo.caption)}</figcaption>` : ""}
      </figure>`).join("")}
  </section>`;
}

function renderMetrics(payload: IssuePayload, email = false) {
  const s = payload.stats;
  const ru = payload.lang === "ru";
  const heading = ru ? "Пульс периода" : "Period in numbers";
  const labels = ru
    ? ["Публичных материалов", "Заметки", "Ссылки", "Видео", "Фото", "Медианное время до публикации"]
    : ["Public items", "Notes", "Links", "Videos", "Photos", "Median time to publication"];

  const metrics = [
    [labels[0], s.published],
    [labels[1], s.byType.note || 0],
    [labels[2], s.byType.link || 0],
    [labels[3], s.byType.video || 0],
    [labels[4], s.byType.photo || 0],
    [labels[5], s.medianDelaySeconds == null ? "—" : formatDuration(s.medianDelaySeconds, payload.lang)],
  ] as const;

  const hours = s.byUtcHour.filter((item) => item.count > 0);
  const maxHour = Math.max(1, ...hours.map((item) => item.count));
  const chart = hours.length
    ? `<div style="margin-top:20px;">${hours.map((item) => `
        <div style="margin:7px 0;">
          <span style="display:inline-block;width:38px;font:11px Arial,sans-serif;color:${MUTED};">${String(item.hour).padStart(2, "0")}:00</span>
          <span style="display:inline-block;vertical-align:middle;width:${Math.max(2, Math.round((item.count / maxHour) * 65))}%;height:8px;background:${ACCENT};"></span>
          <span style="font:11px Arial,sans-serif;color:${MUTED};"> ${item.count}</span>
        </div>`).join("")}</div>`
    : "";

  return `<section>${sectionHeading(heading, email)}
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 22px;">
      ${metrics.map(([label, value]) => stat(label, value)).join("")}
    </div>
    ${chart}
    <p style="font:11px/1.6 Arial,sans-serif;color:${MUTED};margin-top:14px;">${ru ? "Время указано по UTC." : "Times are shown in UTC."}</p>
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

function renderSourceIndex(payload: IssuePayload, email = false) {
  if (!payload.sourceIndex.length) return "";
  const heading = payload.lang === "ru" ? "Указатель источников" : "Source index";
  return `<section>${sectionHeading(heading, email)}
    <ol style="padding-left:22px;">
      ${payload.sourceIndex.map((source) => `
        <li style="margin:0 0 10px;font:13px/1.55 Arial,sans-serif;">
          ${source.url ? link(source.url, source.title || source.source, email) : esc(source.title || source.source)}
          <span style="color:${MUTED};"> — ${esc(source.source)}</span>
        </li>`).join("")}
    </ol>
  </section>`;
}

function renderSubscription(payload: IssuePayload) {
  const label = payload.lang === "ru" ? "Подписаться на Flow" : "Subscribe to Flow";
  return `<footer style="margin-top:34px;padding-top:18px;border-top:1px solid ${RULE};font:12px/1.6 Arial,sans-serif;color:${MUTED};">${link(`${SITE}/flow/join`, label)}</footer>`;
}

function renderBody(payload: IssuePayload, email = false) {
  return [
    renderLead(payload, email),
    renderLatest(payload, email),
    renderLinks(payload, email),
    renderVideos(payload, email),
    renderPhotos(payload, email),
    renderMetrics(payload, email),
    renderSourceIndex(payload, email),
    renderSubscription(payload),
  ].filter(Boolean).join("\n");
}

export function renderIssue(
  payload: IssuePayload,
  options: { title: string; slug: string; siteUrl?: string },
) {
  const siteUrl = options.siteUrl || SITE;
  const lang = payload.lang;
  const period = `${dateLabel(payload.period.start, lang)} — ${dateLabel(payload.period.end, lang)}`;
  const description =
    lang === "ru"
      ? `Выпуск Flow за период ${period}.`
      : `Flow issue for ${period}.`;

  const header = `
    <header style="padding-bottom:22px;border-bottom:3px solid ${ACCENT};margin-bottom:24px;">
      <p style="font:10px Arial,sans-serif;letter-spacing:3px;color:${ACCENT};margin:0 0 10px;">ANTON MERKUROV / FLOW</p>
      <h1 style="font:normal 38px/1.12 Georgia,'Times New Roman',serif;color:${INK};margin:0 0 10px;">${esc(options.title)}</h1>
      <p style="font:12px Arial,sans-serif;color:${MUTED};margin:0;">${esc(period)} · UTC</p>
    </header>`;

  const webBody = renderBody(payload, false);
  const emailBody = renderBody(payload, true);

  const htmlWeb = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(options.title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(`${siteUrl}/letters/${options.slug}`)}">
<style>
:root{color-scheme:light dark}
*{box-sizing:border-box}
body{margin:0;background:${PAPER};color:${INK};font-family:Inter,Arial,sans-serif}
a{color:${ACCENT}}
.issue{max-width:760px;margin:0 auto;padding:48px 24px 72px}
img{max-width:100%;height:auto}
@media(prefers-color-scheme:dark){body{background:#171516;color:#F4EFF1}.issue{color:#F4EFF1}h1,h2,h3,p,figcaption{color:inherit}a{color:#F08AA8}}
@media(max-width:600px){.issue{padding:28px 17px 48px}h1{font-size:30px!important}}
</style>
</head>
<body><main class="issue">${header}${webBody}</main></body></html>`;

  const preheader = esc(description);
  const htmlEmail = `<!doctype html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F1EF;color:${INK};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F4F1EF;">
<tr><td align="center" style="padding:18px 8px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${PAPER};">
<tr><td style="padding:28px 24px;font-family:Arial,sans-serif;color:${INK};">
${header}${emailBody}
<p style="margin-top:28px;font:11px/1.6 Arial,sans-serif;color:${MUTED};">${link(`${siteUrl}/letters/${options.slug}`, lang === "ru" ? "Открыть выпуск в браузере" : "Read in browser", true)}</p>
</td></tr></table>
</td></tr></table></body></html>`;

  const textEmail = [
    options.title,
    period,
    "",
    payload.lead?.title || "",
    payload.lead?.body || "",
    "",
    ...payload.latest.map((entry) =>
      [entry.title, entry.body, entry.url || ""].filter(Boolean).join("\n"),
    ),
    "",
    ...payload.links.map((entry) =>
      [entry.title, entry.url || "", entry.description].filter(Boolean).join("\n"),
    ),
    "",
    ...payload.videos.map((entry) =>
      [entry.title, entry.url || ""].filter(Boolean).join("\n"),
    ),
    "",
    ...payload.photos.map((entry) =>
      [entry.caption, entry.image].filter(Boolean).join("\n"),
    ),
    "",
    `${siteUrl}/letters/${options.slug}`,
    `${siteUrl}/flow/join`,
  ].filter(Boolean).join("\n");

  return { htmlWeb, htmlEmail, textEmail };
}
