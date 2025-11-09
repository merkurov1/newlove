"use client";

import { useState } from 'react';
import { sendLetter } from '@/app/admin/actions';
import NewsletterJobStatus from './NewsletterJobStatus';

export default function SendLetterForm({ letter }) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);

  async function handleSendLetter(formData) {
    // Prevent double-send if already loading
    if (isLoading) {
      console.warn('Отправка уже в процессе, игнорируем повторный клик');
      return;
    }
    
    setIsLoading(true);
    setMessage('');
    setJobId(null);
    try {
      if (testEmail) formData.set('testEmail', testEmail);
      const result = await sendLetter(null, formData);
      if (result?.status === 'success') {
        setMessage(`✅ ${result.message}`);
        // If result contains jobId, show job status component
        if (result.jobId) {
          setJobId(result.jobId);
        }
      } else {
        setMessage(`❌ ${result?.message || 'Ошибка'}`);
      }
    } catch (error) {
      setMessage('❌ Произошла ошибка при отправке рассылки');
    } finally {
      setIsLoading(false);
    }
  }

  if (letter?.sentAt) {
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
          <strong>📝 Публикация ≠ Отправка рассылки</strong>
          <br />
          • Публикация = письмо появляется на сайте
          <br />
          • Отправка рассылки = письмо приходит подписчикам на email
        </p>
      </div>

      <p className="text-blue-700 mb-4">
        Письмо готово к отправке. Убедитесь что содержимое корректное, затем нажмите кнопку ниже.
      </p>

      {message && !jobId && (
        <div className="mb-4 p-3 bg-white border rounded-md">{message}</div>
      )}

      {jobId && (
        <div className="mb-4">
          <NewsletterJobStatus jobId={jobId} onComplete={() => {
            // Refresh page after completion to show updated sentAt
            window.location.reload();
          }} />
        </div>
      )}

      <form action={handleSendLetter} className="flex gap-3 flex-col md:flex-row">
        <input type="hidden" name="letterId" value={letter.id} />

        <div className="flex gap-2 items-center">
          <input
            type="email"
            name="testEmail"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="Тестовый email (опционально)"
            className="px-3 py-2 border rounded-md mr-2"
          />
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
                📧 {testEmail ? 'Отправить тест' : 'Отправить рассылку'}
              </>
            )}
          </button>
        </div>
      </form>

      <div className="text-sm text-gray-600 mt-3 p-3 bg-gray-50 border border-gray-200 rounded-md">
        <p className="font-semibold mb-2">ℹ️ Важная информация о рассылке:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>⚠️ После отправки отменить нельзя</li>
          <li>✉️ Письмо будет доставлено только <strong>активным</strong> подписчикам (isActive=true)</li>
          <li>🔒 Подписчики становятся активными только после подтверждения email</li>
          <li>❌ Неподтвержденные подписчики (isActive=false) НЕ получат письмо</li>
          <li>🚫 Повторная отправка той же рассылки заблокирована системой</li>
        </ul>
        <p className="mt-2 text-xs text-gray-500">
          💡 Чтобы увидеть список всех подписчиков и их статусы, используйте SQL запрос из файла migrations/2025-11-09_check_subscribers.sql
        </p>
      </div>
    </div>
  );
}
