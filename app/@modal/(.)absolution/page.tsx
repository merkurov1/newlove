import RitualModal from '@/components/temple/RitualModal';
import AbsolutionClient from '@/app/absolution/AbsolutionClient';

export default function AbsolutionModal() {
  return <RitualModal title="Absolution" canonicalPath="/absolution"><AbsolutionClient /></RitualModal>;
}
