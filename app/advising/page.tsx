import { sanitizeMetadata } from '@/lib/metadataSanitize';
import Link from 'next/link';
import CenteredHeader from '@/components/CenteredHeader';
import CaseStudyCard from '@/components/advising/CaseStudyCard';
import Header from '@/components/Header';

export const metadata = sanitizeMetadata({
  title: 'Love is a Key for All | Anton Merkurov',
  description: 'Anton Merkurov: Artist. Digital Architect. Humanist. Operating at the intersection of legacy and future.',
});

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#FAF8F5] text-[#111111] font-sans selection:bg-black selection:text-white relative overflow-x-hidden">
      
      {/* Header */}
      <Header />

      {/* Paper Grain Overlay */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-[0.025] mix-blend-overlay z-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="max-w-3xl mx-auto px-6 pt-36 md:pt-44 pb-24 relative z-20">
        
        {/* HEADER BLOCK */}
        <div className="mb-16 text-center">
          <span className="font-mono text-xs uppercase tracking-[0.3em] text-zinc-500 font-medium block mb-4">
            Identity Protocol
          </span>
          <h1 className="text-5xl md:text-7xl font-serif font-normal tracking-tight text-[#111111] mb-6">
            Love is a <br />
            <span className="italic text-zinc-600">key for all.</span>
          </h1>
          <p className="font-serif italic text-xl md:text-2xl text-zinc-600">
            Artist. Digital Architect. Humanist.
          </p>
        </div>

        {/* NARRATIVE ARTICLE */}
        <article className="prose prose-lg prose-stone prose-p:font-light prose-p:leading-relaxed prose-headings:font-serif max-w-none">
          <div className="space-y-8 text-lg leading-relaxed text-[#111111]">
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

            <blockquote className="border-l-2 border-black pl-8 my-12 py-2 bg-white/80 p-6 shadow-sm rounded-r-2xl">
              <p className="text-2xl sm:text-3xl font-serif italic text-black leading-tight">
                &ldquo;Why do you need technology if you don't have love?&rdquo;
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

          {/* FEATURED: UNFRAMED & RESEARCH */}
          <section className="mt-16 mb-12">
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 mb-6">
              Featured Work
            </h3>

            <div className="space-y-6">
              <CaseStudyCard
                href="/unframed"
                badge="Memoir"
                title={<>UNFRAMED — Memoir by Anton Merkurov</>}
                subtitle={<>A nonlinear recollection of art, exile, and the small violences of modern life.</>}
                layoutId="case-unframed"
              />
              <CaseStudyCard
                href="/research"
                badge="Research"
                title={<>The Digital Decay: A Chronicle of Voluntary Submission.</>}
                subtitle={<>Long-form research, essays and archival notes by Anton Merkurov.</>}
                layoutId="case-research"
              />
            </div>
          </section>

          {/* Footer Seal */}
          <div className="mt-16 pt-12 border-t border-zinc-200 text-center">
            <p className="text-3xl sm:text-4xl font-serif font-bold text-black italic">
              Love is a key for all.
            </p>
          </div>
        </article>

      </div>
    </main>
  );
}
