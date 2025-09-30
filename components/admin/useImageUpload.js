// Универсальный хук для загрузки изображений в Supabase Storage через API
import { useState } from 'react';

export default function useImageUpload() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const upload = async (file) => {
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch('/api/upload/editor-image', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    setLoading(false);
    if (data.success && data.file?.url) {
      return data.file.url;
    } else {
      setError(data.error || 'Ошибка загрузки');
      return null;
    }
  };

  return { upload, loading, error };
}
