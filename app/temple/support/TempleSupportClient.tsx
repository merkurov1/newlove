'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Heart, LockKeyhole } from 'lucide-react';
import {
  MAX_TRIBUTE_AMOUNT,
  MIN_TRIBUTE_AMOUNT,
  isPartialTributeAmount,
  parseTributeAmountInput,
} from '@/lib/tributes/amount';
import {
  trackTributeAmountSelected,
  trackTributeCheckoutCreated,
  trackTributeSupportView,
} from '@/lib/tributes/analytics';
import {
  createTributeCheckout,
  openSecureCheckout,
} from '@/lib/tributes/checkoutClient';
import styles from '../temple.module.css';

const PRESETS = [5, 20, 100] as const;

function formatAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

/**
 * The non-modal payment selection step for the Temple.
 *
 * A preset amount is a complete instruction and goes straight to the existing
 * Stripe Checkout route. A custom amount becomes a complete instruction only
 * after it has been parsed and validated locally, and the server validates it
 * again. No modal is opened and `/tribute` is never used as an intermediate
 * page. The visitor still confirms payment on Stripe's hosted checkout.
 */
export default function TempleSupportClient() {
  const [customText, setCustomText] = useState('');
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trackTributeSupportView('temple_support');
  }, []);

  const startCheckout = useCallback(
    async (amount: number, preset: boolean) => {
      if (pending !== null) return;

      setPending(amount);
      setError(null);

      if (preset) {
        trackTributeAmountSelected(amount, true);
      }

      try {
        const donorName =
          typeof window !== 'undefined'
            ? localStorage.getItem('temple_user') || 'Pilgrim'
            : 'Pilgrim';

        const { url } = await createTributeCheckout({
          amount,
          donorName,
          message: 'Fuel for the Temple',
          search:
            typeof window !== 'undefined'
              ? window.location.search
              : null,
        });

        trackTributeCheckoutCreated(amount);
        openSecureCheckout(url);
        window.setTimeout(() => setPending(null), 20_000);
      } catch (checkoutError) {
        console.error('Temple support checkout error:', checkoutError);
        setPending(null);
        setError(
          checkoutError instanceof Error
            ? checkoutError.message
            : 'The secure checkout could not be opened. Please try again.'
        );
      }
    },
    [pending]
  );

  const startCustomCheckout = () => {
    const amount = parseTributeAmountInput(customText);

    if (amount === null) {
      setError(
        `Enter an amount between $${MIN_TRIBUTE_AMOUNT} and $${formatAmount(
          MAX_TRIBUTE_AMOUNT
        )}.`
      );
      return;
    }

    trackTributeAmountSelected(amount, false);
    void startCheckout(amount, false);
  };

  return (
    <div className={styles.supportStage} data-temple-theme="light">
      <div className={styles.supportShell}>
        <header className={styles.supportHeader}>
          <Link href="/temple" className={styles.navLink}>
            <span aria-hidden="true">←</span>
            <span>Temple</span>
          </Link>
          <span className={styles.navMark}>Heart &amp; Angel</span>
        </header>

        <main data-testid="temple-support-step">
          <div className={styles.supportHero}>
            <p className={styles.supportEyebrow}>THE SANCTUARY</p>
            <h1 className={styles.supportHeading}>Support the Temple</h1>
            <p className={styles.supportLead}>
              Choose an amount. The secure Stripe checkout opens immediately;
              nothing is charged until you confirm there.
            </p>
          </div>

          <section
            className={styles.supportForm}
            aria-labelledby="support-amount-title"
          >
            <p id="support-amount-title" className={styles.supportFormLabel}>
              Choose an offering
            </p>

            <div className={styles.supportPresets}>
              {PRESETS.map(amount => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => void startCheckout(amount, true)}
                  disabled={pending !== null}
                  className={styles.supportPreset}
                  title={`Continue to secure Stripe checkout for $${amount}`}
                >
                  {pending === amount ? 'Opening…' : `$${amount}`}
                </button>
              ))}
            </div>

            <div className={styles.customRow}>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                pattern="[0-9]*[.,]?[0-9]{0,2}"
                aria-label="Custom tribute amount in US dollars"
                placeholder="Custom amount"
                className={styles.customInput}
                value={customText}
                onChange={(event) => {
                  const next = event.target.value;

                  if (!isPartialTributeAmount(next)) return;

                  setCustomText(next);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    startCustomCheckout();
                  }
                }}
              />
              <button
                type="button"
                onClick={startCustomCheckout}
                disabled={pending !== null || !customText.trim()}
                className={styles.supportSubmit}
              >
                Continue
              </button>
            </div>

            {error && (
              <p className={styles.supportError} role="alert">
                {error}
              </p>
            )}

            <p className={styles.supportStatus} aria-live="polite">
              {pending !== null
                ? 'Opening the secure Stripe checkout…'
                : 'Preset amounts open Stripe immediately.'}
            </p>
          </section>

          <p className={styles.secureNote}>
            <LockKeyhole
              size={12}
              aria-hidden="true"
              style={{ display: 'inline', verticalAlign: '-2px' }}
            />{' '}
            Payment is handled by Stripe. The Temple validates the amount and
            confirms success only through Stripe verification and its webhook.
            Nothing is charged automatically.
          </p>

          <p className={styles.secureNote}>
            <Heart
              size={12}
              aria-hidden="true"
              style={{ display: 'inline', verticalAlign: '-2px' }}
            />{' '}
            Tribute materially sustains the Temple. Thank you for keeping the
            Sanctuary alive.
          </p>
        </main>
      </div>
    </div>
  );
}
