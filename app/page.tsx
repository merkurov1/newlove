import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

export const metadata = {
  title: 'Merkurov | The Interface',
  description: 'Art, advising, and curated selection. Digital Heritage Architecture.',
};

const NAV_ITEMS = [
  {
    num: '01',
    label: 'Art',
    caption: 'The Digital Ritual & Artifacts',
    href: '/heartandangel',
  },
  {
    num: '02',
    label: 'Selection',
    caption: 'Curated Cultural Inventory',
    href: '/selection',
  },
  {
    num: '03',
    label: 'Advising',
    caption: 'Private Art & Heritage Strategy',
    href: '/advising',
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#FAF8F5] text-[#111111] font-sans selection:bg-[#111111] selection:text-[#FAF8F5] relative overflow-hidden flex flex-col justify-between antialiased">
      {/* 1. Subtle Paper Grain Overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-40 opacity-[0.02] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Decorative Top Accent Line */}
      <div className="h-[1px] w-full bg-[#111111]/80 fixed top-0 z-50" />

      {/* TOP BAR */}
      <header className="w-full px-8 py-10 md:px-16 flex justify-between items-center z-10">
        <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-zinc-400">
          Merkurov Office
        </span>

        {/* STATUS BADGE */}
        <div className="inline-flex items-center gap-2 border border-zinc-200/60 px-3.5 py-1 rounded-full bg-white/40 backdrop-blur-md">
          <span className="w-1.5 h-1.5 bg-emerald-600/80 rounded-full"></span>
          <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-zinc-500">
            System Active
          </span>
        </div>
      </header>

      {/* CENTER CONTAINER */}
      <div className="w-full max-w-4xl mx-auto px-6 py-12 flex flex-col items-center z-10 my-auto">
        {/* EPIGRAPH */}
        <p className="text-lg md:text-2xl font-serif italic text-zinc-400/90 mb-12 text-center max-w-md leading-relaxed font-normal tracking-wide">
          “Structure is the antidote to chaos.”
        </p>

        {/* LOBBY BUTTON */}
        <div className="mb-20 md:mb-24">
          <Link
            href="/lobby"
            className="group inline-flex items-center gap-8 border border-zinc-900/10 bg-white/80 hover:bg-[#111111] text-[#111111] hover:text-[#FAF8F5] px-8 py-4 transition-all duration-700 ease-out backdrop-blur-sm shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_10px_30px_rgba(0,0,0,0.08)]"
          >
            <div className="flex flex-col text-left">
              <span className="font-mono text-[8px] uppercase tracking-[0.3em] text-zinc-400 group-hover:text-zinc-400 transition-colors">
                Protocol 00
              </span>
              <span className="font-serif text-base md:text-lg leading-snug italic font-normal tracking-wide pr-2">
                Enter The Lobby
              </span>
            </div>
            <ArrowUpRight
              size={15}
              className="text-zinc-400 group-hover:text-[#FAF8F5] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-500"
            />
          </Link>
        </div>

        {/* THE PILLARS (Navigation Grid) */}
        <nav className="flex flex-col items-center gap-10 md:gap-14 w-full max-w-2xl">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.num}
              href={item.href}
              className="group relative block w-full text-center py-1"
            >
              <div className="inline-flex items-baseline gap-3 md:gap-4">
                <span className="font-mono text-[10px] text-zinc-300 tracking-widest transition-colors duration-500 group-hover:text-zinc-600">
                  {item.num}
                </span>
                <span className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-serif font-normal tracking-tight text-[#111111] group-hover:italic transition-all duration-700 ease-out">
                  {item.label}
                </span>
              </div>
              <span className="block font-mono text-[9px] md:text-[10px] text-zinc-400 tracking-[0.25em] uppercase mt-2.5 opacity-40 group-hover:opacity-100 group-hover:text-[#111111] transition-all duration-500">
                {item.caption}
              </span>
            </Link>
          ))}
        </nav>
      </div>

      {/* FOOTER */}
      <footer className="w-full px-6 py-10 text-center z-10">
        <span className="text-[9px] font-mono text-zinc-400/80 uppercase tracking-[0.3em]">
          Merkurov Interface v3.1 — All Systems Operational
        </span>
      </footer>
    </main>
  );
}
