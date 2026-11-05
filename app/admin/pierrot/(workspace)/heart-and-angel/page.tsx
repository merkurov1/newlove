import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/serverAuth';
import HeartAndAngelWorkspace from '@/components/pierrot/workspace/HeartAndAngelWorkspace';

import './heart-and-angel.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'HEART & ANGEL',
  robots: { index: false, follow: false },
};

export default async function HeartAndAngelPage() {
  await requireAdmin();

  return <HeartAndAngelWorkspace />;
}
