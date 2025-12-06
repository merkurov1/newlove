import { sanitizeMetadata } from '@/lib/metadataSanitize';
import Link from 'next/link'

export const metadata = sanitizeMetadata({
  title: 'Love is a Key for All | Anton Merkurov',
  description: 'Anton Merkurov: Artist. Digital Architect. Humanist. Operating at the intersection of legacy and future.',
});

export default function IsAKeyForAllPage() {
  return (
    <main className="min-h-screen bg-[#FDFBF7] text-[#111] font-sans selection:bg-black selection:text-white">
      
      {/* DECORATIVE BORDER TOP */}
      <div className="h-1 w-full bg-black fixed top-0 z-50"></div>

      <div className="max-w-3xl mx-auto px-6 py-20 md:py-32">
        
        {/* Header: The Monument */}
        <header className="mb-16 border-b border-gray-200 pb-8">
           <div className="flex justify-between items-center mb-6">
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-gray-400">
              Identity Protocol
            </span>
            <span className="font-mono text-[10px] tracking-widest uppercase text-gray-400">
               Est. 19XX
            </span>
          </div>
          <h1 
            className="text-5xl md:text-7xl font-serif font-medium leading-none tracking-tight mb-8"
            style={{ fontFamily: 'Playfair Display, Cormorant Garamond, serif' }}
          >
            Love is a<br/>key for all.
          </h1>
          <div className="flex flex-col gap-2">
            <p className="font-mono text-xs font-bold tracking-[0.2em] uppercase text-black">
              Anton Merkurov
            </p>
            <p className="text-xl font-serif italic text-gray-600">
              Artist. Digital Architect. Humanist.
            </p>
          </div>
        </header>

        {/* Content: The Narrative */}
        <article className="prose prose-lg prose-stone prose-p:font-light prose-p:leading-relaxed prose-headings:font-serif max-w-none">
          <div className="space-y-8 text-lg leading-relaxed text-[#111]">
            <p className="first-letter:text-5xl first-letter:font-serif first-letter:font-bold first-letter:float-left first-letter:mr-3 first-letter:mt-[-8px]">
              Anton Merkurov is an artist operating at the intersection of legacy and future. 
              A descendant of the monumental sculptor Sergey Merkurov, Anton spent two decades 
              mastering the digital realm—from the early days of the runet to the complexities 
              of Web3 and decentralized communications.
            </p>

            <p>
              His career has been a relentless pursuit of the "new"—founding tech startups in 
              the 90s, advising corporations, and bridging the gap between East and West in 
              London's intellectual circles. He has curated the physical legacy of his family 
              (The Sergey Merkurov Museum) while simultaneously pioneering the digital one 
              (NFTs, media analysis).
            </p>

            <p>
              However, the turbulence of recent history led to a radical shift. Realizing that 
              digital complexity cannot save us from existential voids, Merkurov turned to 
              radical simplicity.
            </p>

            <blockquote className="border-l-2 border-black pl-8 my-12 py-2 bg-white/50 p-6">
              <p className="text-2xl sm:text-3xl font-serif italic text-black leading-tight">
                "Why do you need technology if you don't have love?"
              </p>
            </blockquote>

            <p>
              Since 2015, Merkurov has been developing his own artistic language. His work is 
              a rejection of cynicism. Using simple symbols—the Heart, the Angel—he bypasses 
              the noise of modern media to speak directly to the viewer.
            </p>

            <p>
              Merkurov's art is not just decoration; it is a utility. It is an attempt to 
              distribute emotional capital in a bankrupt world. Whether through canvas or code, 
              his message is singular and absolute:
            </p>
          </div>

          {/* FEATURED: UNFRAMED (styled like advising use-cases) */}
          <section className="mb-12">
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-gray-400 mb-6">
              Featured Work
            </h3>

            <Link href="/unframed" className="group block">
              <div className="border border-gray-300 bg-white p-6 hover:border-black hover:shadow-2xl transition-all duration-500 relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-black text-white text-[9px] font-mono px-2 py-1 uppercase">
                  Memoir
                </div>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h4 className="text-xl font-serif font-bold group-hover:text-red-600 transition-colors">
                      UNFRAMED — Memoir by Anton Merkurov
                    </h4>
                    <p className="text-sm text-gray-500 font-mono mt-1">
                      A nonlinear recollection of art, exile, and the small violences of modern life.
                    </p>
                  </div>
                  <span className="text-2xl group-hover:translate-x-2 transition-transform duration-300">→</span>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed max-w-lg">
                  Read the memoir-styled presentation — a quiet, contemplative piece that folds memory into design.
                </p>
              </div>
            </Link>
          </section>

          {/* Footer: The Seal */}
          <div className="mt-16 pt-12 border-t border-gray-200 text-center">
            <p 
              className="text-3xl sm:text-4xl font-serif font-bold text-black"
              style={{ fontFamily: 'Playfair Display, Cormorant Garamond, serif' }}
            >
              Love is a key for all.
            </p>
          </div>
        </article>
      </div>
    </main>
  );
}