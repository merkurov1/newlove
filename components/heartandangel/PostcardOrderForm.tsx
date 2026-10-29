'use client';

import { FormEvent, useState } from 'react';

type Postcard = {
  id: string;
  title: string;
  description?: string | null;
  image: string;
  price: number;
  available: boolean;
  featured?: boolean;
};

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

  const update = (key: keyof OrderFields, value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
  };

  const formatPrice = (minorUnits: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
    }).format(minorUnits / 100);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

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

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Could not create the order.');
      }

      if (!result.paymentUrl) {
        throw new Error('Stripe did not return a payment link.');
      }

      window.location.assign(result.paymentUrl);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Something went wrong. Please try again.',
      );
      setLoading(false);
    }
  }

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

        <button
          type="submit"
          disabled={loading || !postcard.available}
          className="mt-6 flex w-full items-center justify-center gap-3 bg-stone-900 px-6 py-4 text-xs font-medium uppercase tracking-[0.18em] text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Preparing secure checkout…' : 'Continue to secure payment'}
          {!loading && <span aria-hidden="true">↗</span>}
        </button>

        <p className="mt-3 text-center text-[11px] leading-relaxed text-stone-500">
          Payment is processed securely by Stripe. Your order is confirmed after
          payment.
        </p>
      </div>
    </form>
  );
}