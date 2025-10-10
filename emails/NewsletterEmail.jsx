import { Html, Head, Preview, Body, Container, Section, Heading, Text, Hr, render } from '@react-email/components';
import * as React from 'react';

// Функция для конвертации блочного контента в HTML
// Современная функция: гарантирует ресайз Supabase-изображений в любом HTML
function addResizeToSupabaseImages(html, width = 600, quality = 70) {
  if (!html || typeof html !== 'string') return html;
  try {
    // Используем DOMParser через JSDOM-like API (или fallback на regex)
    // В среде node/email можно использовать regexp, но делаем максимально устойчиво
    return html.replace(/<img([^>]+src=["'])(https:\/\/[^"'>]*supabase\.co\/storage[^"'>]*)(["'][^>]*)>/g, (match, before, url, after) => {
      let newUrl = url;
      if (!url.match(/[?&]width=\d+/)) {
        newUrl += (url.includes('?') ? '&' : '?') + `width=${width}&quality=${quality}`;
      }
      return `<img${before}${newUrl}${after}>`;
    });
  } catch {
    return html;
  }
}

function blocksToHtml(blocks) {
  if (!Array.isArray(blocks)) {
    try {
      blocks = JSON.parse(blocks);
    } catch {
      return blocks || '';
    }
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
        if (url.includes('supabase.co/storage')) {
          url += (url.includes('?') ? '&' : '?') + 'width=600&quality=70';
        }
        return `<img src="${url}" alt="${block.data?.caption || ''}" style="max-width: 100%; max-height: 400px; height: auto; display: block; margin: 20px auto;" />`;
      }
      case 'gallery':
        if (block.data?.images && Array.isArray(block.data.images)) {
          return block.data.images.map(img => {
            let url = img.url || '';
            if (url.includes('supabase.co/storage')) {
              url += (url.includes('?') ? '&' : '?') + 'width=600&quality=70';
            }
            return `<img src="${url}" alt="${img.caption || ''}" style="max-width: 100%; max-height: 400px; height: auto; display: block; margin: 10px auto;" />`;
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
      default:
        // Если это html-блок или неизвестный, тоже прогоняем через addResizeToSupabaseImages
        if (block.data?.html) {
          return addResizeToSupabaseImages(block.data.html);
        }
        return '';
    }
  }).join('');
}

// Эта обертка нужна, чтобы наш компонент мог работать на сервере
const NewsletterEmail = ({ title = 'Тема письма', content = '', unsubscribeUrl }) => {
  // Конвертируем блочный контент в HTML
  const contentHtml = blocksToHtml(content);

  return (
    <Html>
      <Head />
      <Preview>{title}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Шапка письма — как в хедере сайта */}
          <Section style={{ textAlign: 'center', marginBottom: 32 }}>
            <img
              src="https://merkurov.love/images/logo.svg"
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
            <div dangerouslySetInnerHTML={{ __html: contentHtml }} />
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

