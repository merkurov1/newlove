'use client';

import MediaAnalysisClient from '@/components/admin/MediaAnalysisClient';

export default function MediaAnalysisPage({ params }: { params: { id: string } }) {
  return <MediaAnalysisClient mediaRecordId={params.id} />;
}
