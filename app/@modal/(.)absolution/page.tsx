import AbsolutionModal from '@/components/temple/AbsolutionModal';
import AbsolutionClient from '@/app/absolution/AbsolutionClient';

export default function AbsolutionModalRoute() {
  return (
    <AbsolutionModal title="Absolution" canonicalPath="/absolution">
      <AbsolutionClient variant="modal" />
    </AbsolutionModal>
  );
}
