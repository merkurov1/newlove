import { Html, Head, Preview, Body, Container, Section, Heading, Text, Hr, render } from '@react-email/components';
import * as React from 'react';
import { marked } from 'marked';

// Эта обертка нужна, чтобы наш компонент мог работать на сервере
const NewsletterEmail = ({ title = 'Тема письма', content = '<p>Содержимое...</p>' }) => {
  // Конвертируем Markdown в HTML прямо здесь
  const contentHtml = marked.parse(content);

  return (
    <Html>
      <Head />
      <Preview>{title}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section>
            <Heading style={heading}>{title}</Heading>
            <div dangerouslySetInnerHTML={{ __html: contentHtml }} />
            <Hr style={hr} />
            <Text style={footer}>
              Anton Merkurov | Вы получили это письмо, потому что подписались на рассылку на сайте merkurov.love
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default NewsletterEmail;

// Функция для рендеринга, которую мы будем вызывать в Server Action
export const renderNewsletterEmail = (props) => render(<NewsletterEmail {...props} />);


// Стили для письма
const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif' };
const container = { margin: '0 auto', padding: '20px 0 48px', width: '580px' };
const heading = { fontSize: '24px', lineHeight: '1.3', fontWeight: '700', color: '#484848' };
const hr = { borderColor: '#cccccc', margin: '20px 0' };
const footer = { color: '#8898aa', fontSize: '12px', lineHeight: '16px' };

