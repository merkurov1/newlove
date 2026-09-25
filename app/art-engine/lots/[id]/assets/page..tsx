'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';

export default function LotAssetsPage() {
  const params = useParams();
  const lotId = params.id;

  const [loading, setLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/lots/${lotId}/generate-reel`, {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Ошибка генерации');

      setVideoUrl(data.videoUrl);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 text-white">
      <h1 className="text-2xl font-bold mb-4">Генерация Reels для лота #{lotId}</h1>
      
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 flex flex-col items-center justify-center min-h-[400px]">
        {!videoUrl && !loading && (
          <button
            onClick={handleGenerate}
            className="px-6 py-3 bg-white text-black font-semibold rounded-lg hover:bg-neutral-200 transition"
          >
            Сгенерировать Reels (30 сек)
          </button>
        )}

        {loading && (
          <div className="flex flex-col items-center space-y-3">
            <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
            <p className="text-neutral-400 text-sm">Рендерим видео (это займет пару секунд)...</p>
          </div>
        )}

        {error && (
          <p className="text-red-400 text-sm mb-4">Ошибка: {error}</p>
        )}

        {videoUrl && (
          <div className="w-full flex flex-col items-center space-y-4">
            <video
              src={videoUrl}
              controls
              autoPlay
              loop
              className="max-h-[600px] rounded-lg shadow-2xl border border-neutral-700"
            />
            <div className="flex space-x-4">
              <a
                href={videoUrl}
                download={`lot-${lotId}-reel.mp4`}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition"
              >
                Скачать MP4
              </a>
              <button
                onClick={handleGenerate}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm font-medium transition"
              >
                Пересоздать
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
