import PasswordGuard from '@/components/talks/PasswordGuard';
import LoungeInterface from '@/components/talks/LoungeInterface';

export default function TalksPage() {
  return (
    <PasswordGuard>
      <LoungeInterface />
    </PasswordGuard>
  );
}

export const dynamic = 'force-dynamic'; // Отключаем SSG для реального времени