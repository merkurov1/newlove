'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type OrderState = {
  id: string;
  status: string;
  confirmed: boolean;
  paymentReceived: boolean;
  amount: number;
  currency: string;
};

type ViewState =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'error' }
  | { kind: 'result'; order: OrderState };

function formatPrice(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency || 'GBP',
  }).format(amountMinor / 100);
}

export default function SuccessClient() {
  const searchParams = useSearchParams();
  const sessionId = searchParams?.get('session_id') || '';
  const [state, setState] = useState<ViewState>({ kind: 'loading' });

  useEffect(() => {
    if (!sessionId) {
      setState({ kind: 'missing' });
      return;
    }

    let active = true;
    let timer: number | undefined;

    async function load(attempt: number) {
      try {
        const response = await fetch(
          `/api/postcards/order-success?session_id=${encodeURIComponent(sessionId)}`,
          { cache: 'no-store' }
        );

        const data = await response.json().catch(() => ({}));

        if (!active) return;

        if (!response.ok) {
          setState({ kind: 'error' });
          return;
        }

        const order = data.order as OrderState | undefined;

        if (!order) {
          setState({ kind: 'error' });
          return;
        }

        setState({ kind: 'result', order });

        // Stripe may be ahead of the webhook. Keep asking, but never call the
        // order confirmed until the trusted server status says so.
        if (!order.confirmed && order.paymentReceived && attempt < 5) {
          timer = window.setTimeout(() => void load(attempt + 1), 2000);
        }
      } catch {
        if (active) setState({ kind: 'error' });
      }
    }

    void load(0);

    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [sessionId]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAF8F5] px-6 py-20 text-[#141210]">
      <section className="w-full max-w-xl border-t border-[#D9D2C7] pt-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8A8176]">
          Heart &amp; Angel · Postcard
        </p>

        {state.kind === 'loading' && (
          <div aria-live="polite" aria-busy="true">
            <h1 className="mt-5 font-serif text-4xl font-light leading-tight">
              Checking your order…
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[#5B544C]">
              We are reading the payment result from the existing Stripe checkout.
            </p>
          </div>
        )}

        {state.kind === 'missing' && (
          <div role="alert">
            <h1 className="mt-5 font-serif text-4xl font-light leading-tight">
              We could not find this order.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[#5B544C]">
              The checkout reference is missing. If you completed a payment, check your confirmation
              email or return to the postcard page.
            </p>
          </div>
        )}

        {state.kind === 'error' && (
          <div role="alert">
            <h1 className="mt-5 font-serif text-4xl font-light leading-tight">
              We cannot read the order status right now.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[#5B544C]">
              This does not mean the payment failed. Please keep your Stripe receipt and try again
              in a moment.
            </p>
          </div>
        )}

        {state.kind === 'result' && state.order.confirmed && (
          <div aria-live="polite">
            <h1 className="mt-5 font-serif text-4xl font-light leading-tight">
              Payment confirmed.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[#5B544C]">
              Stripe has confirmed the payment and the order is now marked paid. The postcard will
              be prepared using the delivery details you entered.
            </p>

            <dl className="mt-8 space-y-3 border-t border-[#D9D2C7] pt-6 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[#8A8176]">Order</dt>
                <dd>#{state.order.id}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#8A8176]">Status</dt>
                <dd>{state.order.status}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#8A8176]">Total</dt>
                <dd>{formatPrice(state.order.amount, state.order.currency)}</dd>
              </div>
            </dl>
          </div>
        )}

        {state.kind === 'result' && !state.order.confirmed && (
          <div aria-live="polite">
            <h1 className="mt-5 font-serif text-4xl font-light leading-tight">
              {state.order.paymentReceived
                ? 'Payment received — confirming the order.'
                : 'Your order is not confirmed yet.'}
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[#5B544C]">
              {state.order.paymentReceived
                ? 'Stripe has reported the payment, but the trusted order status has not been updated yet. This page will check again briefly.'
                : 'We have not received a trusted payment confirmation for this order. Nothing is marked as paid. If you cancelled or did not finish payment, you have not been charged.'}
            </p>

            <dl className="mt-8 space-y-3 border-t border-[#D9D2C7] pt-6 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[#8A8176]">Order</dt>
                <dd>#{state.order.id}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#8A8176]">Status</dt>
                <dd>{state.order.status}</dd>
              </div>
            </dl>
          </div>
        )}

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/heartandangel/card#order"
            className="inline-flex items-center rounded-full bg-[#141210] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#FAF8F5] transition hover:bg-[#37332D]"
          >
            Back to the postcard
          </Link>
          <Link
            href="/heartandangel"
            className="inline-flex items-center rounded-full border border-[#D9D2C7] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5B544C] transition hover:border-[#B5AAA0]"
          >
            Heart &amp; Angel
          </Link>
        </div>
      </section>
    </div>
  );
}
