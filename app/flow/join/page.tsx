import type { Metadata } from 'next';
import FlowJoinClient from './FlowJoinClient';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://merkurov.love';

export const metadata: Metadata = {
  title: 'FLOW | Private Dispatch by Anton Merkurov',
  description:
    'Еженедельный журнал Антона Меркурова о медиа, искусстве, ИИ и цифровой культуре. Без алгоритмического шума.',
  keywords: [
    'Anton Merkurov',
    'Антон Меркуров',
    'Flow',
    'Рассылка',
    'Digital Art',
    'Media Analysis',
    'AI',
  ],
  authors: [{ name: 'Anton Merkurov', url: siteUrl }],
  creator: 'Anton Merkurov',
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: '/flow/join',
  },
  openGraph: {
    title: 'THE FLOW | Anton Merkurov',
    description:
      'Прямой поток мыслей о медиа, искусстве, ИИ и цифровой культуре. Подписаться на рассылку.',
    url: `${siteUrl}/flow/join`,
    siteName: 'Merkurov.love',
    images: [
      {
        url: `${siteUrl}/og-flow.png`, // Убедитесь, что файл с превью находится в public/og-flow.png
        width: 1200,
        height: 630,
        alt: 'FLOW Newsletter by Anton Merkurov',
      },
    ],
    locale: 'ru_RU',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'THE FLOW | Anton Merkurov',
    description:
      'Прямой поток мыслей о медиа, искусстве, ИИ и цифровой культуре.',
    creator: '@merkurov',
    images: [`${siteUrl}/og-flow.png`],
  },
};

export default function FlowJoinPage() {
  return <FlowJoinClient />;
}
