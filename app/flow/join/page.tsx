import type { Metadata } from 'next';
import FlowJoinClient from './FlowJoinClient';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://merkurov.love';
const imageUrl =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/artifacts/IMG_1542.jpeg';

export const metadata: Metadata = {
  title: 'FLOW | Anton Merkurov',
  description:
    'Я ничего не пишу, я только отбираю. Раз в неделю из этого собирается выпуск без редакции, только вкус одного человека, умноженный на код.',
  keywords: [
    'Anton Merkurov',
    'Антон Меркуров',
    'FLOW',
    'Flow Feed',
    'Digital Art',
    'Media',
    'AI',
    'Art Engine',
  ],
  authors: [{ name: 'Anton Merkurov', url: siteUrl }],
  creator: 'Anton Merkurov',
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: '/flow/join',
    languages: {
      'ru-RU': '/flow/join?lang=ru',
      'en-US': '/flow/join?lang=en',
    },
  },
  openGraph: {
    title: 'FLOW | Anton Merkurov',
    description:
      'Я ничего не пишу, я только отбираю. Раз в неделю из этого собирается выпуск без редакции, только вкус одного человека, умноженный на код.',
    url: `${siteUrl}/flow/join`,
    siteName: 'Merkurov.love',
    images: [
      {
        url: imageUrl,
        width: 1200,
        height: 630,
        alt: 'FLOW — I don’t write. I select. By Anton Merkurov',
      },
    ],
    locale: 'ru_RU',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FLOW | Anton Merkurov',
    description:
      "I don't write. I select. Once a week it becomes an issue with no newsroom, one person's taste multiplied by code.",
    creator: '@merkurov',
    images: [imageUrl],
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
