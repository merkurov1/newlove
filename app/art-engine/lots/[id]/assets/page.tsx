'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function LotAssetsPage() {
  const params = useParams();
  const lotId = params?.id ? String(params.id) : '';

  const [loading, setLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!lotId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/lots/${lotId}/generate-reels`, {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Ошибка генерации видео');

      setVideoUrl(data.videoUrl);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans pt-20 pb-32 px-4 sm:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Хедер / навигация назад */}
        <div className="flex items-center justify-between border-b border-neutral-200 pb-4 font-mono text-xs">
          <Link 
            href={`/art-engine/lots/${lotId}`} 
            className="text-neutral-500 hover:text-neutral-900 transition flex items-center gap-1 uppercase tracking-wider"
          >
            ← Back to Dossier
          </Link>
          <span className="text-neutral-400">ASSET STUDIO / REEL GENERATOR</span>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-8 shadow-sm flex flex-col items-center justify-center min-h-[480px]">
          
          {/* Кнопка запуска, если видео еще не сгенерировано */}
          {!videoUrl && !loading && (
            <div className="text-center space-y-4">
              <div className="space-y-1">
                <h1 className="font-serif text-2xl text-neutral-900">30-Second Reel Generation</h1>
                <p className="text-xs font-mono text-neutral-500">Берёт визуальные данные лота, накладывает зум и ключевые титры</p>
              </div>
              <button
                onClick={handleGenerate}
                className="px-6 py-3 bg-neutral-900 text-white font-mono text-xs uppercase tracking-widest hover:bg-neutral-800 transition"
              >
                ⚡ Render MP4 Reel
              </button>
            </div>
          )}

          {/* Индикатор загрузки / рендеринга */}
          {loading && (
            <div className="flex flex-col items-center space-y-3 font-mono text-xs text-neutral-500">
              <div className="w-6 h-6 border-2 border-neutral-300 border-t-neutral-900 rounded-full animate-spin"></div>
              <p>Рендеринг через FFmpeg и загрузка в Supabase...</p>
            </div>
          )}

          {/* Блок ошибки */}
          {error && (
            <div className="text-center space-y-3">
              <p className="text-red-600 font-mono text-xs">Ошибка: {error}</p>
              <button
                onClick={handleGenerate}
                className="px-4 py-2 bg-neutral-100 text-neutral-900 font-mono text-xs hover:bg-neutral-200"
              >
                Попробовать снова
              </button>
            </div>
          )}

          {/* Результат: Плеер и скачивание */}
          {videoUrl && (
            <div className="w-full flex flex-col items-center space-y-6">
              <div className="relative bg-black rounded-lg overflow-hidden shadow-2xl border border-neutral-800 max-w-[360px] w-full">
                <video
                  src={videoUrl}
                  controls
                  autoPlay
                  loop
                  playsInline
                  className="w-full aspect-[9/16] object-contain"
                />
              </div>
              
              <div className="flex items-center gap-4 font-mono text-xs">
                <a
                  href={videoUrl}
                  download={`lot-${lotId}-reel.mp4`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-5 py-2.5 bg-neutral-900 text-white hover:bg-neutral-800 transition uppercase tracking-widest"
                >
                  Download MP4 ↗
                </a>
                <button
                  onClick={handleGenerate}
                  className="px-4 py-2.5 bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition uppercase tracking-wider"
                >
                  Re-render
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
