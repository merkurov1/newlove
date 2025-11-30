import React from 'react';
import type { Metadata } from 'next';
// using native <img> to avoid requiring additional Next image domain config

export const metadata: Metadata = {
  title: 'Viktor Pivovarov: The Metaphysical Room (1985) // Merkurov Analysis',
  description:
    "Case Study 003 — Viktor Pivovarov, Untitled (1985). Investment memorandum and curator analysis: provenance, deconstruction, and financial logic.",
  openGraph: {
    title: 'Viktor Pivovarov: The Metaphysical Room (1985)',
    description:
      "Case Study 003 — Viktor Pivovarov, Untitled (1985). Investment memorandum and curator analysis: provenance, deconstruction, and financial logic.",
    url: 'https://merkurov.love/case-study/pivovarov',
    siteName: 'Merkurov Curator Engine',
    images: [
      {
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1039.jpeg',
        width: 1200,
        height: 630,
        alt: 'Viktor Pivovarov — Untitled (1985)'
      }
    ],
    locale: 'en_US',
    type: 'article'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Case Study: Viktor Pivovarov — The Metaphysical Room',
    description:
      "Investment memo: Viktor Pivovarov (1985) — financial logic, provenance, and curator analysis.",
    images: ['https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1039.jpeg']
  },
  keywords: ['Viktor Pivovarov', 'Case Study', 'Merkurov', 'Conceptualism', 'Art Investment', 'Sotheby\'s']
};

