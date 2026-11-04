import Link from 'next/link';
import {
  commercialVerdict,
  type CommercialSummary,
} from '@/lib/pierrot/commercialSummary';

export function CommercialBrief({ summary }: { summary: CommercialSummary }) {
  const verdict = commercialVerdict(summary);

  return (
    <section
      className={`pw-commercial-brief pw-commercial-${verdict.tone}`}
      aria-label="Короткий коммерческий отчёт"
    >
      <div className="pw-commercial-brief-head">
        <span className="pw-kicker">Деньги · {summary.periodLabel}</span>
        <Link href="/admin/pierrot/dash" className="pw-commercial-link">
          в статистику →
        </Link>
      </div>
      <p className="pw-commercial-verdict">{verdict.headline}</p>
      <p className="pw-commercial-detail">{verdict.detail}</p>
      {!summary.complete && (
        <p className="pw-commercial-partial">
          Часть источников недоступна: {summary.errors.join(' · ')}
        </p>
      )}
    </section>
  );
}
