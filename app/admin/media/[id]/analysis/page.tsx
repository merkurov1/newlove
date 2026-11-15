'use client';

import { use } from 'react';
import MediaAnalysisClient from '@/components/admin/MediaAnalysisClient';

export default function MediaAnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <MediaAnalysisClient mediaRecordId={id} />;
}
