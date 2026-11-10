import type { Metadata } from 'next';
import JournalPageView from './JournalPageView';
import { journalMetadata } from '@/lib/i18n/journal';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = journalMetadata('en');

export default function JournalPage() {
  return <JournalPageView lang="en" />;
}
