import type { Metadata } from 'next';
import FlowJoinClient from './FlowJoinClient';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://merkurov.love';

export const metadata: Metadata = {
  title: 'FLOW | Private Dispatch by Anton Merkurov',
  description:
    'Direct unfiltered thoughts on digital media, art, artificial intelligence, and culture. No noise, zero spam.',
  keywords: [
    'Anton Merkurov',
    'Flow',
    'Newsletter',
    'Digital Art',
    'Media Analysis',
    'AI',
    'Art Engine',
  ],
  authors: [{ name: 'Anton Merkurov', url: siteUrl }],
  creator: 'Anton Merkurov',
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: '/flow/join',
    languages: {
      'en-US': '/flow/join?lang=en',
      'ru-RU': '/flow/join?lang=ru',
    },
  },
  openGraph: {
    title: 'FLOW | Private Dispatch by Anton Merkurov',
    description:
      'Direct unfiltered thoughts on digital media, art, artificial intelligence, and culture.',
    url: `${siteUrl}/flow/join`,
    siteName: 'Merkurov.love',
    images: [
      {
        url: `${siteUrl}/og-flow-join.png`, // Укажите путь к скриншоту/обложке (1200x630)
        width: 1200,
        height: 630,
        alt: 'FLOW Newsletter — Private Dispatch by Anton Merkurov',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FLOW | Private Dispatch by Anton Merkurov',
    description:
      'Direct unfiltered thoughts on digital media, art, artificial intelligence, and culture.',
    creator: '@merkurov',
    images: [`${siteUrl}/og-flow-join.png`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function FlowJoinPage() {
  return <FlowJoinClient />;
}
