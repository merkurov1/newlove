import type { Metadata } from 'next';
import JournalPageView from '@/app/journal/JournalPageView';
import { journalMetadata } from '@/lib/i18n/journal';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = journalMetadata('ru');

export default function RussianJournalPage() {
  return <JournalPageView lang="ru" />;
}