export default function PivovarovCaseStudy() {
  return (
    <main className="min-h-screen bg-black text-white font-sans">
      <div className="max-w-6xl mx-auto px-8 py-20">
        {/* Header */}
        <header className="mb-16 opacity-0 animate-fadeIn" style={{ animationDelay: '0.05s', animationFillMode: 'forwards' }}>
          <div className="flex items-center justify-between gap-6">
            <div>
              <div className="text-[12px] uppercase opacity-50 tracking-widest font-mono">CASE STUDY 003</div>
              <h1 className="mt-4 font-serif text-4xl md:text-6xl leading-tight tracking-tight">THE METAPHYSICAL ROOM</h1>
              <div className="mt-3 text-sm opacity-80 text-gray-200">VIKTOR PIVOVAROV / UNTITLED (1985)</div>
            </div>

            <div className="flex flex-col items-end gap-3">
              <span className="inline-flex items-center gap-2 font-mono text-sm border border-red-500 text-red-500 px-3 py-1 rounded-sm">SOLD / REALIZED</span>
              <div className="flex items-center gap-2 text-sm opacity-60 font-mono">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline-block">
                  <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M16 3v4M8 3v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <span>SEPT 2021 — Sotheby's</span>
              </div>
            </div>
          </div>
        </header>

        {/* Asset */}
        <section className="mb-16 opacity-0 animate-fadeIn" style={{ animationDelay: '0.12s', animationFillMode: 'forwards' }}>
          <div className="grid grid-cols-12 gap-8 items-start">
            <div className="col-span-12 md:col-span-7">
              <div className="bg-[#050505] border border-gray-800 p-6">
                <div className="relative w-full" style={{ paddingBottom: '75%' }}>
                  <img
                    src="https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1039.jpeg"
                    alt="Viktor Pivovarov — Untitled (1985)"
                    className="object-contain w-full h-full absolute inset-0"
                    style={{ objectFit: 'contain' }}
                  />
                </div>
              </div>

              <div className="mt-4 border-t border-gray-900 pt-4 text-sm text-gray-200">
                <div className="grid grid-cols-2 gap-4">
                  <div className="opacity-50 font-mono">Artist</div>
                  <div className="font-sans">Viktor Pivovarov (b. 1937)</div>

                  <div className="opacity-50 font-mono">Year</div>
                  <div className="font-sans">1985</div>

                  <div className="opacity-50 font-mono">Medium</div>
                  <div className="font-sans">Oil on canvas</div>

                  <div className="opacity-50 font-mono">Dimensions</div>
                  <div className="font-sans">65 x 90 cm</div>

                  <div className="opacity-50 font-mono">Estimate</div>
                  <div className="font-mono">8,000 - 12,000 GBP</div>
                </div>
              </div>
            </div>

            {/* Right column: short facts / brutalist specs */}
            <aside className="col-span-12 md:col-span-5">
              <div className="border border-gray-800 p-6 h-full flex flex-col justify-between">
                <div>
                  <div className="text-xs uppercase opacity-50 font-mono mb-4">Lot Summary</div>
                  <h2 className="font-serif text-2xl mb-4">The Asset — Deconstruction</h2>
                  <p className="text-sm opacity-90 mb-4">A canonical artifact of Moscow Conceptualism. Quiet, inward-facing, formal rigour and intellectual refusal of spectacle.</p>

                  <div className="mt-6 grid gap-3 text-sm">
                    <div className="flex justify-between border-t border-gray-900 pt-3">
                      <div className="opacity-50 font-mono">Status</div>
                      <div className="font-mono text-red-400">SOLD</div>
                    </div>
                    <div className="flex justify-between border-t border-gray-900 pt-3">
                      <div className="opacity-50 font-mono">Provenance</div>
                      <div className="font-sans">Private Swiss collection → Sotheby's</div>
                    </div>
                    <div className="flex justify-between border-t border-gray-900 pt-3">
                      <div className="opacity-50 font-mono">Disposition</div>
                      <div className="font-sans">Archived — Benchmark Recorded</div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 opacity-60 text-xs font-mono">The Curator Engine / Merkurov OS</div>
              </div>
            </aside>
          </div>
        </section>

        {/* Analytical Text Sections — two column layout per section */}
        <section>
          <div className="space-y-12">
            {/* Section 01 */}
            <div className="grid grid-cols-12 gap-8 items-start opacity-0 animate-fadeIn" style={{ animationDelay: '0.18s', animationFillMode: 'forwards' }}>
              <div className="col-span-12 md:col-span-3">
                <div className="font-mono opacity-50 text-sm">SECTION 01</div>
                <h3 className="mt-4 font-serif text-xl">EXECUTIVE SUMMARY</h3>
              </div>
              <div className="col-span-12 md:col-span-9">
                <p className="text-sm leading-relaxed">
                  <strong>The Thesis:</strong> We are analyzing a canonical artifact of Moscow Conceptualism. While Ilya Kabakov built 'Total Installations,' Pivovarov painted 'Total Loneliness.' This work (1985) was created on the eve of Perestroika, yet it shows no sign of external chaos. It points inward.
                </p>
                <p className="text-sm leading-relaxed mt-4">
                  <strong>The Context:</strong> Pivovarov is the architect of the 'Secret Room'—the psychological space where the Soviet intellectual hid from the State.
                </p>
                <p className="text-sm leading-relaxed mt-4">
                  <strong>The Metric:</strong> Sold at Sotheby's 'Escape Artists' auction. This sale confirms that high-intellect Conceptualism remains a 'Blue Chip' asset, immune to the volatility of decorative art.
                </p>
              </div>
            </div>

            {/* Section 02 */}
            <div className="grid grid-cols-12 gap-8 items-start opacity-0 animate-fadeIn" style={{ animationDelay: '0.24s', animationFillMode: 'forwards' }}>
              <div className="col-span-12 md:col-span-3">
                <div className="font-mono opacity-50 text-sm">SECTION 02</div>
                <h3 className="mt-4 font-serif text-xl">THE ASSET (DECONSTRUCTION)</h3>
              </div>
              <div className="col-span-12 md:col-span-9">
                <p className="text-sm leading-relaxed">
                  <strong>The Medium:</strong> Oil on canvas. Unlike the 'Poverty Art' of the Leningrad school, Pivovarov uses traditional academic techniques to subvert reality. The execution is clinical, almost illustrative.
                </p>
                <p className="text-sm leading-relaxed mt-4">
                  <strong>The Visuals:</strong> A diagram of the soul. Pivovarov mixes the banality of Soviet life with the surrealism of a metaphysical diagram.
                </p>
                <p className="text-sm leading-relaxed mt-4">
                  <strong>The Philosophy:</strong> 'Interiority vs. Exteriority.' The painting acts as a window not into the world, but into the mind of a person who has ceased to believe in the material reality of the USSR.
                </p>
              </div>
            </div>

            {/* Section 03 */}
            <div className="grid grid-cols-12 gap-8 items-start opacity-0 animate-fadeIn" style={{ animationDelay: '0.30s', animationFillMode: 'forwards' }}>
              <div className="col-span-12 md:col-span-3">
                <div className="font-mono opacity-50 text-sm">SECTION 03</div>
                <h3 className="mt-4 font-serif text-xl">FINANCIAL LOGIC (THE KABAKOV GAP)</h3>
              </div>
              <div className="col-span-12 md:col-span-9">
                <p className="text-sm leading-relaxed">
                  <strong>The Arbitrage:</strong> Ilya Kabakov trades in the millions. Viktor Pivovarov—his peer and equal in the Conceptualist hierarchy—trades at a fraction of that price. This is a massive market inefficiency (The 'Kabakov Gap').
                </p>
                <p className="text-sm leading-relaxed mt-4">
                  <strong>The 'White' Provenance:</strong> Acquired directly from the artist into a private Swiss collection, then sold at Sotheby's London in 2018, and again in 2021. This is critical. It means the work left the USSR cleanly, likely through diplomatic channels. In a market plagued by fake provenance, 'Swiss History' adds a 20-30% premium to the valuation reliability.
                </p>
                <p className="text-sm leading-relaxed mt-4">
                  <strong>The Strategy:</strong> Strong Buy & Hold. As the supply of 1980s Conceptualism dries up, the price gap between Kabakov and Pivovarov will inevitably close.
                </p>
              </div>
            </div>

            {/* Section 04 */}
            <div className="grid grid-cols-12 gap-8 items-start opacity-0 animate-fadeIn" style={{ animationDelay: '0.36s', animationFillMode: 'forwards' }}>
              <div className="col-span-12 md:col-span-3">
                <div className="font-mono opacity-50 text-sm">SECTION 04</div>
                <h3 className="mt-4 font-serif text-xl">THE VERDICT</h3>
              </div>
              <div className="col-span-12 md:col-span-9">
                <p className="text-sm leading-relaxed">
                  <strong>Why this lot?</strong> 1985. The year the Empire began to crack. This painting captures the silence before the storm. It is a document of internal emigration.
                </p>
                <p className="text-sm leading-relaxed mt-4">
                  <strong>Action:</strong> Asset Archived. Benchmark Recorded. We are not looking at a painting; we are looking at the blueprints of the Soviet subconscious.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-20 border-t border-gray-900 pt-8 text-sm opacity-0 animate-fadeIn" style={{ animationDelay: '0.42s', animationFillMode: 'forwards' }}>
          <div className="flex items-center justify-between">
            <div className="font-mono">The Curator Engine</div>
            <div className="font-mono">Merkurov OS</div>
          </div>
        </footer>
      </div>
    </main>
  );
}
