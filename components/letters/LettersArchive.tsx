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
  initialDebug?: any;
  lastUpdated?: string | null;
}

const LettersArchiveClient = dynamic(() => import('./LettersArchiveClient'), { ssr: false });

export default function LettersArchive({ initialLetters = [], initialDebug = null, lastUpdated = null }: Props) {
  const letters = initialLetters || [];
  const debug = initialDebug || null;

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
        {debug && (
          <pre className="whitespace-pre-wrap text-xs text-left mt-4 bg-gray-50 p-3 rounded">{JSON.stringify(debug, null, 2)}</pre>
        )}

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

      {debug && (
        <div className="mt-4">
          {lastUpdated && (
            <div className="text-xs text-gray-400 mb-2">Последнее обновление: {new Date(lastUpdated).toLocaleString('ru-RU')}</div>
          )}
          <h4 className="text-sm font-medium text-gray-700">Debug info</h4>
          <pre className="whitespace-pre-wrap text-xs bg-gray-50 p-3 rounded mt-2">{JSON.stringify(debug, null, 2)}</pre>
          {debug.extra && (
            <div className="mt-3 text-sm text-gray-600">
              <div>Published count: <strong>{debug.extra.publishedCount ?? 0}</strong></div>
              <div>Unpublished count: <strong>{debug.extra.unpublishedCount ?? 0}</strong></div>
              {Array.isArray(debug.extra.sampleUnpublished) && debug.extra.sampleUnpublished.length > 0 && (
                <div className="mt-2">
                  <div className="font-medium">Sample unpublished:</div>
                  <ul className="list-disc list-inside text-xs mt-1">
                    {debug.extra.sampleUnpublished.map((s: any) => (
                      <li key={s.id}>
                        <span className="font-medium">{s.title || s.slug}</span> — {String(s.published)} — {s.publishedAt || s.createdAt}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}