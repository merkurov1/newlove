import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About Heart & Angel | A Living Digital Mythology',
  description: 'Learn about Heart & Angel, a living digital mythology of angels, devils, hearts, weather, temples and small rituals of love.',
  alternates: { canonical: 'https://www.merkurov.love/heartandangel/about' },
  openGraph: {
    title: 'About Heart & Angel | A Living Digital Mythology',
    description: 'A living digital mythology of angels, devils, hearts and rituals of love.',
    url: 'https://www.merkurov.love/heartandangel/about',
    siteName: 'Heart & Angel',
    type: 'article',
    images: [{
      url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/World.png',
      width: 1200,
      height: 630,
      alt: 'The Heart & Angel world',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About Heart & Angel',
    description: 'A living digital mythology of angels, devils, hearts and rituals of love.',
    images: ['https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/World.png'],
  },
};

const aboutJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CreativeWork',
  name: 'Heart & Angel',
  headline: 'A Living Digital Mythology',
  description: 'A transmedia digital world where angels, devils, hearts and small rituals help visitors explore love, attention and release.',
  creator: { '@type': 'Person', name: 'Anton Merkurov' },
  url: 'https://www.merkurov.love/heartandangel/about',
};

export default function HeartAndAngelAboutPage() {
  return (
    <main className="min-h-screen bg-[#FAF8F5] px-5 pb-20 pt-32 text-stone-900 sm:px-8 sm:pt-40">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutJsonLd) }} />
      <article className="mx-auto max-w-3xl rounded-[2rem] border border-stone-200/80 bg-white/80 p-7 shadow-sm backdrop-blur-md sm:p-14">
        <Link href="/heartandangel" className="font-mono text-xs uppercase tracking-[.18em] text-stone-500 transition hover:text-stone-900">← Back to Heart &amp; Angel</Link>
        <p className="mt-12 font-mono text-xs uppercase tracking-[.24em] text-stone-400">The living world</p>
        <h1 className="mt-4 font-serif text-4xl font-light tracking-wide sm:text-6xl">Heart &amp; Angel</h1>
        <p className="mt-5 font-serif text-xl leading-relaxed text-stone-600 sm:text-2xl">A small universe for the things that are difficult to say out loud.</p>

        <div className="mt-12 space-y-8 font-serif text-lg leading-relaxed text-stone-700 sm:text-xl">
          <p>
            Heart &amp; Angel is a living digital mythology about love, attention and the choices we make when no one is watching. It is an artwork, a world and an invitation to take part.
          </p>
          <p>
            In this world, the Angel and the Devil are not opposites and they are not binary. They share the same qualities, the same abilities and the same right to exist. One may wave its wings; the other may move its tail. Their forms are different, but neither one is wholly good or wholly bad. They are companions in the same inner landscape.
          </p>
          <p>
            At the centre is the heart. Sometimes it is shaped like a balloon, sometimes it simply appears as a heart. It is the symbol of love that the characters can touch, carry, release and protect. The heart is not a trophy. It is a living relationship.
          </p>
          <p>
            The clearing changes with the world around it. Weather and time of day shape the light, the colour and the feeling of the place. Dawn, rain, heat and night are part of the story. The landscape is never entirely still because a living world should be allowed to breathe.
          </p>
          <p>
            The little house and the tree are more than scenery. Together they point towards the Temple: a place where attention becomes an action. Inside are small rituals for ordinary human states — love and release, calming down, lighting a candle, remembering, giving thanks and making space for what comes next.
          </p>
          <p>
            Every visitor leaves something behind. A gesture, a pause, a spark, a released burden or a quiet moment of care becomes part of the shared history of the Temple. The world is shaped by the people who enter it.
          </p>
          <p>
            The next chapter is to make this universe more alive and more inhabited: more characters, more rituals, more traces of presence and more ways for the landscape to respond. Heart &amp; Angel is still becoming.
          </p>
          <p className="font-serif text-2xl italic text-stone-900 sm:text-3xl">
            You are welcome here.
          </p>
        </div>

        <nav aria-label="Heart and Angel destinations" className="mt-12 flex flex-wrap gap-3 border-t border-stone-200 pt-8">
          <Link href="/heartandangel/world" className="rounded-full bg-stone-900 px-5 py-3 font-mono text-xs uppercase tracking-widest text-white transition hover:bg-stone-700">Enter the World</Link>
          <Link href="/heartandangel/calm" className="rounded-full border border-stone-300 px-5 py-3 font-mono text-xs uppercase tracking-widest text-stone-700 transition hover:border-stone-900">Keep Calm</Link>
          <Link href="/heartandangel/letitgo" className="rounded-full border border-stone-300 px-5 py-3 font-mono text-xs uppercase tracking-widest text-stone-700 transition hover:border-stone-900">Let It Go</Link>
        </nav>
      </article>
    </main>
  );
}
