import { sanitizeMetadata } from '@/lib/metadataSanitize';

export const metadata = sanitizeMetadata({
  title: 'Tags | Anton Merkurov',
  description: 'Browse essays and projects by topic.',
  alternates: { canonical: 'https://www.merkurov.love/tags' },
  openGraph: {
    title: 'Tags | Anton Merkurov',
    description: 'Browse essays and projects by topic.',
    url: 'https://www.merkurov.love/tags',
    siteName: 'Anton Merkurov',
    type: 'website',
  },
});

export default function TagsIndexPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-center p-8">
      <h1 className="text-3xl font-bold text-blue-600 mb-4">Теги</h1>
      <p className="text-gray-500 mb-8">Выберите тег из списка материалов или перейдите на главную.</p>
    </div>
  );
}
