import Link from 'next/link';
import {
  commercialVerdict,
  formatCommercialMoney,
  russianCountLabel,
  type CommercialPeriodSummary,
  type CommercialProductSummary,
  type CommercialSummary,
} from '@/lib/pierrot/commercialSummary';

function productMoney(product: CommercialProductSummary): string {
  return formatCommercialMoney(product.money) || '—';
}

function moneyOrMissing(
  summary: CommercialPeriodSummary,
  totals: CommercialSummary['current']['money'],
  available: boolean
): string {
  if (!available) return 'недоступно';
  if (totals.length > 0) return formatCommercialMoney(totals);
  return summary.paidCount > 0 ? 'сумма не передана' : '—';
}

function ProductRow({
  label,
  product,
  available,
  forms,
}: {
  label: string;
  product: CommercialProductSummary;
  available: boolean;
  forms: [string, string, string];
}) {
  return (
    <div className="pw-commercial-product">
      <span>{label}</span>
      <strong>
        {available
          ? russianCountLabel(product.count, forms[0], forms[1], forms[2])
          : 'недоступно'}
      </strong>
      <span className="pw-commercial-product-money">
        {available ? productMoney(product) : ''}
      </span>
    </div>
  );
}

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

export function CommercialReport({ summary }: { summary: CommercialSummary }) {
  const verdict = commercialVerdict(summary);
  const current = summary.current;
  const money = moneyOrMissing(
    current,
    current.money,
    current.purchasesAvailable && current.donationsAvailable
  );

  return (
    <section className="pw-commercial" aria-labelledby="pw-commercial-title">
      <div className="pw-commercial-head">
        <div>
          <h2 id="pw-commercial-title" className="pw-section-title">
            Коммерция · {summary.periodLabel}
          </h2>
          <p className={`pw-commercial-verdict pw-commercial-${verdict.tone}`}>
            {verdict.headline}
          </p>
          <p className="pw-commercial-detail">{verdict.detail}</p>
        </div>
        <div className="pw-commercial-total">
          <span className="pw-kicker">Сумма</span>
          <strong>{money}</strong>
        </div>
      </div>

      <div className="pw-commercial-products">
        <ProductRow
          label="Heart & Angel"
          product={current.postcards}
          available={current.purchasesAvailable}
          forms={['оплата', 'оплаты', 'оплат']}
        />
        <ProductRow
          label="UNFRAMED"
          product={current.unframed}
          available={current.purchasesAvailable}
          forms={['покупка', 'покупки', 'покупок']}
        />
        <ProductRow
          label="Temple Tributes"
          product={current.tributes}
          available={current.donationsAvailable}
          forms={['пожертвование', 'пожертвования', 'пожертвований']}
        />
        <div className="pw-commercial-product">
          <span>Flow</span>
          <strong>
            {current.subscriptionsAvailable
              ? `+${current.flowSubscriptions}`
              : 'недоступно'}
          </strong>
          <span className="pw-commercial-product-money">
            {current.subscriptionsAvailable ? 'подписок' : ''}
          </span>
        </div>
      </div>

      <div className="pw-commercial-overall">
        <span className="pw-kicker">Всего на сайте</span>
        <span>
          Открытки:{' '}
          {summary.overall.postcardsAvailable
            ? `${summary.overall.postcards.count} · ${productMoney(summary.overall.postcards)}`
            : 'недоступно'}
        </span>
        <span>
          Temple:{' '}
          {summary.overall.tributesAvailable
            ? `${summary.overall.tributes.count} · ${productMoney(summary.overall.tributes)}`
            : 'недоступно'}
        </span>
        <span>
          Flow:{' '}
          {summary.overall.subscriptionsAvailable
            ? `+${summary.overall.flowSubscriptions}`
            : 'недоступно'}
        </span>
      </div>

      <p className="pw-commercial-foot">
        Только подтверждённые оплаты и подписки. Checkout, интерес и показанные предложения не
        считаются выручкой. GBP и USD не суммируются; возвраты и комиссии Stripe не вычитаются.
      </p>

      {!summary.complete && (
        <p className="pw-commercial-partial">
          Часть источников недоступна: {summary.errors.join(' · ')}
        </p>
      )}
    </section>
  );
}
