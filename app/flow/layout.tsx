import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Flow — Anton Merkurov',
  description:
    'Stream of thoughts, notes, media artifacts and signals by Anton Merkurov.',
  alternates: {
    canonical: 'https://www.merkurov.love/flow',
  },
  openGraph: {
    title: 'Flow — Anton Merkurov',
    description:
      'Stream of thoughts, notes, media artifacts and signals by Anton Merkurov.',
    url: 'https://www.merkurov.love/flow',
    siteName: 'Anton Merkurov',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Flow — Anton Merkurov',
    description:
      'Stream of thoughts, notes, media artifacts and signals by Anton Merkurov.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function FlowLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
