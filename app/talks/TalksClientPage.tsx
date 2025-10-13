'use client';

import LoungeInterface from '@/components/LoungeInterface';
import type { InitialMessage } from '@/types/messages';

type Props = {
  initialMessages?: InitialMessage[];
  session?: any;
};

export default function TalksClientPage({ initialMessages = [], session = null }: Props) {
  // Keep this client component minimal during migration.
  return <LoungeInterface initialMessages={initialMessages} session={session} />;
}
