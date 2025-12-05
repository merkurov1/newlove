export const metadata = {
  title: 'UNFRAMED - Memoir by Anton Merkurov',
  description: 'UNFRAMED — a memoir by Anton Merkurov.',
  authors: [{ name: 'Anton Merkurov' }],
  openGraph: {
    type: 'article',
    locale: 'en_US',
    title: 'UNFRAMED - Memoir by Anton Merkurov',
    description: 'UNFRAMED — a memoir by Anton Merkurov.',
    url: 'https://www.merkurov.love/unframed',
    siteName: 'Merkurov',
    images: [
      {
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Prompt_a_translucent_202512051450.jpeg',
        width: 1200,
        height: 630,
        alt: 'UNFRAMED — cover artwork',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@merkurov_love',
    title: 'UNFRAMED - Memoir by Anton Merkurov',
    description: 'UNFRAMED — a memoir by Anton Merkurov.',
    images: ['https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Prompt_a_translucent_202512051450.jpeg'],
  },
  alternates: {
    canonical: 'https://www.merkurov.love/unframed',
  },
};

export default function UnframedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
