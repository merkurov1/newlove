import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'The Private Office // Anton Merkurov',
  description: 'Heritage Architecture for the Post-Digital Age. Art Advisory, Legacy Structures, and Digital Sovereignty.',
  openGraph: {
    title: 'The Private Office // Anton Merkurov',
    description: 'I offer silence in a noisy world. Exclusive art advisory and digital legacy management.',
    url: 'https://merkurov.love/advising',
    siteName: 'Merkurov.Love',
    locale: 'en_US',
    type: 'website',
  },
}

export default function AdvisingPage() {
  return (
    <main className="min-h-screen bg-[#FDFBF7] text-[#111] font-sans selection:bg-black selection:text-white">
      
      {/* DECORATIVE BORDER TOP */}
      <div className="h-1 w-full bg-black fixed top-0 z-50"></div>

      <div className="max-w-3xl mx-auto px-6 py-20 md:py-32">
        
        {/* 1. HEADER: STATUS & IDENTITY */}
        <header className="mb-16 border-b border-gray-200 pb-8">
          <div className="flex justify-between items-center mb-6">
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-gray-400">
              Merkurov Private Office
            </span>
            <span className="font-mono text-[10px] tracking-widest uppercase text-green-600 border border-green-600 px-2 py-1 rounded-full animate-pulse">
              System Online
            </span>
          </div>
          <h1 className="text-5xl md:text-7xl font-serif font-medium leading-none tracking-tight mb-6">
            The Private<br />Office.
          </h1>
          <p className="text-xl md:text-2xl font-serif italic text-gray-600">
            Heritage Architecture for the Post-Digital Age.
          </p>
        </header>

        {/* 2. MANIFESTO */}
        <section className="mb-20 prose prose-lg prose-stone">
          <p className="text-lg leading-relaxed mb-6">
            The art world is full of noise. Galleries sell inventory. Algorithms manipulate taste. Auctions are theatre.
          </p>
          <p className="text-2xl font-serif italic border-l-2 border-black pl-6 my-8">
            I offer silence.
          </p>
          <p className="text-lg leading-relaxed mb-8">
            I do not just "buy art" for you. I build <strong>Legacy Structures</strong> for individuals who plan in decades, not quarters.
            My approach fuses two worlds: the <strong>Granite</strong> of the 20th century (Classical Heritage) and the <strong>Ether</strong> of the 21st (Digital Assets & Archives).
          </p>
        </section>

        {/* 3. THE EVIDENCE (LINK TO FONTANA) - NEW BLOCK */}
        <section className="mb-20">
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-gray-400 mb-6">
                Capability Demonstration
            </h3>
            
            <Link href="/case-study/fontana" className="group block">
                <div className="border border-gray-300 bg-white p-6 hover:border-black hover:shadow-2xl transition-all duration-500 relative overflow-hidden">
                    <div className="absolute top-0 right-0 bg-black text-white text-[9px] font-mono px-2 py-1 uppercase">
                        Declassified Sample
                    </div>
                    <div className="flex items-start justify-between mb-4">
                        <div>
                            <h4 className="text-xl font-serif font-bold group-hover:text-red-600 transition-colors">
                                Case Study: The White Absolute
                            </h4>
                            <p className="text-sm text-gray-500 font-mono mt-1">
                                Asset: Lucio Fontana (1968) // Valuation & Arbitrage
                            </p>
                        </div>
                        <span className="text-2xl group-hover:translate-x-2 transition-transform duration-300">→</span>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed max-w-lg">
                        See how the Curator Engine analyzes liquidity, risk, and market arbitrage for institutional-grade assets. 
                        This is the level of depth I bring to every acquisition.
                    </p>
                </div>
            </Link>
        </section>

        {/* 4. SERVICES */}
        <section className="mb-20">
          <h2 className="text-3xl font-serif font-light mb-12 border-b border-gray-200 pb-4">
            The Protocol
          </h2>
          
          <div className="space-y-12">
            <div className="group">
                <h3 className="text-lg font-bold uppercase tracking-wide mb-2 group-hover:text-gray-600 transition-colors">
                    01. The Audit (Digital Hygiene)
                </h3>
                <p className="text-gray-600 leading-relaxed">
                    You are vulnerable. I clean your digital footprint, remove the noise, and secure your perimeter. 
                    Before we build, we must clear the ground.
                </p>
            </div>
            
            <div className="group">
                <h3 className="text-lg font-bold uppercase tracking-wide mb-2 group-hover:text-gray-600 transition-colors">
                    02. The Acquisition (Selection)
                </h3>
                <p className="text-gray-600 leading-relaxed">
                    Curating assets that survive entropy. From post-war modernism to the algorithmic avant-garde. 
                    No fillers. Only signals.
                </p>
            </div>

            <div className="group">
                <h3 className="text-lg font-bold uppercase tracking-wide mb-2 group-hover:text-gray-600 transition-colors">
                    03. The Archive (Immortality)
                </h3>
                <p className="text-gray-600 leading-relaxed">
                    Building your personal Digital Vatican. A system to preserve your collection, your name, 
                    and your intent forever. Data is the new marble.
                </p>
            </div>
          </div>
        </section>

        {/* 5. THE RULES & STATUS */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-24 border-t border-gray-200 pt-12">
            <div>
                <h2 className="font-mono text-xs font-bold uppercase tracking-widest mb-6">The Rules</h2>
                <ul className="space-y-3 font-serif italic text-lg text-gray-700">
                    <li>— No public portfolio.</li>
                    <li>— No social media hype.</li>
                    <li>— Only direct access.</li>
                </ul>
            </div>
            <div>
                <h2 className="font-mono text-xs font-bold uppercase tracking-widest mb-6">Current Status</h2>
                <div className="bg-gray-100 p-6 text-center">
                    <p className="font-mono text-sm text-gray-500 mb-2">AVAILABILITY 2025</p>
                    <p className="text-2xl font-bold text-blue-600 animate-pulse">[ 1 SLOT OPEN ]</p>
                </div>
            </div>
        </section>

        {/* 6. CTA */}
        <div className="text-center">
          <a
            href="mailto:merkurov@gmail.com"
            className="inline-block border-b-2 border-black pb-1 text-2xl md:text-3xl font-serif italic hover:text-red-600 hover:border-red-600 transition-all duration-300"
          >
            Start a conversation →
          </a>
          <p className="mt-6 font-mono text-[10px] text-gray-400 uppercase tracking-widest">
            Response time: Within 24 hours
          </p>
        </div>

      </div>
    </main>
  )
}