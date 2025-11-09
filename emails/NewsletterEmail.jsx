import { Html, Head, Preview, Body, Container, Section, Heading, Text, Hr, render } from '@react-email/components';
import * as React from 'react';

// Функция для конвертации блочного контента в HTML
// Современная функция: гарантирует ресайз Supabase-изображений в любом HTML
function addResizeToSupabaseImages(html, width = 600, quality = 70) {
  if (!html || typeof html !== 'string') return html;
  try {
    // Используем DOMParser через JSDOM-like API (или fallback на regex)
    // В среде node/email можно использовать regexp, но делаем максимально устойчиво
  return html.replace(/<img([^>]+src=["'])(https:\/\/[^"'>]*supabase\.co\/+storage[^"'>]*)(["'][^>]*)>/g, (match, before, url, after) => {
    // Добавляем/заменяем style на max-width:600px;height:auto;
    let styleAttr = '';
    if (/style=["'][^"']*["']/.test(after)) {
      // Уже есть style — заменяем max-width и height
      after = after.replace(/style=["'][^"']*["']/, (styleMatch) => {
        let style = styleMatch.slice(7, -1);
        style = style.replace(/max-width:[^;]+;?/g, '').replace(/height:[^;]+;?/g, '');
        style = `max-width:${width}px;height:auto;` + style;
        return `style="${style}"`;
      });
    } else {
      styleAttr = ` style=\"max-width:${width}px;height:auto;\"`;
    }
    return `<img${before}${url}"${styleAttr}${after.replace(/^["']/, '')}>`;
  });
  } catch {
    return html;
  }
}

function blocksToHtml(blocks) {
  // Если это строка, сначала пытаемся распарсить как JSON
  if (typeof blocks === 'string') {
    // Проверяем, похоже ли это на JSON (начинается с [ или {)
    const trimmed = blocks.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        blocks = JSON.parse(trimmed);
      } catch {
        // Если не парсится как JSON — значит это HTML или markdown, прогоняем через addResizeToSupabaseImages
        return addResizeToSupabaseImages(blocks);
      }
    } else {
      // Не JSON — это HTML или plain text
      return addResizeToSupabaseImages(blocks);
    }
  }
  // Если это не массив, пробуем распарсить как JSON
  if (!Array.isArray(blocks)) {
    try {
      blocks = JSON.parse(blocks);
    } catch {
      // Если не парсится — возвращаем пустую строку
      return '';
    }
  }
  // Если после парсинга это не массив — возвращаем пустую строку
  if (!Array.isArray(blocks)) {
    return '';
  }
  return blocks.map((block, index) => {
    switch (block.type) {
      case 'richText': {
        let html = block.data?.html || '';
        html = addResizeToSupabaseImages(html);
        return html;
      }
      case 'image': {
        let url = block.data?.url || '';
        // Просто ограничиваем style, не добавляем параметры
        return `<img src="${url}" alt="${block.data?.caption || ''}" style="max-width:600px;height:auto;display:block;margin:20px auto;" />`;
      }
      case 'gallery':
        if (block.data?.images && Array.isArray(block.data.images)) {
          return block.data.images.map(img => {
            let url = img.url || '';
            return `<img src="${url}" alt="${img.caption || ''}" style="max-width:600px;height:auto;display:block;margin:10px auto;" />`;
          }).join('');
        }
        return '';
      case 'columns':
        if (block.data?.columns && Array.isArray(block.data.columns)) {
          const columnWidth = Math.floor(100 / block.data.columns.length);
          const columnsHtml = block.data.columns.map(col => {
            // columns могут содержать html с <img>
            let html = col.html || '';
            html = addResizeToSupabaseImages(html);
            return `<div style="display: inline-block; width: ${columnWidth}%; vertical-align: top; padding: 0 10px;">${html}</div>`;
          }).join('');
          return `<div style="margin: 20px 0;">${columnsHtml}</div>`;
        }
        return '';
      case 'quote':
        return `<blockquote style="border-left: 4px solid #ddd; margin: 20px 0; padding-left: 20px; font-style: italic; color: #666;">${block.data?.text || ''}</blockquote>`;
      case 'code':
        return `<pre style="background: #f5f5f5; padding: 15px; border-radius: 4px; overflow-x: auto; margin: 20px 0;"><code>${block.data?.code || ''}</code></pre>`;
      case 'video':
        return `<div style="margin: 20px 0;"><a href="${block.data?.url}" target="_blank" style="color: #007cba;">📹 Смотреть видео</a></div>`;
      case 'paragraph': {
        // Editor.js paragraph blocks
        let txt = block.data?.text || block.data?.html || '';
        txt = addResizeToSupabaseImages(txt);
        txt = sanitizeLinksInHtml(txt);
        return `<p>${txt}</p>`;
      }
      case 'link': {
        // Editor.js LinkTool block
        const href = sanitizeLinksInHtml(String(block.data?.link || block.data?.url || ''));
        const label = (block.data?.meta && (block.data.meta.title || block.data.meta.url)) || href;
        return `<p><a href="${href}" target="_blank" rel="noopener noreferrer" style="color:#007cba;">${label}</a></p>`;
      }
      default:
        // Если это html-блок или неизвестный, тоже прогоняем через addResizeToSupabaseImages
        if (block.data?.html) {
          return addResizeToSupabaseImages(block.data.html);
        }
        // Fallback для неизвестных блоков - выводим text если есть
        if (block.data?.text) {
          const text = addResizeToSupabaseImages(String(block.data.text));
          return `<p>${text}</p>`;
        }
        // Если блок пустой или неизвестный - не выводим его вообще
        console.warn('Unknown block type:', block.type, 'Data keys:', Object.keys(block.data || {}));
        return '';
    }
  }).join('');
}

