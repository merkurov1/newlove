'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PostcardOrderForm from '@/components/heartandangel/PostcardOrderForm';

type Postcard = {
  id: string;
  title: string;
  description: string | null;
  image: string;
  price: number;
  available: boolean;
  featured: boolean;
};

const ANGEL_GIF =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/artifacts/Postcard/IMG_0425.gif';

const CARD_IMAGE =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/artifacts/Postcard/IMG_1508.jpeg';

export default function HeartAndAngelCardPage() {
  const [postcard, setPostcard] = useState<Postcard | null>(null);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadPostcard() {
      try {
        const response = await fetch('/api/postcards', {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error('The postcard catalogue is temporarily unavailable.');
        }

        const data = await response.json();
        const postcards: Postcard[] = data.postcards || [];
        const selected = postcards.find(
          (item) => item.id === 'postcard_1' && item.available,
        ) || postcards.find((item) => item.featured && item.available)
          || postcards.find((item) => item.available);

        if (!selected) {
          throw new Error('The postcard is currently unavailable.');
        }

        if (active) setPostcard(selected);
      } catch (error) {
        if (active) {
          setCatalogError(
            error instanceof Error
              ? error.message
              : 'Unable to load the postcard.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadPostcard();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#FAF8F5] text-stone-900">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <Link
          href="/heartandangel"
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-stone-600 transition hover:text-black"
        >
          ← Heart &amp; Angel
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-stone-400">
          An original artwork
        </span>
      </header>

      <section className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-5 pb-16 pt-4 sm:px-8 sm:pb-24 md:grid-cols-2 md:gap-16">
        <div className="relative flex min-h-[360px] items-center justify-center overflow-hidden bg-[#EAE4DA] sm:min-h-[540px]">
          <img
            src={ANGEL_GIF}
            alt="An angel sending a Heart & Angel postcard"
            className="absolute inset-0 h-full w-full object-contain p-4 sm:p-8"
          />
        </div>

        <div className="py-3 sm:py-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-stone-500">
            Heart &amp; Angel · Postcard
          </p>

          <h1 className="mt-5 max-w-lg font-serif text-4xl font-light leading-[1.08] tracking-tight sm:text-6xl">
            Some things are better sent by hand.
          </h1>

          <p className="mt-6 max-w-lg font-serif text-lg leading-relaxed text-stone-600 sm:text-xl">
            An original Heart &amp; Angel artwork, turned into a physical
            postcard. Write a personal message and send a small piece of love
            directly to someone who matters to you.
          </p>

          <div className="mt-8 flex items-baseline gap-3">
            <span className="font-serif text-3xl">£29</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500">
              Postage included
            </span>
          </div>

          <a
            href="#order"
            className="mt-7 inline-flex items-center gap-3 bg-stone-900 px-7 py-4 text-xs font-medium uppercase tracking-[0.16em] text-white transition hover:bg-stone-700"
          >
            Send a postcard <span aria-hidden="true">↘</span>
          </a>

          <p className="mt-4 max-w-sm text-xs leading-relaxed text-stone-500">
            A physical postcard, sent to the recipient’s address. Add your
            message in the order form below. Secure payment is handled by Stripe.
          </p>
        </div>
      </section>

      <section className="border-y border-stone-200 bg-white/70">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 py-12 sm:px-8 sm:py-16 md:grid-cols-2 md:items-center md:gap-16">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500">
              The physical object
            </p>
            <h2 className="mt-4 font-serif text-3xl font-light sm:text-4xl">
              A work of art that travels.
            </h2>
            <p className="mt-5 max-w-lg font-serif text-base leading-relaxed text-stone-600">
              Heart &amp; Angel begins with a simple idea: love is something we
              do, not just something we feel. A postcard makes that idea
              tangible — an image, a message, and a real address.
            </p>
          </div>

          <div className="bg-[#F1ECE5] p-4 sm:p-6">
            <img
              src={CARD_IMAGE}
              alt="A physical Heart & Angel postcard, photographed as a real object"
              className="mx-auto block max-h-[620px] w-full object-contain"
            />
          </div>
        </div>
      </section>

      <section id="order" className="mx-auto max-w-4xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-2xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500">
            Make it personal
          </p>
          <h2 className="mt-4 font-serif text-3xl font-light sm:text-4xl">
            Where should it go?
          </h2>
          <p className="mt-4 font-serif leading-relaxed text-stone-600">
            Enter the recipient’s delivery details and the message you would
            like to send. The total is £29, including postage.
          </p>

          <div className="mt-10 border-t border-stone-200 pt-8">
            {loading ? (
              <p className="text-sm text-stone-500">Loading the postcard…</p>
            ) : catalogError ? (
              <p role="alert" className="text-sm text-red-700">
                {catalogError}
              </p>
            ) : postcard ? (
              <PostcardOrderForm postcard={postcard} />
            ) : null}
          </div>
        </div>
      </section>

      <footer className="border-t border-stone-200 px-5 py-8 text-center">
        <Link
          href="/heartandangel"
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-stone-500 hover:text-stone-900"
        >
          Heart &amp; Angel
        </Link>
      </footer>
    </main>
  );
}