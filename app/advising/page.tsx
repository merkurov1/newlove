import type { Metadata } from 'next'
import Link from 'next/link'
import CaseStudyCard from '@/components/advising/CaseStudyCard'
import { ArrowUpRight } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Advising // Anton Merkurov',
  description: 'Heritage Architecture for the Post-Digital Age. Private art advisory and digital legacy management.',
  openGraph: {
    title: 'Advising // Anton Merkurov',
    description: 'Exclusive art advisory, legacy structures, and digital archives.',
    url: 'https://merkurov.love/advising',
    siteName: 'Merkurov.Love',
    locale: 'en_US',
    type: 'website',
  },
}

export default function AdvisingPage() {
  return (
    <main className="min-h-screen bg-[#FAF8F5] text-[#111111] font-sans selection:bg-[#111111] selection:text-[#FAF8F5] relative overflow-hidden antialiased">
      
      {/* Paper Grain Overlay */}
      <div 
        className="fixed inset-0 pointer-events-none z-40 opacity-[0.025] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="max-w-3xl mx-auto px-6 pt-32 md:pt-40 pb-20 relative z-10">
        
        {/* TITLE BLOCK */}
        <div className="mb-16 text-center">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-400 block mb-4">
            Advising
          </span>
          <h1 className="text-4xl md:text-6xl font-serif font-normal tracking-tight text-[#111111] mb-4">
            The Private Office.
          </h1>
          <p className="font-serif italic text-lg text-zinc-500">
            Heritage Architecture for the Post-Digital Age.
          </p>
        </div>

        {/* MANIFESTO */}
        <section className="mb-20">
          <div className="space-y-6 text-lg md:text-xl text-zinc-800 leading-relaxed font-serif">
            <p>
              The art market is saturated with noise. Galleries push inventory, algorithms manipulate taste, and auction houses focus on theatre.
            </p>
            <div className="py-6 px-8 border-l border-zinc-900 bg-white/60 my-8 shadow-sm">
              <p className="text-2xl md:text-3xl font-serif italic text-[#111111] m-0">
                I offer silence and structural clarity.
              </p>
            </div>
            <p>
              I build legacy structures for individuals who calculate in decades. My practice bridges two worlds: the <strong>Granite</strong> of classical fine art heritage and the <strong>Ether</strong> of sovereign digital archives and post-digital assets.
            </p>
          </div>
        </section>

        {/* PRACTICE / SERVICES */}
        <section className="mb-24">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-400 mb-10 pb-3 border-b border-zinc-200">
            Practice
          </h2>
          
          <div className="space-y-12">
            
            <div className="group">
              <span className="font-mono text-[10px] text-zinc-400 block mb-2">01</span>
              <h3 className="text-2xl font-serif font-medium text-[#111111] mb-3">
                Signal &amp; Context
              </h3>
              <p className="text-base text-zinc-600 leading-relaxed font-serif">
                Independent analysis free from gallery bias. Filtering out market noise to establish a clear strategy before acquiring or structuring any asset.
              </p>
            </div>
            
            <div className="group">
              <span className="font-mono text-[10px] text-zinc-400 block mb-2">02</span>
              <h3 className="text-2xl font-serif font-medium text-[#111111] mb-3">
                Selection &amp; Sourcing
              </h3>
              <p className="text-base text-zinc-600 leading-relaxed font-serif">
                Direct access to museum-grade post-war modernism and high-signal contemporary work. Strategic private sourcing with verifiable provenance.
              </p>
            </div>

            <div className="group">
              <span className="font-mono text-[10px] text-zinc-400 block mb-2">03</span>
              <h3 className="text-2xl font-serif font-medium text-[#111111] mb-3">
                Heritage &amp; Digital Preservation
              </h3>
              <p className="text-base text-zinc-600 leading-relaxed font-serif">
                Building sovereign digital archives and cataloging systems for physical collections, personal histories, and long-term intent.
              </p>
            </div>

          </div>
        </section>

        {/* CASE STUDIES */}
        <section className="mb-24">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-400 mb-8 pb-3 border-b border-zinc-200">
            Selected Work
          </h2>
          
          <div className="space-y-6">
            <CaseStudyCard
              href="/case-study/fontana"
              badge="Arbitrage"
              title={<>The White Absolute</>}
              subtitle={<>Lucio Fontana (1968) // Valuation Discrepancy &amp; Analysis</>}
              layoutId="case-fontana"
            />
            
            <CaseStudyCard
              href="/case-study/garcia"
              badge="Provenance"
              title={<>The Anatomy of Quietude</>}
              subtitle={<>Aimée García (1995) // Strategic Private Acquisition</>}
              layoutId="case-garcia"
            />
          </div>
        </section>

        {/* DISCRETION STATEMENT */}
        <section className="mb-20 p-8 border border-zinc-200/80 bg-white/60 text-center">
          <p className="font-serif italic text-base md:text-lg text-zinc-700 m-0">
            No public client rosters. Direct, private consultation only.
          </p>
        </section>

        {/* CTA */}
        <div className="text-center py-8">
          <a
            href="mailto:merkurov@gmail.com"
            className="group inline-flex items-center gap-3 border-b border-zinc-900 pb-1 text-2xl md:text-3xl font-serif italic hover:text-zinc-500 hover:border-zinc-400 transition-all duration-300"
          >
            <span>Start a conversation</span>
            <ArrowUpRight size={22} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform duration-300 text-zinc-900 group-hover:text-zinc-500" />
          </a>
        </div>

      </div>
    </main>
  )
}
