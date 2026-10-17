'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Newsreader, Manrope } from 'next/font/google';
import PostcardOrderForm from '@/components/heartandangel/PostcardOrderForm';

const serif = Newsreader({
  subsets: ['latin'],
  weight: ['300', '400'],
  style: ['normal', 'italic'],
  display: 'swap',
});

const sans = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

type Postcard = {
  id: string;
  title: string;
  description: string | null;
  image: string;
  price: number;
  available: boolean;
  featured: boolean;
};

const STORAGE = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/artifacts/Postcard';
const ANGEL_GIF = `${STORAGE}/IMG_0425.gif`;
const CARD_IMAGE = `${STORAGE}/IMG_1508.jpeg`;

const label = 'text-xs font-semibold uppercase tracking-[0.2em]';

export default function CardPageClient() {
  const [postcard, setPostcard] = useState<Postcard | null>(null);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadPostcard() {
      try {
        const response = await fetch('/api/postcards', { cache: 'no-store' });

        if (!response.ok) {
          throw new Error('The postcard catalogue is temporarily unavailable.');
        }

        const data = await response.json();
        const postcards: Postcard[] = data.postcards || [];
        const selected =
          postcards.find((item) => item.id === 'postcard_1' && item.available) ||
          postcards.find((item) => item.featured && item.available) ||
          postcards.find((item) => item.available);

        if (!selected) {
          throw new Error('The postcard is currently unavailable.');
        }

        if (active) setPostcard(selected);
      } catch (error) {
        if (active) {
          setCatalogError(
            error instanceof Error ? error.message : 'Unable to load the postcard.',
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
    <main
      className={`${sans.className} min-h-screen overflow-x-hidden bg-[#FAF8F5] text-[#141210] selection:bg-black selection:text-white`}
    >
      <header className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-6 py-5 md:px-10">
        <Link
          href="/heartandangel"
          className="py-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-600 transition hover:text-black"
        >
          ← Heart &amp; Angel
        </Link>
        <span className="hidden text-xs uppercase tracking-[0.18em] text-stone-400 sm:inline">
          An original artwork
        </span>
      </header>

      {/* ───────── Hero ───────── */}
      <section className="bg-[#A8402C] text-[#FAF8F5]">
        <div className="mx-auto grid max-w-[1440px] md:min-h-[640px] md:grid-cols-2">
          <div className="relative min-h-[360px] overflow-hidden bg-[#C4573F] sm:min-h-[520px]">
            <Image
              src={ANGEL_GIF}
              alt="An angel sending a Heart & Angel postcard"
              fill
              unoptimized
              priority
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-contain p-6 sm:p-10"
            />
          </div>

          <div className="flex flex-col items-start justify-center px-7 py-14 sm:px-12 md:px-20 md:py-24">
            <p className={`${label} opacity-85`}>Heart &amp; Angel · Postcard</p>

            <h1 className={`${serif.className} mt-5 max-w-lg text-5xl font-light leading-[1.05] md:text-7xl`}>
              Some things are better sent by hand.
            </h1>

            <p className={`${serif.className} mt-6 max-w-md text-lg font-light leading-[1.5] md:text-[22px]`}>
              An original Heart &amp; Angel artwork, turned into a physical postcard. Write a personal message and send
              a small piece of love directly to someone who matters to you.
            </p>

            <p className="mt-7 flex items-baseline gap-3">
              <span className={`${serif.className} text-4xl font-light`}>£29</span>
              <span className="text-xs font-medium uppercase tracking-[0.14em] opacity-85">Postage included</span>
            </p>

            <a
              href="#order"
              className="mt-8 inline-flex items-center gap-3 rounded-full bg-[#FAF8F5] px-9 py-5 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#141210] transition hover:bg-white"
            >
              Send a postcard <span aria-hidden="true">↓</span>
            </a>

            <p className="mt-5 max-w-sm text-xs leading-relaxed opacity-80">
              A physical postcard, sent to the recipient’s address. Add your message in the order form below. Secure
              payment is handled by Stripe.
            </p>
          </div>
        </div>
      </section>

      {/* ───────── Physical object ───────── */}
      <section className="px-6 py-24 md:py-36">
        <div className="mx-auto grid max-w-[1200px] items-center gap-10 md:grid-cols-[1fr_1.1fr] md:gap-20">
          <div>
            <p className={`${label} text-[#8A8176]`}>The physical object</p>
            <h2 className={`${serif.className} mt-5 text-4xl font-light leading-[1.1] md:text-5xl`}>
              A work of art that travels.
            </h2>
            <p className={`${serif.className} mt-6 max-w-lg text-lg font-light leading-[1.6] text-[#5B544C] md:text-xl`}>
              Heart &amp; Angel begins with a simple idea: love is something we do, not just something we feel. A
              postcard makes that idea tangible — an image, a message, and a real address.
            </p>
          </div>

          <div className="relative min-h-[360px] w-full bg-[#E7E1D7] sm:min-h-[560px]">
            <Image
              src={CARD_IMAGE}
              alt="A physical Heart & Angel postcard, photographed as a real object"
              fill
              sizes="(max-width: 768px) 100vw, 600px"
              className="object-contain p-4 sm:p-8"
            />
          </div>
        </div>
      </section>

      {/* ───────── Order ───────── */}
      <section id="order" className="scroll-mt-6 border-t border-[#D9D2C7] px-6 py-24 md:py-32">
        <div className="mx-auto max-w-2xl">
          <p className={`${label} text-[#8A8176]`}>Make it personal</p>
          <h2 className={`${serif.className} mt-5 text-4xl font-light leading-[1.1] md:text-5xl`}>
            Where should it go?
          </h2>
          <p className={`${serif.className} mt-5 text-lg font-light leading-[1.6] text-[#5B544C] md:text-xl`}>
            Enter the recipient’s delivery details and the message you would like to send. The total is £29, including
            postage.
          </p>

          <div className="mt-10 border-t border-[#D9D2C7] pt-8">
            {loading ? (
              <div className="space-y-4" aria-busy="true" aria-live="polite">
                <div className="h-12 animate-pulse bg-[#E7E1D7]" />
                <div className="h-12 animate-pulse bg-[#E7E1D7]" />
                <div className="h-32 animate-pulse bg-[#E7E1D7]" />
                <span className="sr-only">Loading the postcard…</span>
              </div>
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

      <footer className="bg-[#141210] px-6 py-10 text-center text-[#FAF8F5]">
        <Link
          href="/heartandangel"
          className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80 transition hover:opacity-100"
        >
          Heart &amp; Angel
        </Link>
      </footer>
    </main>
  );
}
