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
    <main className="min-h-screen bg-[#FAF8F5] text-[#111111] font-sans selection:bg-[#111111] selection:text-[#FAF8F5] antialiased">
      
      {/* Paper Grain Overlay */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-[0.025] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="max-w-3xl mx-auto px-6 pt-40 md:pt-48 pb-20">
        
        {/* TITLE BLOCK */}
        <div className="mb-16 text-center">
          <span className="font-mono text-xs uppercase tracking-[0.3em] text-zinc-500 font-medium block mb-4">
            Advising
          </span>
          <h1 className="text-5xl md:text-7xl font-serif font-normal tracking-tight text-[#111111] mb-6">
            The Private Office.
          </h1>
          <p className="font-serif italic text-xl md:text-2xl text-zinc-600">
            Heritage Architecture for the Post-Digital Age.
          </p>
        </div>

        {/* MANIFESTO */}
        <section className="mb-20">
          <div className="space-y-6 text-xl md:text-2xl text-zinc-800 leading-relaxed font-serif">
            <p>
              The art market is saturated with noise. Galleries push inventory, algorithms manipulate taste, and auction houses focus on theatre.
            </p>
            <div className="py-8 px-8 border-l-2 border-zinc-900 bg-white/80 my-10 shadow-sm">
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
          <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-zinc-500 font-medium mb-10 pb-3 border-b border-zinc-300">
            Practice
          </h2>
          
          <div className="space-y-12">
            
            <div className="group">
              <span className="font-mono text-xs text-zinc-500 font-semibold block mb-2">01</span>
              <h3 className="text-2xl md:text-3xl font-serif font-medium text-[#111111] mb-3">
                Signal &amp; Context
              </h3>
              <p className="text-lg text-zinc-700 leading-relaxed font-serif">
                Independent analysis free from gallery bias. Filtering out market noise to establish a clear strategy before acquiring or structuring any asset.
              </p>
            </div>
            
            <div className="group">
              <span className="font-mono text-xs text-zinc-500 font-semibold block mb-2">02</span>
              <h3 className="text-2xl md:text-3xl font-serif font-medium text-[#111111] mb-3">
                Selection &amp; Sourcing
              </h3>
              <p className="text-lg text-zinc-700 leading-relaxed font-serif">
                Direct access to museum-grade post-war modernism and high-signal contemporary work. Strategic private sourcing with verifiable provenance.
              </p>
            </div>

            <div className="group">
              <span className="font-mono text-xs text-zinc-500 font-semibold block mb-2">03</span>
              <h3 className="text-2xl md:text-3xl font-serif font-medium text-[#111111] mb-3">
                Heritage &amp; Digital Preservation
              </h3>
              <p className="text-lg text-zinc-700 leading-relaxed font-serif">
                Building sovereign digital archives and cataloging systems for physical collections, personal histories, and long-term intent.
              </p>
            </div>

          </div>
        </section>

        {/* CASE STUDIES */}
        <section className="mb-24">
          <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-zinc-500 font-medium mb-8 pb-3 border-b border-zinc-300">
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
        <section className="mb-20 p-8 md:p-10 border border-zinc-300 bg-white/80 text-center shadow-sm">
          <p className="font-serif italic text-lg md:text-xl text-zinc-800 m-0">
            No public client rosters. Direct, private consultation only.
          </p>
        </section>

        {/* CTA */}
        <div className="text-center py-8">
          <a
            href="mailto:merkurov@gmail.com"
            className="group inline-flex items-center gap-3 border-b-2 border-zinc-900 pb-1.5 text-2xl md:text-4xl font-serif italic hover:text-zinc-600 hover:border-zinc-500 transition-all duration-300"
          >
            <span>Start a conversation</span>
            <ArrowUpRight size={24} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform duration-300 text-zinc-900 group-hover:text-zinc-600" />
          </a>
        </div>

      </div>
    </main>
  )
}
