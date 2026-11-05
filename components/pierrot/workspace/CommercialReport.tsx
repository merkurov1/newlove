import Link from 'next/link';
import { ChevronRight, Wallet } from 'lucide-react';
import {
  commercialHomeStatus,
  type CommercialSummary,
} from '@/lib/pierrot/commercialSummary';

/**
 * One compact money indicator. Amounts, payment counts and source details stay
 * in DASH; this screen only says whether confirmed money exists.
 */
export function CommercialBrief({ summary }: { summary: CommercialSummary }) {
  const status = commercialHomeStatus(summary);

  return (
    <Link
      href="/admin/pierrot/dash"
      className="pw-home-indicator pw-commercial-indicator"
      data-tone={status.tone}
      aria-label={`Деньги: ${status.label}. Открыть DASH`}
    >
      <span className="pw-home-indicator-icon" aria-hidden="true">
        <Wallet size={16} strokeWidth={1.5} />
      </span>
      <span className="pw-home-indicator-label">Деньги</span>
      <span className="pw-home-indicator-value">{status.label}</span>
      <span className="pw-home-indicator-chevron" aria-hidden="true">
        <ChevronRight size={15} strokeWidth={1.4} />
      </span>
    </Link>
  );
}
