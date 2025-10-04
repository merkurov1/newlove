"use client";

import { useState } from 'react';
import { sendLetter } from '@/app/admin/actions';

interface Letter {
  id: string;
  title: string;
  sentAt?: Date | null;
}

interface SendLetterFormProps {
  letter: Letter;
}

export default function SendLetterForm({ letter }: SendLetterFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSendLetter(formData: FormData) {
    setIsLoading(true);
    setMessage('');
    
    try {
      const result = await sendLetter(null, formData);
      
      if (result.status === 'success') {
        setMessage(`✅ ${result.message}`);
      } else {
        setMessage(`❌ ${result.message}`);
      }
    } catch (error) {
      setMessage('❌ Произошла ошибка при отправке рассылки');
    } finally {
      setIsLoading(false);
    }
  }

  // Если письмо уже отправлено
  if (letter.sentAt) {
    return (
      <div className="text-green-700">
        ✅ Рассылка уже отправлена: {new Date(letter.sentAt).toLocaleString('ru-RU')}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
        <p className="text-yellow-800 text-sm">
          <strong>📝 Публикация ≠ Отправка рассылки</strong><br/>
          • Публикация = письмо появляется на сайте<br/>
          • Отправка рассылки = письмо приходит подписчикам на email
        </p>
      </div>
      
      <p className="text-blue-700 mb-4">
        Письмо готово к отправке. Убедитесь что содержимое корректное, затем нажмите кнопку ниже.
      </p>
      
      {message && (
        <div className="mb-4 p-3 bg-white border rounded-md">
          {message}
        </div>
      )}
      
      <form action={handleSendLetter} className="flex gap-3">
        <input type="hidden" name="letterId" value={letter.id} />
        
        <button
          type="submit"
          disabled={isLoading}
          className="px-6 py-3 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
              Отправляем...
            </>
          ) : (
            <>
              📧 Отправить рассылку
            </>
          )}
        </button>
      </form>
      
      <p className="text-sm text-gray-600 mt-2">
        ⚠️ После отправки отменить нельзя. Письмо будет доставлено всем активным подписчикам.
      </p>
    </div>
  );
}