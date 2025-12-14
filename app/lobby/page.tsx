import Link from "next/link";

export const metadata = {
  title: "Merkurov | System Access",
  description: "25 Years in the Ether. System Status: Building.",
};

export default function LobbyPage() {
  return (
    <main className="min-h-screen bg-[#050505] text-zinc-400 font-sans p-4 md:p-12 flex flex-col selection:bg-red-900 selection:text-white">
      
      {/* 1. STATUS BAR (LINK TO JOURNAL) */}
      <div className="w-full border border-zinc-800 bg-zinc-900/30 p-4 mb-12 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-600"></span>
          </span>
          <span className="text-[10px] md:text-xs font-mono tracking-widest uppercase text-zinc-500">
            System Architecture: Construction in Progress
          </span>
        </div>
        
        <Link href="/journal" className="text-xs font-mono text-white hover:text-red-500 border-b border-zinc-600 hover:border-red-500 transition-colors pb-0.5">
          VIEW SYSTEM LOGS (JOURNAL) →
        </Link>
      </div>

      {/* 2. THE CORE (25 YEARS) */}
      <div className="flex-grow flex flex-col items-center justify-center mb-16 relative">
        {/* Decorative Grid Lines */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
          <div className="w-[1px] h-full bg-zinc-800"></div>
          <div className="h-[1px] w-full bg-zinc-800 absolute"></div>
        </div>

        <div className="bg-[#050505] z-10 p-8 text-center border border-zinc-900">
          <h1 className="text-6xl md:text-9xl font-bold text-zinc-200 tracking-tighter leading-none">
            25
          </h1>
          <p className="text-lg md:text-2xl font-serif text-zinc-500 italic mt-2">
            Years in the Ether
          </p>
          <p className="text-[10px] font-mono text-zinc-700 uppercase tracking-[0.2em] mt-2">
            From FidoNet to Neural Networks
          </p>
        </div>
      </div>

      {/* 3. THE QUADRANT (NAVIGATION) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-zinc-900 border border-zinc-900 max-w-6xl mx-auto w-full">
        
        {/* QUADRANT 1: INTELLIGENCE */}
        <Link href="/research" className="bg-[#050505] p-8 md:p-12 hover:bg-zinc-900/50 transition-colors group relative overflow-hidden">
          <div className="text-[10px] font-mono text-zinc-600 mb-4 uppercase tracking-widest group-hover:text-red-500">
            01 / Intelligence
          </div>
          <h3 className="text-2xl md:text-3xl font-serif text-zinc-200 mb-2 group-hover:text-white">
            The Doctrine
          </h3>
          <p className="text-sm font-mono text-zinc-500 leading-relaxed max-w-sm">
            Forensic analysis of digital decay. 15 years of geopolitical foresight.
          </p>
          <span className="absolute bottom-8 right-8 text-zinc-800 group-hover:text-zinc-600 font-mono text-xs">→ PDF ACCESS</span>
        </Link>

        {/* QUADRANT 2: CAPITAL */}
        <Link href="/advising" className="bg-[#050505] p-8 md:p-12 hover:bg-zinc-900/50 transition-colors group relative overflow-hidden">
          <div className="text-[10px] font-mono text-zinc-600 mb-4 uppercase tracking-widest group-hover:text-red-500">
            02 / Capital
          </div>
          <h3 className="text-2xl md:text-3xl font-serif text-zinc-200 mb-2 group-hover:text-white">
            The Engine
          </h3>
          <p className="text-sm font-mono text-zinc-500 leading-relaxed max-w-sm">
            Algorithmic art advisory. Data is the new marble. Converting chaos into assets.
          </p>
          <span className="absolute bottom-8 right-8 text-zinc-800 group-hover:text-zinc-600 font-mono text-xs">→ VALUATION</span>
        </Link>

        {/* QUADRANT 3: ART */}
        <Link href="/heartandangel" className="bg-[#050505] p-8 md:p-12 hover:bg-zinc-900/50 transition-colors group relative overflow-hidden">
          <div className="text-[10px] font-mono text-zinc-600 mb-4 uppercase tracking-widest group-hover:text-red-500">
            03 / Art
          </div>
          <h3 className="text-2xl md:text-3xl font-serif text-zinc-200 mb-2 group-hover:text-white">
            The Symbol
          </h3>
          <p className="text-sm font-mono text-zinc-500 leading-relaxed max-w-sm">
            2022 unique artifacts. Love as the only coordinate that remains constant.
          </p>
          <span className="absolute bottom-8 right-8 text-zinc-800 group-hover:text-zinc-600 font-mono text-xs">→ VIEW COLLECTION</span>
        </Link>

        {/* QUADRANT 4: LEGACY */}
        <Link href="/unframed" className="bg-[#050505] p-8 md:p-12 hover:bg-zinc-900/50 transition-colors group relative overflow-hidden">
          <div className="text-[10px] font-mono text-zinc-600 mb-4 uppercase tracking-widest group-hover:text-red-500">
            04 / Legacy
          </div>
          <h3 className="text-2xl md:text-3xl font-serif text-zinc-200 mb-2 group-hover:text-white">
            The Codex
          </h3>
          <p className="text-sm font-mono text-zinc-500 leading-relaxed max-w-sm">
            A techno-political biography. The transition from Soviet Granite to Digital Ether.
          </p>
          <span className="absolute bottom-8 right-8 text-zinc-800 group-hover:text-zinc-600 font-mono text-xs">→ READ PROPOSAL</span>
        </Link>

      </div>

      {/* FOOTER */}
      <footer className="mt-16 text-center border-t border-zinc-900 pt-8">
        <p className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest">
          Merkurov Private Office. Est. 20XX. Protocol: Signal Only.
        </p>
      </footer>

    </main>
  );
}