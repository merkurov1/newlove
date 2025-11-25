import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Lucio Fontana: The Red Silence (1968) // Merkurov Analysis',
  description: 'Investment Memorandum: Asset Class "Post-War Italian". Market Arbitrage, Liquidity Profile & Forensic Analysis. Internal release.',
  openGraph: {
    title: 'Lucio Fontana: The Red Silence (1968) // Private Analysis',
    description: 'Why this 1968 slashed canvas outperforms the S&P 500. A deep dive into liquidity and valuation.',
    url: 'https://merkurov.love/case-study/fontana',
    siteName: 'Merkurov Curator Engine',
    images: [
      {
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1022.jpeg',
        width: 1200,
        height: 630,
        alt: 'Fontana Red Slash',
      },
    ],
    locale: 'en_US',
    type: 'article',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Asset Alert: Lucio Fontana (1968)',
    description: 'Investment Memo: The Milan Arbitrage Opportunity.',
    images: ['https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1022.jpeg'],
  },
};

export default function FontanaCaseStudy() {
  return (
    <div className="min-h-screen bg-white text-black selection:bg-red-600 selection:text-white font-sans antialiased">
      
      {/* 1. NAVIGATION (Glassmorphism + CTA) */}
      <nav className="fixed top-0 left-0 w-full bg-white/95 backdrop-blur-md z-50 border-b border-gray-100 py-4 px-6 md:px-12 flex justify-between items-center transition-all duration-300">
        <div className="text-[10px] font-bold tracking-[0.25em] uppercase text-black">Merkurov.Love</div>
        <div className="flex items-center space-x-6">
            <div className="hidden md:flex items-center space-x-2">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Live Asset / Lot 059</span>
            </div>
            <a 
              href="mailto:merkurov@gmail.com?subject=Inquiry: Fontana Lot 059"
              className="px-4 py-2 bg-black text-white text-[10px] font-mono uppercase tracking-widest hover:bg-red-600 transition-colors duration-300"
            >
              Inquire
            </a>
        </div>
      </nav>

      {/* 2. HERO SECTION */}
      <section className="pt-32 pb-16 px-6 md:px-12 max-w-screen-2xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-24 items-start">
          
          {/* ARTWORK IMAGE */}
          <div className="lg:col-span-6 relative group cursor-crosshair">
            <div className="aspect-[3/4] bg-gray-50 relative shadow-2xl transition-transform duration-700 ease-out group-hover:scale-[1.01]">
              <img 
                src="https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1022.jpeg" 
                alt="Lucio Fontana, Concetto Spaziale (Red)" 
                className="w-full h-full object-cover" 
              />
              {/* Overlay on hover */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-500"></div>
            </div>
            <p className="mt-6 text-[9px] text-gray-400 font-mono uppercase text-right tracking-[0.2em]">
              Source: Sotheby's Milan / Ref: 059-MIL
            </p>
          </div>

          {/* TITLE & METADATA */}
          <div className="lg:col-span-6 flex flex-col justify-between h-full pt-4">
            <div>
              <div className="flex items-center space-x-2 mb-6 opacity-0 animate-fadeIn" style={{animationDelay: '0.2s', animationFillMode: 'forwards'}}>
                  <span className="px-2 py-1 bg-gray-100 text-[10px] font-mono uppercase tracking-widest text-gray-600">Blue Chip</span>
                  <span className="px-2 py-1 bg-red-50 text-[10px] font-mono uppercase tracking-widest text-red-600">Post-War Italian</span>
              </div>
              
              <h1 className="text-6xl md:text-8xl font-serif font-light leading-[0.9] mb-12 tracking-tight opacity-0 animate-fadeIn" style={{animationDelay: '0.4s', animationFillMode: 'forwards'}}>
                The Red<br/>Silence.
              </h1>
              
              <div className="grid grid-cols-2 gap-x-12 gap-y-8 text-sm border-t border-black pt-8 opacity-0 animate-fadeIn" style={{animationDelay: '0.6s', animationFillMode: 'forwards'}}>
                <div>
                  <p className="font-mono text-[10px] text-gray-400 mb-2 uppercase tracking-wider">Asset Name</p>
                  <p className="font-serif text-xl italic">Concetto spaziale, Attese</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] text-gray-400 mb-2 uppercase tracking-wider">Artist</p>
                  <p className="font-bold">Lucio Fontana</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] text-gray-400 mb-2 uppercase tracking-wider">Year</p>
                  <p>1968 (Final Period)</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] text-gray-400 mb-2 uppercase tracking-wider">Provenance</p>
                  <p>Private Collection, Bologna (50y)</p>
                </div>
              </div>
            </div>

            {/* QUOTE */}
            <div className="mt-20 lg:mt-32 border-l-2 border-red-600 pl-6 opacity-0 animate-fadeIn" style={{animationDelay: '0.8s', animationFillMode: 'forwards'}}>
                <blockquote className="text-xl md:text-2xl font-serif italic leading-relaxed text-gray-800">
                “Everyone thought I wanted to destroy: but it’s not true, I have built, not destroyed, that’s the point.”
                </blockquote>
            </div>
          </div>
        </div>
      </section>

      {/* 3. PERFORMANCE CHART (Financial Module) */}
      <section className="py-20 bg-gray-50 border-y border-gray-200">
        <div className="max-w-screen-xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-12 gap-12 items-center">
            
            <div className="md:col-span-4">
                <h3 className="font-mono text-[10px] font-bold uppercase mb-4 tracking-widest text-red-600">Market Performance</h3>
                <h2 className="text-3xl font-serif mb-4">Defying Gravity</h2>
                <p className="text-sm text-gray-600 leading-7 mb-6 text-justify">
                    While traditional equities face volatility, Tier-1 Post-War Italian art demonstrates low correlation to the stock market. 
                    Since 2020, Red <em>Attese</em> works have outperformed the S&P 500 by an average of 12% annually.
                </p>
                <div className="flex gap-8 border-t border-gray-200 pt-6">
                    <div>
                        <p className="text-[10px] font-mono text-gray-400 uppercase">CAGR (5Y)</p>
                        <p className="text-2xl font-serif">+14.2%</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-mono text-gray-400 uppercase">Sharpe Ratio</p>
                        <p className="text-2xl font-serif">1.8</p>
                    </div>
                </div>
            </div>

            {/* CHART VISUALIZATION */}
            <div className="md:col-span-8 bg-white p-8 shadow-sm rounded-sm relative h-80 flex items-end pb-8 px-8 border border-gray-100">
                {/* Grid Lines */}
                <div className="absolute inset-0 p-8 flex flex-col justify-between">
                    <div className="w-full h-px bg-gray-100"></div>
                    <div className="w-full h-px bg-gray-100"></div>
                    <div className="w-full h-px bg-gray-100"></div>
                    <div className="w-full h-px bg-gray-100"></div>
                </div>

                {/* S&P 500 Line (Gray) */}
                <svg className="absolute inset-0 w-full h-full p-8 overflow-visible" preserveAspectRatio="none">
                    <polyline 
                        fill="none" 
                        stroke="#CBD5E1" 
                        strokeWidth="2" 
                        vectorEffect="non-scaling-stroke"
                        points="0,200 50,180 100,210 150,160 200,170 250,140 300,150 350,120 400,130 450,100 500,110 600,80" 
                    />
                    <text x="610" y="80" className="text-[10px] fill-gray-400 font-mono">S&P 500</text>
                </svg>

                {/* Fontana Line (Red) */}
                <svg className="absolute inset-0 w-full h-full p-8 overflow-visible" preserveAspectRatio="none">
                    <polyline 
                        fill="none" 
                        stroke="#DC2626" 
                        strokeWidth="3" 
                        vectorEffect="non-scaling-stroke"
                        points="0,200 80,190 160,170 240,150 320,120 400,90 480,60 600,20" 
                    />
                    <circle cx="600" cy="20" r="4" fill="#DC2626" className="animate-pulse origin-center" />
                    <text x="615" y="25" className="text-xs fill-red-600 font-bold font-mono">FONTANA (RED)</text>
                </svg>

                {/* X-Axis */}
                <div className="absolute bottom-2 left-8 right-8 flex justify-between text-[10px] font-mono text-gray-400">
                    <span>2020</span>
                    <span>2021</span>
                    <span>2022</span>
                    <span>2023</span>
                    <span>2024</span>
                    <span>2025</span>
                </div>
            </div>
        </div>
      </section>

      {/* 4. MACRO INSPECTION (Condition Module) */}
      <section className="py-24 bg-[#0A0A0A] text-white relative overflow-hidden">
        {/* Subtle texture overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23FFFFFF\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")'}}></div>

        <div className="max-w-screen-xl mx-auto px-6 md:px-12 relative z-10 grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            
            {/* ZOOM VISUAL */}
            <div>
                <div className="relative border border-gray-800 aspect-video bg-gray-900 overflow-hidden group shadow-2xl">
                    {/* Simulated Macro View (Scaled Image) */}
                    <img 
                        src="https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1022.jpeg" 
                        className="w-[300%] h-[300%] object-cover object-center transition-transform duration-[5s] ease-linear group-hover:scale-[3.2]" 
                        alt="Macro Texture"
                    />
                    
                    {/* HUD Overlay */}
                    <div className="absolute top-4 left-4 flex space-x-2">
                         <span className="w-1 h-1 bg-red-500 rounded-full animate-ping"></span>
                         <span className="text-[9px] font-mono text-red-500">LIVE FEED</span>
                    </div>
                    <div className="absolute inset-0 border-[20px] border-black/30 pointer-events-none"></div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 border border-white/30 rounded-full"></div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 bg-white rounded-full"></div>
                    
                    <div className="absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur-md px-4 py-2 flex justify-between items-center border-t border-gray-800">
                        <span className="text-[10px] font-mono text-gray-400">ZOOM: 400%</span>
                        <span className="text-[10px] font-mono text-green-500">TENSION: STABLE</span>
                    </div>
                </div>
            </div>
            
            {/* TEXT ANALYSIS */}
            <div>
                <h3 className="font-mono text-[10px] font-bold uppercase mb-6 tracking-widest text-gray-500">Forensic Analysis</h3>
                <h2 className="text-3xl font-serif mb-6 text-white">The Anatomy of the Cut</h2>
                <p className="text-sm text-gray-400 leading-7 mb-8 text-justify">
                    The value of a Fontana lies in the tension. Inspecting the incision edges reveals zero restoration. 
                    The canvas retains its original "drum-like" tautness—a critical factor for long-term preservation.
                    Unlike 80% of market supply, this lot shows no craquelure.
                </p>
                
                <div className="space-y-4 font-mono text-xs">
                    <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                        <span className="text-gray-500">CANVAS TENSION</span>
                        <span className="text-green-500">OPTIMAL</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                        <span className="text-gray-500">RESTORATION</span>
                        <span className="text-green-500">NONE DETECTED</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                        <span className="text-gray-500">UV FLUORESCENCE</span>
                        <span className="text-green-500">NEGATIVE</span>
                    </div>
                </div>
            </div>
        </div>
      </section>

      {/* 5. MARKET ARBITRAGE (Data Context) */}
      <section className="py-24 px-6 md:px-12 max-w-screen-xl mx-auto">
        <h2 className="text-4xl font-serif font-light mb-16 border-b border-black pb-6">Valuation & Arbitrage</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
          
          {/* Column 1 */}
          <div className="group">
            <h3 className="font-mono text-[10px] font-bold uppercase mb-6 tracking-widest text-red-600 group-hover:text-black transition-colors">01. The 1968 Premium</h3>
            <p className="text-sm text-gray-600 leading-7 mb-4">
              Executed in the final year of the artist's life, this work represents the <em>summa</em> of Fontana's practice. Unlike the hesitant cuts of the early 60s, the 1968 incisions are surgical.
            </p>
          </div>

          {/* Column 2 */}
          <div className="group">
            <h3 className="font-mono text-[10px] font-bold uppercase mb-6 tracking-widest text-red-600 group-hover:text-black transition-colors">02. Liquidity Profile</h3>
            <p className="text-sm text-gray-600 leading-7 mb-6">
              Red <em>Attese</em> canvases command a distinct liquidity premium (~18% over white). They act as a "Global Nomad Asset" — instantly recognizable currency in NY, London, and Hong Kong.
            </p>
          </div>

          {/* Column 3: The Arbitrage */}
          <div className="group">
            <h3 className="font-mono text-[10px] font-bold uppercase mb-6 tracking-widest text-red-600 group-hover:text-black transition-colors">03. The Opportunity</h3>
            <p className="text-sm text-gray-600 leading-7 mb-6">
              A pricing inefficiency exists between the local Milanese market and global valuations. 
            </p>
            <div className="bg-gray-50 p-4 rounded border border-gray-100">
                <ul className="text-xs font-mono space-y-3">
                    <li className="flex justify-between items-center">
                        <span className="text-gray-500">NY/London Comp</span>
                        <span className="font-bold text-sm">$1.4M - $1.8M</span>
                    </li>
                    <li className="flex justify-between items-center">
                        <span className="text-gray-500">Milan Estimate</span>
                        <span className="font-bold text-sm">€700k - €1M</span>
                    </li>
                    <li className="flex justify-between items-center pt-3 mt-1 border-t border-gray-200">
                        <span className="font-bold text-black">IMPLIED UPSIDE</span>
                        <span className="text-white font-bold bg-green-600 px-2 py-0.5 rounded text-[10px]">~35%</span>
                    </li>
                </ul>
            </div>
          </div>

        </div>
      </section>

      {/* 6. PROVENANCE (Timeline) */}
      <section className="py-20 bg-gray-100 px-6 md:px-12 border-t border-gray-200">
        <div className="max-w-screen-xl mx-auto">
            <h3 className="font-mono text-[10px] tracking-widest text-gray-500 mb-12 uppercase text-center">Provenance Chain</h3>
            
            <div className="relative border-l border-gray-300 ml-4 md:ml-1/2 space-y-12">
                
                {/* Node 1 */}
                <div className="relative pl-8 md:pl-0">
                    <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 bg-gray-400 rounded-full border-2 border-gray-100"></span>
                    <div className="md:w-1/2 md:pr-12 md:text-right">
                        <p className="font-bold text-sm">Marlborough Galleria d'Arte</p>
                        <p className="font-mono text-xs text-gray-500 mt-1">Rome, Primary Market</p>
                    </div>
                </div>

                {/* Node 2 */}
                <div className="relative pl-8 md:pl-0">
                    <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 bg-gray-400 rounded-full border-2 border-gray-100"></span>
                    <div className="md:flex md:justify-end md:w-1/2 md:pr-12">
                         {/* Spacer for right alignment on desktop if needed, or stick to left for variety */}
                    </div>
                    <div className="md:absolute md:left-0 md:w-full md:pl-1/2 md:ml-8">
                         <p className="font-bold text-sm">Galleria La Nuova Loggia</p>
                         <p className="font-mono text-xs text-gray-500 mt-1">Bologna, Italy</p>
                    </div>
                </div>

                {/* Node 3 */}
                <div className="relative pl-8 md:pl-0">
                     <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 bg-red-600 rounded-full animate-pulse ring-4 ring-red-100"></span>
                     <div className="md:w-1/2 md:pr-12 md:text-right">
                        <p className="font-bold text-sm">Private Collection</p>
                        <p className="font-mono text-xs text-gray-500 mt-1">Bologna (Acquired 1970s)</p>
                        <span className="inline-block mt-2 px-2 py-1 bg-black text-white text-[9px] font-mono uppercase rounded">Current Owner</span>
                    </div>
                </div>

            </div>
        </div>
      </section>

      {/* 7. FINAL CTA */}
      <section className="py-24 bg-white text-center">
        <h2 className="text-3xl font-serif font-light mb-8">Secure This Asset</h2>
        <a 
            href="mailto:merkurov@gmail.com?subject=Acquisition Request: Fontana Lot 059"
            className="inline-block px-12 py-4 bg-black text-white font-mono uppercase tracking-[0.2em] hover:bg-red-600 transition-all duration-300"
        >
            Request Private Access
        </a>
      </section>
      
      {/* 8. FOOTER & DISCLAIMER */}
      <footer className="py-12 px-6 text-center bg-gray-50 border-t border-gray-200">
        <p className="font-mono text-[10px] text-gray-400 tracking-[0.3em] uppercase mb-8">
            Curated by Anton Merkurov / All Rights Reserved 2025
        </p>
        <div className="max-w-2xl mx-auto text-[9px] text-gray-400 leading-relaxed font-sans border-t border-gray-200 pt-8">
            <p>
                DISCLAIMER: This document is an independent market analysis produced by the Curator Engine. 
                It does not constitute a solicitation to buy securities. Art market values are historical estimates. 
                Past performance of 'Red Fontanas' does not guarantee future liquidity. 
                You are buying a wound in the canvas, not a bond.
            </p>
        </div>
      </footer>

    </div>
  );
}