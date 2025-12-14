import type { Metadata } from 'next'
import Link from 'next/link'
import HeroMotion from '@/components/advising/HeroMotion'
import CenteredHeader from '@/components/CenteredHeader'
import CaseStudyCard from '@/components/advising/CaseStudyCard'

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
        <CenteredHeader>
          <HeroMotion
            title={(<><span>The Private</span><br />Office.</>)}
            subtitle={<>Heritage Architecture for the Post-Digital Age.</>}
            status="System Online"
          />
        </CenteredHeader>

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
            
            <CaseStudyCard
              href="/case-study/fontana"
              badge="Declassified Sample"
              title={<>Case Study: The White Absolute</>}
              subtitle={<>Asset: Lucio Fontana (1968) // Valuation & Arbitrage</>}
              layoutId="case-fontana"
            />
            
            {/* Garcia Case Study (added) */}
            <div className="mt-6">
              <CaseStudyCard
                href="/case-study/garcia"
                badge="Case Study"
                title={<>Case Study: The Anatomy of Quietude</>}
                subtitle={<>Asset: Aimée García (1995) // Provenance & Acquisition</>}
                layoutId="case-garcia"
              />
            </div>
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

        {/* 5. THE RULES */}
        <section className="mb-24 border-t border-gray-200 pt-12">
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest mb-6">The Rules</h2>
          <p className="font-serif italic text-lg text-gray-700">
            — No public portfolio. — No social media hype. — Only direct access.
          </p>
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