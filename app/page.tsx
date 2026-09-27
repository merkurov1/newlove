import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

export const metadata = {
  title: 'Anton Merkurov | The Interface',
  description: 'Art, advising, and curated selection. Digital Heritage Architecture.',
};

export default function Home() {
  return (
    <main className="h-dvh w-full bg-[#FAF8F5] text-[#111111] font-sans selection:bg-[#111111] selection:text-[#FAF8F5] relative overflow-hidden flex flex-col justify-between px-6 sm:px-12 pb-8 pt-24 md:pt-32 antialiased">
      
      {/* Subtle Paper Grain Overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-30 opacity-[0.025] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* --- CENTER HERO BLOCK --- */}
      <div className="w-full max-w-5xl mx-auto flex flex-col items-center justify-center z-10 my-auto text-center">
        
        {/* Epigraph */}
        <p className="font-serif italic text-zinc-500 text-sm sm:text-base md:text-lg mb-6 sm:mb-8 tracking-wide font-normal max-w-md">
          “Structure is the antidote to chaos.”
        </p>

        {/* Main Title */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-serif font-normal tracking-tight leading-[0.98] text-[#111111] mb-8 sm:mb-12">
          Context Architecture <br />
          <span className="text-zinc-400 italic font-serif">&amp; Cultural Capital</span>
        </h1>

        {/* Primary Pillar Navigation */}
        <nav className="flex flex-wrap justify-center gap-3 sm:gap-6 md:gap-8 items-center font-mono text-[11px] sm:text-xs uppercase tracking-[0.2em] mb-12">
          {[
            { label: 'Art', href: '/heartandangel', tag: '01' },
            { label: 'Selection', href: '/selection', tag: '02' },
            { label: 'Advising', href: '/advising', tag: '03' },
          ].map((item) => (
            <Link
              key={item.tag}
              href={item.href}
              className="group inline-flex items-center gap-2 px-3 py-1.5 text-[#111111] hover:text-zinc-500 transition-colors"
            >
              <span className="text-zinc-300 font-normal group-hover:text-zinc-500 transition-colors">[</span>
              <span className="text-zinc-400 font-normal text-[9px] mr-0.5">{item.tag}</span>
              <span className="font-medium tracking-[0.2em] group-hover:underline underline-offset-4 decoration-zinc-300">{item.label}</span>
              <span className="text-zinc-300 font-normal group-hover:text-zinc-500 transition-colors">]</span>
            </Link>
          ))}
        </nav>

        {/* Lobby Portal Anchor */}
        <div>
          <Link
            href="/lobby"
            className="group inline-flex items-center gap-3 border border-zinc-900/15 bg-white/60 hover:bg-[#111111] text-[#111111] hover:text-[#FAF8F5] px-6 py-3 transition-all duration-500 ease-out backdrop-blur-sm shadow-[0_2px_15px_rgba(0,0,0,0.015)]"
          >
            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-zinc-400 group-hover:text-zinc-400 transition-colors">
              Protocol 00
            </span>
            <span className="font-serif text-sm sm:text-base italic font-normal tracking-wide px-1">
              Enter The Lobby
            </span>
            <ArrowUpRight
              size={14}
              className="text-zinc-400 group-hover:text-[#FAF8F5] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300"
            />
          </Link>
        </div>

      </div>

      {/* --- FOOTER DIRECTORY --- */}
      <footer className="w-full max-w-6xl mx-auto flex justify-between items-center pt-4 border-t border-zinc-200/60 z-10 shrink-0 font-mono text-[9px] sm:text-[10px] text-zinc-400 uppercase tracking-[0.25em]">
        <span>Merkurov Private Office</span>
        <span>Digital Heritage Architecture</span>
      </footer>

    </main>
  );
}
