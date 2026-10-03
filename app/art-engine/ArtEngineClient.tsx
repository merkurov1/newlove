import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Art Engine // Intelligence Terminal — Anton Merkurov',
  description: 'Institutional-grade art acquisition, liquidity analysis, and curatorial dossier synthesis.',
  openGraph: {
    title: 'Art Engine // Intelligence Terminal — Anton Merkurov',
    description: 'Institutional-grade art acquisition, liquidity analysis, and curatorial dossier synthesis.',
    url: 'https://merkurov.love/art-engine',
    siteName: 'Anton Merkurov',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Art Engine // Intelligence Terminal — Anton Merkurov',
    description: 'Institutional-grade art acquisition, liquidity analysis, and curatorial dossier synthesis.',
  },
};

export default function ArtEnginePage() {
  return (
    <div className="min-h-screen bg-white text-black selection:bg-black selection:text-white font-sans antialiased">
      
      {/* 1. NAVIGATION */}
      <nav className="fixed top-0 left-0 w-full bg-white/95 backdrop-blur-md z-50 border-b border-gray-100 py-4 px-6 md:px-12 flex justify-between items-center transition-all duration-300">
        <a href="/" className="text-[10px] font-bold tracking-[0.25em] uppercase text-black hover:text-gray-600 transition-colors">Merkurov.Love</a>
        <div className="flex items-center space-x-6">
            <div className="hidden md:flex items-center space-x-2">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Intelligence Terminal</span>
            </div>
            <a 
              href="mailto:merkurov@gmail.com?subject=Inquiry: Art Engine Access"
              className="px-4 py-2 bg-black text-white text-[10px] font-mono uppercase tracking-widest hover:bg-gray-800 transition-colors duration-300"
            >
              Inquire
            </a>
        </div>
      </nav>

      {/* 2. HERO BANNER */}
      <section className="pt-32 pb-16 px-6 md:px-12 max-w-screen-2xl mx-auto text-center">
        <div className="space-y-4 max-w-3xl mx-auto">
          <span className="text-[10px] font-mono tracking-[0.3em] uppercase text-gray-400 font-semibold block">
            Institutional Art Advisory & Market Intelligence
          </span>
          <h1 className="text-5xl md:text-7xl font-serif font-light tracking-tight text-black">
            Art Intelligence Terminal
          </h1>
          <p className="font-serif italic text-gray-600 text-base md:text-lg max-w-xl mx-auto pt-2">
            Professional-grade terminal engineered for art dealers, family offices, and private banking art-lending specialists.
          </p>
        </div>
      </section>

      {/* 3. CASE STUDIES SECTION (FONTANA STYLE) */}
      <section className="py-20 bg-gray-50 border-y border-gray-200 px-6 md:px-12">
        <div className="max-w-screen-xl mx-auto space-y-16">
          <div className="text-center space-y-3">
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-gray-400 block">
              [ CURATOR ENGINE — INSTITUTIONAL CASE STUDIES ]
            </span>
            <h2 className="text-3xl md:text-4xl font-serif font-light">
              AI-Driven Art Valuation & Heritage Architecture
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            
            {/* Case 1: Fontana */}
            <div className="bg-white border border-gray-200 p-8 flex flex-col justify-between shadow-sm group">
              <div>
                <div className="aspect-[4/3] bg-gray-100 mb-6 overflow-hidden relative border border-gray-100">
                  <img 
                    src="https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1022.jpeg" 
                    alt="Lucio Fontana, Concetto Spaziale" 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                  />
                </div>
                <p className="font-mono text-[10px] text-gray-400 mb-2 uppercase tracking-wider">Asset: Lucio Fontana (1968) // Valuation</p>
                <h3 className="font-serif text-2xl mb-4 text-black group-hover:text-gray-600 transition-colors">THE WHITE ABSOLUTE</h3>
                <p className="font-serif italic text-gray-600 text-sm leading-relaxed mb-6">
                  See how the Curator Engine analyzes liquidity, risk, and market arbitrage for institutional-grade assets. This is the level of depth I bring to every acquisition.
                </p>
              </div>
              <div className="border-t border-gray-100 pt-6">
                <a href="/case-study/fontana" className="font-mono text-[10px] uppercase tracking-widest text-black flex items-center justify-between font-bold">
                  <span>Analyze</span>
                  <span>→</span>
                </a>
              </div>
            </div>

            {/* Case 2: Garcia */}
            <div className="bg-white border border-gray-200 p-8 flex flex-col justify-between shadow-sm group">
              <div>
                <div className="aspect-[4/3] bg-gray-100 mb-6 overflow-hidden relative border border-gray-100">
                  <img 
                    src="https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1047.jpeg" 
                    alt="Emil Garcia" 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                  />
                </div>
                <p className="font-mono text-[10px] text-gray-400 mb-2 uppercase tracking-wider">Asset: Emil Garcia // Curation & Packaging</p>
                <h3 className="font-serif text-2xl mb-4 text-black group-hover:text-gray-600 transition-colors">POETICS OF SILENCE</h3>
                <p className="font-serif italic text-gray-600 text-sm leading-relaxed mb-6">
                  Examine how AI-assisted provenance and structural framing transform non-conformist heritage into sovereign cultural capital.
                </p>
              </div>
              <div className="border-t border-gray-100 pt-6">
                <a href="/case-study/garcia" className="font-mono text-[10px] uppercase tracking-widest text-black flex items-center justify-between font-bold">
                  <span>Examine</span>
                  <span>→</span>
                </a>
              </div>
            </div>

            {/* Case 3: Pivovarov */}
            <div className="bg-white border border-gray-200 p-8 flex flex-col justify-between shadow-sm group">
              <div>
                <div className="aspect-[4/3] bg-gray-100 mb-6 overflow-hidden relative border border-gray-100">
                  <img 
                    src="https://static.themoscowtimes.com/image/article_1360/4b/284adbd87bb8432b91f87b430babc29f.jpg" 
                    alt="Ilya Pivovarov" 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                  />
                </div>
                <p className="font-mono text-[10px] text-gray-400 mb-2 uppercase tracking-wider">Asset: Ilya Pivovarov // Conceptual Dossier</p>
                <h3 className="font-serif text-2xl mb-4 text-black group-hover:text-gray-600 transition-colors">TOTAL LONELINESS</h3>
                <p className="font-serif italic text-gray-600 text-sm leading-relaxed mb-6">
                  A foundational case study in Moscow Conceptualism, exploring inward-facing rigour, total solitude, and institutional endurance.
                </p>
              </div>
              <div className="border-t border-gray-100 pt-6">
                <a href="/case-study/pivovarov" className="font-mono text-[10px] uppercase tracking-widest text-black flex items-center justify-between font-bold">
                  <span>Read Dossier</span>
                  <span>→</span>
                </a>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 4. FINE ART BANKING INFRASTRUCTURE CTA */}
      <section className="py-24 px-6 md:px-12 max-w-screen-xl mx-auto text-center">
        <div className="max-w-2xl mx-auto space-y-8">
          <h2 className="text-3xl md:text-5xl font-serif font-light tracking-tight">
            Fine Art Banking & Advisory Infrastructure
          </h2>
          <p className="font-serif italic text-gray-600 text-base md:text-lg leading-relaxed">
            Generate institutional-quality investment memoranda in seconds with absolute discretion.
          </p>
          <div className="pt-4 flex flex-col sm:flex-row justify-center gap-4">
            <a 
              href="mailto:merkurov@gmail.com?subject=Terminal Sign In Request"
              className="px-10 py-4 bg-black text-white font-mono text-xs uppercase tracking-[0.2em] hover:bg-gray-800 transition-all"
            >
              Sign In
            </a>
            <a 
              href="mailto:merkurov@gmail.com?subject=Request Access: Art Intelligence Terminal"
              className="px-10 py-4 bg-white text-black border border-black font-mono text-xs uppercase tracking-[0.2em] hover:bg-gray-50 transition-all"
            >
              Request Access
            </a>
          </div>
        </div>
      </section>

      {/* 5. FOOTER */}
      <footer className="py-12 px-6 text-center bg-white border-t border-gray-200">
        <p className="font-mono text-[10px] text-gray-400 tracking-[0.3em] uppercase mb-4">
          Curated by Anton Merkurov / All Rights Reserved 2026
        </p>
        <div className="max-w-xl mx-auto text-[9px] text-gray-400 leading-relaxed font-sans">
          <p>
            DISCLAIMER: This terminal produces independent market analysis and structured dossiers. 
            It does not constitute a solicitation to buy securities or financial assets.
          </p>
        </div>
      </footer>

    </div>
  );
}
