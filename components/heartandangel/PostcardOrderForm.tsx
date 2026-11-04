'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';

type Postcard = {
  id: string;
  title: string;
  description?: string | null;
  image: string;
  price: number;
  available: boolean;
  featured?: boolean;
};

type PaymentState = 'idle' | 'checking' | 'pending' | 'confirmed' | 'failed';

type TelegramWebApp = {
  openLink?: (
    url: string,
    options?: { try_instant_view?: boolean }
  ) => void;
};

const PENDING_SESSION_KEY = 'heartandangel_pending_postcard_session';
const STATUS_CHECK_THROTTLE_MS = 4_000;

function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;

  const webApp = (
    window as Window & {
      Telegram?: { WebApp?: TelegramWebApp };
    }
  ).Telegram?.WebApp;

  return webApp && typeof webApp === 'object' ? webApp : null;
}

function readPendingSession(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.sessionStorage.getItem(PENDING_SESSION_KEY);
  } catch {
    return null;
  }
}

function writePendingSession(sessionId: string | null) {
  if (typeof window === 'undefined') return;

  try {
    if (sessionId) {
      window.sessionStorage.setItem(PENDING_SESSION_KEY, sessionId);
    } else {
      window.sessionStorage.removeItem(PENDING_SESSION_KEY);
    }
  } catch {
    // Checkout still works when sessionStorage is blocked.
  }
}

type OrderFields = {
  recipientName: string;
  streetAddress: string;
  addressLine2: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
  phone: string;
  email: string;
  customMessage: string;
};

const initialFields: OrderFields = {
  recipientName: '',
  streetAddress: '',
  addressLine2: '',
  city: '',
  stateProvince: '',
  postalCode: '',
  country: 'United Kingdom',
  phone: '',
  email: '',
  customMessage: '',
};

const inputClass =
  'mt-2 w-full border-0 border-b border-stone-300 bg-transparent px-0 py-3 text-sm text-stone-900 outline-none transition focus:border-stone-900 placeholder:text-stone-400';

