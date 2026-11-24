import RitualModal from '@/components/temple/RitualModal';
import HeartPhysics from '@/components/HeartPhysics';

export default function CalmModal() {
  return (
    <RitualModal
      title="Keep Calm"
      canonicalPath="/heartandangel/calm"
      scene
    >
      <HeartPhysics
        daemonUrl="https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Daemon.png"
        heartUrl="https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Heart1.png"
      />
    </RitualModal>
  );
}
