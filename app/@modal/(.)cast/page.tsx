import RitualModal from '@/components/temple/RitualModal';
import CastClient from '@/app/cast/CastClient';

export default function CastModal() {
  return <RitualModal title="Cast" canonicalPath="/cast"><CastClient /></RitualModal>;
}
