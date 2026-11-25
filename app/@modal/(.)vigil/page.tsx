import RitualModal from '@/components/temple/RitualModal';
import VigilExperience from '@/app/vigil/VigilExperience';

export default function VigilModal() {
  return <RitualModal title="Vigil" canonicalPath="/vigil"><VigilExperience presentation="modal" /></RitualModal>;
}
