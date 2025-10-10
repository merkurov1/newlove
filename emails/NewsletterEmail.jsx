import { Html, Head, Preview, Body, Container, Section, Heading, Text, Hr, render } from '@react-email/components';
import * as React from 'react';

// Функция для конвертации блочного контента в HTML
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
      case 'richText':
        return block.data?.html || '';
      
      case 'image':
        return `<img src="${block.data?.url}" alt="${block.data?.caption || ''}" style="max-width: 100%; max-height: 400px; height: auto; display: block; margin: 20px auto;" />`;
      
      case 'gallery':
        if (block.data?.images && Array.isArray(block.data.images)) {
          return block.data.images.map(img => 
            `<img src="${img.url}" alt="${img.caption || ''}" style="max-width: 100%; max-height: 400px; height: auto; display: block; margin: 10px auto;" />`
          ).join('');
        }
        return '';
      
      case 'quote':
        return `<blockquote style="border-left: 4px solid #ddd; margin: 20px 0; padding-left: 20px; font-style: italic; color: #666;">${block.data?.text || ''}</blockquote>`;
      
      case 'code':
        return `<pre style="background: #f5f5f5; padding: 15px; border-radius: 4px; overflow-x: auto; margin: 20px 0;"><code>${block.data?.code || ''}</code></pre>`;
      
      case 'columns':
        if (block.data?.columns && Array.isArray(block.data.columns)) {
          const columnWidth = Math.floor(100 / block.data.columns.length);
          const columnsHtml = block.data.columns.map(col => 
            `<div style="display: inline-block; width: ${columnWidth}%; vertical-align: top; padding: 0 10px;">${col.html || ''}</div>`
          ).join('');
          return `<div style="margin: 20px 0;">${columnsHtml}</div>`;
        }
        return '';
      
      case 'video':
        return `<div style="margin: 20px 0;"><a href="${block.data?.url}" target="_blank" style="color: #007cba;">📹 Смотреть видео</a></div>`;
      
      default:
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
          <Section style={{ textAlign: 'center', marginBottom: 24 }}>
            <img src="https://merkurov.love/images/logo.svg" alt="Anton Merkurov" style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 8px' }} />
            <div style={{ fontWeight: 700, fontSize: 28, letterSpacing: 1, color: '#222', marginBottom: 2, textTransform: 'uppercase' }}>Anton Merkurov</div>
            <div style={{ fontSize: 16, color: '#888', letterSpacing: 2, fontWeight: 600, marginTop: 2, textTransform: 'uppercase' }}>ART X LOVE X MONEY</div>
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

