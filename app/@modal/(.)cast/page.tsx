import RitualModal from '@/components/temple/RitualModal';
import CastClient from '@/app/cast/CastClient';

/**
 * Cast keeps the shared full-screen RitualModal shell: one dialog layer, one
 * header, one ritual dock. The Cast experience receives `variant="modal"` so it
 * does not render its own TempleTopBar, page title or 100dvh wrapper inside the
 * already-scrolling modal content slot.
 *
 * The canonical /cast route renders the same CastClient with the page variant.
 */
export default function CastModal() {
  return (
    <RitualModal title="Cast" canonicalPath="/cast">
      <CastClient variant="modal" />
    </RitualModal>
  );
}
