// app/talks/page.tsx
import PasswordGuard from '@/components/PasswordGuard';
import LoungeInterface from '@/components/LoungeInterface';

// Отключаем статическую генерацию для этой страницы
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function TalksPage() {
  return (
    <PasswordGuard>
      <LoungeInterface />
    </PasswordGuard>
  );
}
