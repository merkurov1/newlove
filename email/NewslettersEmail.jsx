import { Html, Head, Preview, Body, Container, Section, Heading, Text, Hr } from '@react-email/components';
import * as React from 'react';

export default function NewsletterEmail({ title = 'Тема письма', content = '<p>Содержимое...</p>' }) {
  return (
    <Html>
      <Head />
      <Preview>{title}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section>
            <Heading style={heading}>{title}</Heading>
            {/* Мы используем dangerouslySetInnerHTML, чтобы рендерить HTML из Markdown */}
            <div dangerouslySetInnerHTML={{ __html: content }} />
            <Hr style={hr} />
            <Text style={footer}>
              Anton Merkurov | Вы получили это письмо, потому что подписались на рассылку на сайте merkurov.love
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// Стили для письма
const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif' };
const container = { margin: '0 auto', padding: '20px 0 48px', width: '580px' };
const heading = { fontSize: '24px', lineHeight: '1.3', fontWeight: '700', color: '#484848' };
const hr = { borderColor: '#cccccc', margin: '20px 0' };
const footer = { color: '#8898aa', fontSize: '12px', lineHeight: '16px' };

