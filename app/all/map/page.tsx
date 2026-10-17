import type { Metadata } from 'next';
import KnowledgeMapClient from './KnowledgeMapClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Knowledge Map',
  description: 'A map of connected data, texts, projects and ideas.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function KnowledgeMapPage() {
  return <KnowledgeMapClient />;
}