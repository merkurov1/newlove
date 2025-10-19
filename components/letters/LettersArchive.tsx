import Link from 'next/link';
import dynamic from 'next/dynamic';

interface Letter {
  id: string;
  title: string;
  slug: string;
  publishedAt?: string;
  createdAt?: string;
  author?: { name?: string };
}

interface Props {
  initialLetters?: Letter[];
  lastUpdated?: string | null;
}

const LettersArchiveClient = dynamic(() => import('./LettersArchiveClient'), { ssr: false });

export default function LettersArchive({ initialLetters = [], lastUpdated = null }: Props) {
  const letters = initialLetters || [];

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (letters.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-600 mb-2">📭 Архив пуст</div>
        <div className="text-sm text-gray-500">Письма появятся здесь после публикации</div>
        {lastUpdated && (
          <div className="text-xs text-gray-400 mt-2">Последнее обновление: {new Date(lastUpdated).toLocaleString('ru-RU')}</div>
        )}
        {/* debug output removed */}

        {/* Client-side refresh component as fallback for stale caches */}
        <div className="mt-4">
          <LettersArchiveClient initialLetters={initialLetters} initialLastUpdated={lastUpdated} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {letters.map((letter) => (
        <article
          key={letter.id}
          className="group border border-blue-50 rounded-xl p-4 bg-white/90 hover:border-blue-200 hover:shadow transition-all duration-200"
        >
          <Link href={`/letters/${letter.slug}`} className="block">
            <h3 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors mb-1">
              {letter.title}
            </h3>
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>{letter.author?.name || 'Автор'}</span>
              <time dateTime={letter.publishedAt || letter.createdAt}>
                {formatDate(letter.publishedAt || letter.createdAt)}
              </time>
            </div>
          </Link>
        </article>
      ))}

      {/* debug info removed */}
    </div>
  );
}