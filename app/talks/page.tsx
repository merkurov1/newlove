// app/talks/page.tsx

// <-- 1. Убираем импорты PasswordGuard и LoungeInterface отсюда
import TalksClientPage from './TalksClientPage'; // <-- 2. Импортируем новый компонент

// Эта настройка по-прежнему полезна, чтобы страница не кешировалась
export const dynamic = 'force-dynamic';

export default function TalksPage() {
  // 3. Просто возвращаем TalksClientPage, который сделает всю работу
  return <TalksClientPage />;
}
