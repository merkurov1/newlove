import React from 'react';

export default function FontanaCaseStudy() {
  return (
    <div className="min-h-screen bg-white text-black selection:bg-red-600 selection:text-white font-sans">
      
      {/* 1. NAVIGATION (Minimalist) */}
      <nav className="fixed top-0 left-0 w-full bg-white/95 backdrop-blur-sm z-50 border-b border-gray-100 py-4 px-6 md:px-12 flex justify-between items-center transition-all duration-300">
        <div className="text-xs font-bold tracking-widest uppercase">Merkurov.Love</div>
        <div className="text-xs font-mono text-gray-400">ARCHIVE / LOT 059</div>
      </nav>

      {/* 2. HERO SECTION */}
      <section className="pt-32 pb-16 px-6 md:px-12 max-w-screen-2xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">
          
          {/* ARTWORK IMAGE */}
          <div className="lg:col-span-6">
            <div className="aspect-[3/4] bg-gray-50 relative shadow-sm">
              <img 
                src="https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1022.jpeg" 
                alt="Lucio Fontana, Concetto Spaziale (Red)" 
                className="w-full h-full object-cover" 
              />
            </div>
            <p className="mt-4 text-[10px] text-gray-400 font-mono uppercase text-right tracking-wider">
              Sotheby's Milan / Lot 59
            </p>
          </div>

          {/* TITLE & KEY METADATA */}
          <div className="lg:col-span-6 flex flex-col justify-between h-full pt-4 lg:pl-12">
            <div>
              <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-gray-400 mb-4">The Asset</h2>
              <h1 className="text-6xl md:text-7xl font-serif font-light leading-none mb-10 tracking-tight">
                Lucio<br/>Fontana
              </h1>
              
              <div className="space-y-8 text-sm border-l border-black pl-8 py-2">
                <div>
                  <p className="font-bold text-lg">Concetto spaziale, Attese</p>
                  <p className="text-gray-500 font-serif italic mt-1">"The Red Silence"</p>
                </div>
                <div className="grid grid-cols-2 gap-8">
                    <div>
                      <p className="font-mono text-[10px] text-gray-400 mb-1 uppercase">Date</p>
                      <p>1968 (Year of Death)</p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] text-gray-400 mb-1 uppercase">Medium</p>
                      <p>Waterpaint on canvas</p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] text-gray-400 mb-1 uppercase">Dimensions</p>
                      <p>65.2 x 54 cm</p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] text-gray-400 mb-1 uppercase">Condition</p>
                      <p>Excellent / Stable</p>
                    </div>
                </div>
              </div>
            </div>

            {/* QUOTE */}
            <div className="mt-20 lg:mt-auto">
                <blockquote className="text-2xl md:text-3xl font-serif italic leading-relaxed text-gray-900">
                “Everyone thought I wanted to destroy: but it’s not true, I have built, not destroyed, that’s the point.”
                </blockquote>
                <p className="mt-4 text-xs font-mono text-gray-400">— LUCIO FONTANA, 1968</p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. THE NARRATIVE (Essay Style) */}
      <section className="py-24 bg-[#FAFAFA] px-6 md:px-12 border-t border-gray-100">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 leading-relaxed text-gray-800 font-serif text-lg">
            <div>
              <p className="mb-8 first-letter:text-6xl first-letter:font-light first-letter:float-left first-letter:mr-4 first-letter:mt-[-12px]">
                The focal point of Lucio Fontana’s spatial investigation lies in the act of the cut, which became the ontologically necessary expression of his artistic vision—his ultimate alphabet.
              </p>
              <p className="mb-6">
                The monochrome surface attains compositional perfection of great mastery, where the blade incises the canvas with confidence and the material opens itself to immensity.
              </p>
            </div>
            <div>
              <p className="mb-8">
                The cut thus becomes a threshold: the pictorial surface is no longer a window onto the world, but a traversed horizon, an opening toward the infinite. The act is essential yet charged with meaning — a single gesture, precise and irreversible.
              </p>
              <div className="pl-6 border-l-2 border-red-600">
                <p className="text-gray-500 italic text-sm leading-relaxed">
                  "Il taglio diventa così un varco: la superficie pittorica non è più finestra sul mondo, ma orizzonte attraversato..."
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. ANALYTICS & MARKET CONTEXT (Clean Data) */}
      <section className="py-24 px-6 md:px-12 max-w-screen-xl mx-auto">
        <h2 className="text-4xl font-serif font-light mb-16 border-b border-black pb-6">Market Context & Valuation</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
          
          {/* Column 1: Historical Significance */}
          <div className="group">
            <h3 className="font-mono text-[10px] font-bold uppercase mb-6 tracking-widest text-red-600 group-hover:text-black transition-colors">01. The 1968 Premium</h3>
            <p className="text-sm text-gray-600 leading-7 mb-4">
              Executed in the final year of the artist's life, this work represents the <em>summa</em> of Fontana's practice. Unlike the hesitant cuts of the early 60s, the 1968 incisions are surgical.
            </p>
            <p className="text-sm text-gray-600 leading-7">
              <strong>The Narrative Asset:</strong> The verso inscription <em>"alla barranca di Rosario"</em> references his birthplace in Argentina. This "full circle" biography creates significant intangible value.
            </p>
          </div>

          {/* Column 2: Liquidity Analysis */}
          <div className="group">
            <h3 className="font-mono text-[10px] font-bold uppercase mb-6 tracking-widest text-red-600 group-hover:text-black transition-colors">02. Liquidity Profile</h3>
            <p className="text-sm text-gray-600 leading-7 mb-6">
              Red <em>Attese</em> canvases command a distinct liquidity premium (~18% over white). They act as a "Global Nomad Asset" — instantly recognizable currency in NY, London, and Hong Kong.
            </p>
            <div className="bg-gray-50 p-6 border border-gray-100">
              <div className="flex justify-between text-xs font-mono mb-3 pb-3 border-b border-gray-200">
                <span className="text-gray-500">VOLATILITY</span>
                <span className="font-bold">LOW (Defensive)</span>
              </div>
              <div className="flex justify-between text-xs font-mono">
                <span className="text-gray-500">DEMAND TREND</span>
                <span className="font-bold">RISING</span>
              </div>
            </div>
          </div>

          {/* Column 3: The Arbitrage */}
          <div className="group">
            <h3 className="font-mono text-[10px] font-bold uppercase mb-6 tracking-widest text-red-600 group-hover:text-black transition-colors">03. The Opportunity</h3>
            <p className="text-sm text-gray-600 leading-7 mb-6">
              A pricing inefficiency exists between the local Milanese market and global valuations. 
            </p>
            <ul className="text-xs font-mono space-y-4 border-t border-black pt-4">
              <li className="flex justify-between items-center">
                <span className="text-gray-500">NY/London Comp</span>
                <span className="font-bold text-sm">$1.4M - $1.8M</span>
              </li>
              <li className="flex justify-between items-center">
                <span className="text-gray-500">Milan Estimate</span>
                <span className="font-bold text-sm">€700k - €1M</span>
              </li>
              <li className="flex justify-between items-center pt-4 mt-2 border-t border-dashed border-gray-300">
                <span className="font-bold text-black">IMPLIED UPSIDE</span>
                <span className="text-green-600 font-bold bg-green-50 px-2 py-1 rounded">~35%</span>
              </li>
            </ul>
          </div>

        </div>
      </section>

      {/* 5. PROVENANCE (Technical) */}
      <section className="py-20 bg-[#111] text-white px-6 md:px-12">
        <div className="max-w-screen-xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div>
             <h3 className="font-mono text-[10px] tracking-widest text-gray-500 mb-8 uppercase">Provenance Chain</h3>
             <ul className="space-y-6 font-mono text-xs text-gray-400">
               <li className="flex items-center">
                 <span className="w-2 h-2 rounded-full bg-gray-700 mr-4"></span>
                 Marlborough Galleria d'Arte, Rome
               </li>
               <li className="flex items-center">
                 <span className="w-2 h-2 rounded-full bg-gray-700 mr-4"></span>
                 Galleria La Nuova Loggia, Bologna
               </li>
               <li className="flex items-center">
                 <span className="w-2 h-2 rounded-full bg-gray-700 mr-4"></span>
                 Galleria San Luca, Bologna
               </li>
               <li className="flex items-center text-white">
                 <span className="w-2 h-2 rounded-full bg-red-600 mr-4 animate-pulse"></span>
                 <span className="font-bold border-b border-gray-700 pb-1">Private Collection, Bologna (Acquired 1970s)</span>
               </li>
             </ul>
             <p className="mt-10 text-[10px] text-gray-500 uppercase tracking-wide">
               * Fresh to market asset. Held for ~50 years.
             </p>
          </div>
          <div className="flex flex-col justify-center lg:border-l border-gray-800 lg:pl-16">
            <h3 className="font-serif text-3xl mb-4 font-light">Lucio Fontana</h3>
            <p className="text-sm text-gray-400 leading-relaxed max-w-md font-serif italic">
              (1899, Rosario de Santa Fé - 1968, Comabbio). 
              <br/><br/>
              Italian painter, sculptor and theorist of Argentine birth. Known as the founder of Spatialism, he changed the history of art by piercing the canvas.
            </p>
          </div>
        </div>
      </section>
      
      {/* 6. FOOTER */}
      <footer className="py-12 px-6 text-center border-t border-gray-200 bg-white">
        <p className="font-mono text-[10px] text-gray-300 tracking-[0.3em]">ANTON MERKUROV / CURATOR ENGINE / 2025</p>
      </footer>

    </div>
  );
}