// Утилиты для нормализации ссылок внутри HTML письма
function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/&quot;|&ldquo;|&rdquo;|&amp;|&lt;|&gt;|&apos;|&#39;|&#x27;/g, (m) => {
    switch (m) {
      case '&quot;': return '"';
      case '&ldquo;': return '"';
      case '&rdquo;': return '"';
      case '&amp;': return '&';
      case '&lt;': return '<';
      case '&gt;': return '>';
      case '&apos;': return "'";
      case '&#39;': return "'";
      case '&#x27;': return "'";
      default: return m;
    }
  });
}

function stripSurroundingQuotes(s) {
  if (!s || typeof s !== 'string') return s;
  // Trim whitespace and remove surrounding ASCII or smart quotes
  let t = s.trim();
  // Remove ASCII quotes and smart quotes at the start/end
  t = t.replace(/^["'`\u2018\u2019\u201C\u201D]+/, '');
  t = t.replace(/["'`\u2018\u2019\u201C\u201D]+$/, '');
  return t;
}

function normalizeUrlScheme(u) {
  if (!u || typeof u !== 'string') return u;
  // Fix common broken schemes like https:/www.example -> https://www.example
  u = u.replace(/^(https?:)\/([^/])/i, '$1//$2');
  // If URL starts with 'www.' or similar without scheme, add https://
  if (/^www\./i.test(u)) u = 'https://' + u;
  return u;
}

function sanitizeLinksInHtml(html) {
  if (!html || typeof html !== 'string') return html;
  // First decode common HTML entities we expect inside attributes
  let out = decodeHtmlEntities(html);

  // Fix href attributes: capture href="..." or href='...' or href=unquoted
  out = out.replace(/href\s*=\s*(?:(['"])(.*?)\1|([^\s>]+))/gi, (match, q, quotedUrl, unquotedUrl) => {
    let raw = quotedUrl || unquotedUrl || '';
    let cleaned = decodeHtmlEntities(raw || '');
    cleaned = stripSurroundingQuotes(cleaned);
    // Fix only obvious single-slash mistakes like https:/example -> https://example
    cleaned = cleaned.replace(/^(https?:)\/([^/])/i, '$1//$2');
    cleaned = normalizeUrlScheme(cleaned);
    // Reuse original quoting style if present
    if (q) return `href=${q}${cleaned}${q}`;
    return `href="${cleaned}"`;
  });

  // Also fix plain-text occurrences of smart-quoted links like “https:/... ”
  out = out.replace(/[\u201C\u201D\u2018\u2019]+\s*(https?:\/[^\s"'<>]+)\s*[\u201C\u201D\u2018\u2019]+/gi, (m, url) => {
    let cleaned = stripSurroundingQuotes(url);
    cleaned = normalizeUrlScheme(cleaned);
    return cleaned;
  });

  // Do not perform broad global replacements on arbitrary text - we've fixed common broken schemes above per-URL.

  return out;
}

// Эта обертка нужна, чтобы наш компонент мог работать на сервере
const NewsletterEmail = ({ title = 'Тема письма', content = '', unsubscribeUrl }) => {
  // Конвертируем блочный контент в HTML
  const contentHtml = blocksToHtml(content);
  const contentHtmlSanitized = sanitizeLinksInHtml(contentHtml);

  return (
    <Html>
      <Head />
      <Preview>{title}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Шапка письма — как в хедере сайта */}
          <Section style={{ textAlign: 'center', marginBottom: 32 }}>
            <img
              src="https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png"
              alt="Anton Merkurov"
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                margin: '0 auto 12px',
                boxShadow: '0 2px 12px 0 rgba(0,0,0,0.07)',
                display: 'block',
                background: '#fff',
              }}
            />
            <div
              style={{
                fontWeight: 600,
                fontSize: 26,
                letterSpacing: '0.08em',
                color: '#23272f',
                marginBottom: 4,
                textTransform: 'uppercase',
                fontFamily: 'inherit',
                lineHeight: 1.1,
              }}
            >
              Anton Merkurov
            </div>
            <div
              style={{
                fontSize: 13,
                color: '#b08fff',
                letterSpacing: '0.18em',
                fontWeight: 500,
                marginTop: 2,
                textTransform: 'uppercase',
                fontFamily: 'inherit',
                lineHeight: 1.2,
              }}
            >
              Art × Love × Money
            </div>
          </Section>
          <Section>
            <Heading style={heading}>{title}</Heading>
            <div dangerouslySetInnerHTML={{ __html: contentHtmlSanitized }} />
            <Hr style={hr} />
            <Text style={footer}>
              Anton Merkurov | Вы получили это письмо, потому что подписались на рассылку на сайте new.merkurov.love
            </Text>
            {unsubscribeUrl && (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <a href={unsubscribeUrl} style={{ color: '#007cba', textDecoration: 'underline', fontSize: '14px', fontWeight: 500 }}>
                  Отписаться от рассылки
                </a>
              </div>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default NewsletterEmail;

// Функция для рендеринга, которую мы будем вызывать в Server Action
// Теперь принимает unsubscribeUrl
export const renderNewsletterEmail = (letter, unsubscribeUrl) => {
  return render(<NewsletterEmail 
    title={letter.title} 
    content={letter.content} 
    unsubscribeUrl={unsubscribeUrl}
  />);
};


// Стили для письма
const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif' };
const container = { margin: '0 auto', padding: '20px 0 48px', width: '580px' };
const heading = { fontSize: '24px', lineHeight: '1.3', fontWeight: '700', color: '#484848' };
const hr = { borderColor: '#cccccc', margin: '20px 0' };
const footer = { color: '#8898aa', fontSize: '12px', lineHeight: '16px' };

