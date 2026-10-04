import { sanitizeMetadata } from '@/lib/metadataSanitize';
import HeroMotion from '@/components/advising/HeroMotion';
import CenteredHeader from '@/components/CenteredHeader';
import CaseStudyCard from '@/components/advising/CaseStudyCard';
import Header from '@/components/Header';

export const metadata = sanitizeMetadata({
  title: 'Love is a Key for All | Anton Merkurov',
  description: 'Anton Merkurov: Artist. Digital Architect. Humanist. Operating at the intersection of legacy and future.',
  alternates: {
    canonical: 'https://www.merkurov.love/isakeyforall',
  },
  openGraph: {
    title: 'Love is a Key for All | Anton Merkurov',
    description: 'Anton Merkurov: Artist. Digital Architect. Humanist. Operating at the intersection of legacy and future.',
    url: 'https://www.merkurov.love/isakeyforall',
    siteName: 'Anton Merkurov',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Love is a Key for All | Anton Merkurov',
    description: 'Anton Merkurov: Artist. Digital Architect. Humanist. Operating at the intersection of legacy and future.',
    creator: '@merkurov',
    site: '@merkurov',
  },
});

export default function IsAKeyForAllPage() {
  return (
    <main className="min-h-screen bg-[#FAF8F5] text-[#111] font-sans selection:bg-black selection:text-white relative overflow-x-hidden">
      
      {/* HEADER */}
      <Header />

      <div className="max-w-3xl mx-auto px-6 pt-36 md:pt-44 pb-24">
        
        {/* Header: The Monument (motion) */}
        <CenteredHeader>
          <HeroMotion
            title={<><span>Love is a</span><br/>key for all.</>}
            subtitle={<>Artist. Digital Architect. Humanist.</>}
          />
        </CenteredHeader>

        {/* Content: The Narrative */}
        <article className="prose prose-lg prose-stone prose-p:font-light prose-p:leading-relaxed prose-headings:font-serif max-w-none">
          <div className="space-y-8 text-lg leading-relaxed text-[#111]">
            <p className="first-letter:text-5xl first-letter:font-serif first-letter:font-bold first-letter:float-left first-letter:mr-3 first-letter:mt-[-8px]">
              Anton Merkurov is a media expert, publicist, artist, and art dealer. 
              As the great-grandson of the monumental sculptor Sergey Merkurov, he grew up in Moscow 
              during the late Soviet era and the 1990s, later dividing his life between London and Moscow.
            </p>

            <p>
              While immersed in the artistic community from childhood, Merkurov initially chose a path 
              in technology and new media. Over two decades, he established himself as one of the most 
              prominent digital consultants and internet experts in Russia—co-founding early IT companies 
              in the late 90s, working as a photographer through the transition from film to digital, 
              advising corporations, lecturing at universities, and advocating for policy change.
            </p>

            <p>
              Alongside his career in communications, Merkurov has continuously engaged with his family’s 
              profound cultural heritage—developing the Sergey Merkurov Museum in Gyumri, Armenia, 
              publishing family letters and memoirs, and organizing exhibitions featuring archival works, 
              including an NFT drop of the historic mask of Lenin sculpted by his great-grandfather.
            </p>

            <blockquote className="border-l-2 border-black pl-8 my-12 py-2 bg-white/50 p-6 rounded-r-2xl">
              <p className="text-2xl sm:text-3xl font-serif italic text-black leading-tight">
                "Love is life and the key to everything. Love is necessary. And love is the one thing there is never enough of."
              </p>
            </blockquote>

            <p>
              In 2015, at the age of 33, this philosophy crystallized into his ongoing multidisciplinary 
              art project, <strong className="font-semibold text-black">Heart & Angel</strong>, beginning with simple hearts drawn in a naive art technique. 
              Over the years, Merkurov has refined this vision into a distinct artistic statement spanning 
              physical paintings, digital art, and dynamic web components.
            </p>

            {/* Core Manifesto Box */}
            <div className="bg-white/70 border border-stone-200 p-8 rounded-2xl my-12 space-y-4 shadow-sm">
              <h4 className="font-serif text-xl font-bold text-black mb-4">Love is a Key for All</h4>
              <ul className="space-y-3 text-stone-800 font-light list-none pl-0">
                <li className="flex items-start gap-3">
                  <span className="text-black font-bold">•</span>
                  <span><strong>Love is necessary. Love is never enough. Love is a key for all.</strong> I want to multiply love as a social profit to provide tangible benefits around the world.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-black font-bold">•</span>
                  <span><strong>Everything starts with a symbol.</strong> A heart is the universal symbol of love that everyone understands, transcending social burdens and uniting us across borders.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-black font-bold">•</span>
                  <span><strong>Every piece is unique</strong> — by type, size, medium, or material — bridging both offline and online worlds.</span>
                </li>
              </ul>
              <div className="pt-4 border-t border-stone-100 italic text-stone-600 text-base">
                "I have spent more than 20 years in media, running new media and promoting new technology. But why do you need this if you don’t have love?"
              </div>
            </div>

            <p>
              Today, while continuing to work with decentralized communications, Merkurov has fully 
              embraced the opportunity to create as an artist—telling the world that love and 
              humanity are the most important things in existence.
            </p>
          </div>

          {/* FEATURED: UNFRAMED & RESEARCH */}
          <section className="mb-12 mt-16">
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-gray-400 mb-6">
              Featured Work
            </h3>

            <CaseStudyCard
              href="/unframed"
              badge="Memoir"
              title={<>UNFRAMED — Memoir by Anton Merkurov</>}
              subtitle={<>A nonlinear recollection of art, exile, and the small violences of modern life.</>}
              layoutId="case-unframed"
            />
            <div className="mt-6">
              <CaseStudyCard
                href="/research"
                badge="Research"
                title={<>The Digital Decay: A Chronicle of Voluntary Submission.</>}
                subtitle={<>Long-form research, essays and archival notes by Anton Merkurov.</>}
                layoutId="case-research"
              />
            </div>
          </section>
        </article>
      </div>
    </main>
  );
}
