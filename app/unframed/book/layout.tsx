import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Read UNFRAMED — Full Book | Anton Merkurov',
  description:
    'Read UNFRAMED, the memoir by Anton Merkurov: a first-person account of migration, media, digital frontiers and the passage from granite to ether.',
  path: '/unframed/book',
  type: 'book',
  image:
    'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Prompt_a_translucent_202512051450.jpeg',
  imageAlt: 'UNFRAMED — cover artwork',
  languages: {
    'x-default': '/unframed/book',
    en: '/unframed/book',
  },
});

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return children;
}