export default function PostcardOrderForm({
  postcard,
  pierrotAttribution = null,
}: {
  postcard: Postcard;
  pierrotAttribution?: string | null;
}) {
  const [fields, setFields] = useState<OrderFields>(initialFields);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentState, setPaymentState] = useState<PaymentState>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);

  const lastStatusCheckRef = useRef(0);
  const checkInFlightRef = useRef(false);

  const update = (key: keyof OrderFields, value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
  };

  const formatPrice = (minorUnits: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
    }).format(minorUnits / 100);

  const checkPendingSession = useCallback(async (sessionId: string) => {
    if (!sessionId || checkInFlightRef.current) return;

    checkInFlightRef.current = true;
    lastStatusCheckRef.current = Date.now();
    setPaymentState('checking');
    setStatusMessage('Checking the order status…');
    setError('');

    try {
      const response = await fetch(
        `/api/postcards/order-success?session_id=${encodeURIComponent(sessionId)}`,
        { cache: 'no-store' }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.order) {
        if (response.status === 400 || response.status === 404) {
          writePendingSession(null);
          setPendingSessionId(null);
          setPaymentState('failed');
          setStatusMessage(
            'This checkout could not be verified. If you were charged, keep your Stripe receipt and contact the Temple.'
          );
        } else {
          setPaymentState('pending');
          setStatusMessage(
            'Could not check the order yet. Please try again in a moment.'
          );
        }

        return;
      }

      const order = data.order as {
        confirmed?: boolean;
        paymentReceived?: boolean;
        status?: string;
      };

      if (order.confirmed) {
        writePendingSession(null);
        setPendingSessionId(null);
        setPaymentState('confirmed');
        setStatusMessage(
          'Payment confirmed. Your postcard order is being prepared.'
        );
      } else if (order.paymentReceived) {
        setPaymentState('pending');
        setStatusMessage(
          'Payment received. The Temple is still confirming the order. You can check again.'
        );
      } else {
        setPaymentState('pending');
        setStatusMessage(
          'No payment has been confirmed yet. If you cancelled, nothing was charged.'
        );
      }
    } catch {
      setPaymentState('pending');
      setStatusMessage(
        'Could not check the order right now. Your payment status is unchanged.'
      );
    } finally {
      checkInFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const pending = readPendingSession();

    if (pending) {
      setPendingSessionId(pending);
      lastStatusCheckRef.current = Date.now();
      void checkPendingSession(pending);
    }
  }, [checkPendingSession]);

  useEffect(() => {
    const handleReturn = () => {
      if (document.visibilityState === 'hidden') return;

      setLoading(false);

      const pending = readPendingSession();

      if (!pending) return;

      const now = Date.now();

      if (now - lastStatusCheckRef.current < STATUS_CHECK_THROTTLE_MS) {
        return;
      }

      lastStatusCheckRef.current = now;
      void checkPendingSession(pending);
    };

    window.addEventListener('focus', handleReturn);
    window.addEventListener('pageshow', handleReturn);
    document.addEventListener('visibilitychange', handleReturn);

    return () => {
      window.removeEventListener('focus', handleReturn);
      window.removeEventListener('pageshow', handleReturn);
      document.removeEventListener('visibilitychange', handleReturn);
    };
  }, [checkPendingSession]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setStatusMessage('');
    setPaymentState('idle');

    setLoading(true);

    try {
      const response = await fetch('/api/postcards/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postcardId: postcard.id,
          ...(pierrotAttribution ? { pierrotAttribution } : {}),
          ...fields,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || 'Could not create the order.');
      }

      if (!result.paymentUrl) {
        throw new Error('Stripe did not return a payment link.');
      }

      const sessionId =
        typeof result.sessionId === 'string' ? result.sessionId : null;

      if (sessionId) {
        setPendingSessionId(sessionId);
        writePendingSession(sessionId);
      } else {
        setPendingSessionId(null);
        writePendingSession(null);
      }

      const tg = getTelegramWebApp();

      if (tg && typeof tg.openLink === 'function') {
        try {
          tg.openLink(result.paymentUrl, { try_instant_view: false });
        } catch {
          setLoading(false);
          window.location.assign(result.paymentUrl);
          return;
        }

        setLoading(false);
        setPaymentState('pending');
        setStatusMessage(
          'Payment window opened. Complete the payment, then return here to check the order.'
        );
        return;
      }

      // Regular browser: the existing success page verifies the session.
      setLoading(false);
      window.location.assign(result.paymentUrl);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Something went wrong. Please try again.'
      );
      setLoading(false);
    }
  }

  const busy = loading || paymentState === 'checking';

  return (
    <form onSubmit={submit} className="space-y-10">
      <div className="grid grid-cols-1 gap-x-10 gap-y-7 sm:grid-cols-2">
        <label className="block text-xs uppercase tracking-[0.14em] text-stone-500">
          Recipient name *
          <input
            className={inputClass}
            name="recipientName"
            autoComplete="name"
            value={fields.recipientName}
            onChange={(e) => update('recipientName', e.target.value)}
            required
            maxLength={100}
            placeholder="Full name"
          />
        </label>

        <label className="block text-xs uppercase tracking-[0.14em] text-stone-500">
          Email *
          <input
            className={inputClass}
            type="email"
            name="email"
            autoComplete="email"
            value={fields.email}
            onChange={(e) => update('email', e.target.value)}
            required
            maxLength={254}
            placeholder="you@example.com"
          />
        </label>

        <label className="block text-xs uppercase tracking-[0.14em] text-stone-500 sm:col-span-2">
          Street address *
          <input
            className={inputClass}
            name="streetAddress"
            autoComplete="address-line1"
            value={fields.streetAddress}
            onChange={(e) => update('streetAddress', e.target.value)}
            required
            maxLength={200}
            placeholder="House number and street"
          />
        </label>

        <label className="block text-xs uppercase tracking-[0.14em] text-stone-500 sm:col-span-2">
          Apartment, suite, etc.
          <input
            className={inputClass}
            name="addressLine2"
            autoComplete="address-line2"
            value={fields.addressLine2}
            onChange={(e) => update('addressLine2', e.target.value)}
            maxLength={200}
            placeholder="Optional"
          />
        </label>

        <label className="block text-xs uppercase tracking-[0.14em] text-stone-500">
          City *
          <input
            className={inputClass}
            name="city"
            autoComplete="address-level2"
            value={fields.city}
            onChange={(e) => update('city', e.target.value)}
            required
            maxLength={100}
          />
        </label>

        <label className="block text-xs uppercase tracking-[0.14em] text-stone-500">
          Region / State
          <input
            className={inputClass}
            name="stateProvince"
            autoComplete="address-level1"
            value={fields.stateProvince}
            onChange={(e) => update('stateProvince', e.target.value)}
            maxLength={100}
          />
        </label>

        <label className="block text-xs uppercase tracking-[0.14em] text-stone-500">
          Postal code *
          <input
            className={inputClass}
            name="postalCode"
            autoComplete="postal-code"
            value={fields.postalCode}
            onChange={(e) => update('postalCode', e.target.value)}
            required
            maxLength={20}
          />
        </label>

        <label className="block text-xs uppercase tracking-[0.14em] text-stone-500">
          Country *
          <input
            className={inputClass}
            name="country"
            autoComplete="country-name"
            value={fields.country}
            onChange={(e) => update('country', e.target.value)}
            required
            maxLength={100}
          />
        </label>

        <label className="block text-xs uppercase tracking-[0.14em] text-stone-500">
          Phone (optional)
          <input
            className={inputClass}
            type="tel"
            name="phone"
            autoComplete="tel"
            value={fields.phone}
            onChange={(e) => update('phone', e.target.value)}
            maxLength={30}
          />
        </label>

        <label className="block text-xs uppercase tracking-[0.14em] text-stone-500 sm:col-span-2">
          A message for the recipient
          <textarea
            className={`${inputClass} min-h-24 resize-y`}
            name="customMessage"
            value={fields.customMessage}
            onChange={(e) => update('customMessage', e.target.value)}
            maxLength={500}
            placeholder="A few words to send with the postcard…"
          />
        </label>
      </div>

      <div className="border-t border-stone-200 pt-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-serif text-lg text-stone-900">
              {postcard.title}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-stone-500">
              Physical postcard · postage included
            </p>
          </div>
          <p className="font-serif text-2xl text-stone-900">
            {formatPrice(postcard.price)}
          </p>
        </div>

        {error && (
          <p role="alert" className="mt-5 text-sm text-red-700">
            {error}
          </p>
        )}

        {paymentState !== 'idle' && statusMessage && (
          <div
            className={`mt-5 border px-4 py-3 text-sm leading-relaxed ${
              paymentState === 'confirmed'
                ? 'border-[#B8C9B4] bg-[#EEF5EC] text-[#3F573B]'
                : paymentState === 'failed'
                  ? 'border-[#D9B8B8] bg-[#FBEFEF] text-[#7A3F3F]'
                  : 'border-[#D9D2C7] bg-[#F7F3EC] text-[#5B544C]'
            }`}
            role={paymentState === 'failed' ? 'alert' : 'status'}
            aria-live={paymentState === 'failed' ? 'assertive' : 'polite'}
          >
            <p>{statusMessage}</p>

            {pendingSessionId && paymentState !== 'confirmed' && (
              <button
                type="button"
                onClick={() => void checkPendingSession(pendingSessionId)}
                disabled={paymentState === 'checking'}
                className="mt-3 min-h-[44px] border border-[#B5AAA0] px-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#37332D] transition hover:border-[#141210] disabled:cursor-wait disabled:opacity-60"
              >
                {paymentState === 'checking'
                  ? 'Checking…'
                  : 'Check order status'}
              </button>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !postcard.available}
          className="mt-6 flex w-full items-center justify-center gap-3 bg-stone-900 px-6 py-4 text-xs font-medium uppercase tracking-[0.18em] text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Preparing secure checkout…' : 'Continue to secure payment'}
          {!busy && <span aria-hidden="true">↗</span>}
        </button>

        <p className="mt-3 text-center text-[11px] leading-relaxed text-stone-500">
          Payment is processed securely by Stripe. Your order is confirmed after
          payment.
        </p>
      </div>
    </form>
  );
}