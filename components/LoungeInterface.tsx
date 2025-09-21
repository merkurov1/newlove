// components/LoungeInterface.tsx
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser'; // Импортируем наш новый клиент

// Определяем тип для диалога (можете настроить под вашу таблицу)
type Dialogue = {
  id: number;
  created_at: string;
  speaker: string;
  message: string;
};

export default function LoungeInterface() {
  const supabase = createClient();
  const [dialogues, setDialogues] = useState<Dialogue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDialogues() {
      // Замените 'dialogues' на реальное имя вашей таблицы
      const { data, error } = await supabase
        .from('dialogues')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching dialogues:', error);
      } else {
        setDialogues(data);
      }
      setLoading(false);
    }

    fetchDialogues();
  }, [supabase]);

  if (loading) {
    return <div className="text-center p-8">Загрузка диалогов...</div>;
  }

  if (dialogues.length === 0) {
    return <div className="text-center p-8">Диалоги не найдены.</div>;
  }

  return (
    <div className="space-y-4 p-4 md:p-8">
      {dialogues.map((dialogue) => (
        <div key={dialogue.id} className="p-4 rounded-lg shadow bg-white">
          <p className="font-bold text-blue-600">{dialogue.speaker}:</p>
          <p className="text-gray-800">{dialogue.message}</p>
          <p className="text-xs text-gray-400 mt-2 text-right">
            {new Date(dialogue.created_at).toLocaleString('ru-RU')}
          </p>
        </div>
      ))}
    </div>
  );
}
