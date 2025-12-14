import Link from "next/link";

export const metadata = {
  title: "Merkurov | System Access",
  description: "The Digital Monumentalist. System Status: Live Construction.",
};

export default function LobbyPage() {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 font-serif p-6 md:p-12 flex flex-col selection:bg-red-500 selection:text-white">
      
      {/* 1. STATUS BAR (SYSTEM LOGS) */}
      <div className="w-full border-b border-zinc-200 pb-4 mb-16 flex flex-col md:flex-row justify-between items-center gap-4 font-sans">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
          </span>
          <span className="text-[10px] font-mono tracking-widest uppercase text-zinc-500">
            System Status: Architecting Self [Live Build]
          </span>
        </div>
        
        <Link href="/journal" className="text-xs font-mono text-zinc-900 hover:text-red-600 transition-colors border-b border-zinc-300 hover:border-red-600 pb-0.5">
          READ JOURNAL LOGS →
        </Link>
      </div>

      {/* 2. THE CORE (MONUMENTALIST) */}
      <div className="flex-grow flex flex-col items-center justify-center mb-24 text-center">
        <h1 className="text-5xl md:text-8xl font-bold text-zinc-900 tracking-tight leading-none mb-6">
          The Digital<br className="hidden md:block" /> Monumentalist
        </h1>
        <p className="text-lg md:text-2xl text-zinc-500 italic max-w-2xl mx-auto leading-relaxed">
          Bridging the gap between the Soviet Granite of the past <br/>
          and the Digital Ether of the future.
        </p>
        <div className="mt-8 h-px w-24 bg-red-600"></div>
      </div>

      {/* 3. THE QUADRANT (NAVIGATION) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-6xl mx-auto w-full mb-24 font-sans">
        
        {/* QUADRANT 1: INTELLIGENCE */}
        <Link href="/research" className="group border-t border-zinc-200 pt-6 hover:border-red-600 transition-colors duration-500">
          <div className="text-[10px] font-mono text-zinc-400 mb-2 uppercase tracking-widest group-hover:text-red-600">
            01 / Intelligence
          </div>
          <h3 className="text-3xl font-serif text-zinc-900 mb-3 group-hover:italic transition-all">
            The Foresight
          </h3>
          <p className="text-sm text-zinc-600 leading-relaxed max-w-sm">
            From "Digital Decay" to the Sovereign Internet. A forensic timeline of predictions that history validated.
          </p>
        </Link>

        {/* QUADRANT 2: CAPITAL */}
        <Link href="/advising" className="group border-t border-zinc-200 pt-6 hover:border-red-600 transition-colors duration-500">
          <div className="text-[10px] font-mono text-zinc-400 mb-2 uppercase tracking-widest group-hover:text-red-600">
            02 / Capital
          </div>
          <h3 className="text-3xl font-serif text-zinc-900 mb-3 group-hover:italic transition-all">
            The Valuation
          </h3>
          <p className="text-sm text-zinc-600 leading-relaxed max-w-sm">
            Transmuting heritage into asset classes. Algorithmic advisory for the age of data is the new marble.
          </p>
        </Link>

        {/* QUADRANT 3: ART */}
        <Link href="/heartandangel" className="group border-t border-zinc-200 pt-6 hover:border-red-600 transition-colors duration-500">
          <div className="text-[10px] font-mono text-zinc-400 mb-2 uppercase tracking-widest group-hover:text-red-600">
            03 / Creation
          </div>
          <h3 className="text-3xl font-serif text-zinc-900 mb-3 group-hover:italic transition-all">
            The Reinvention
          </h3>
          <p className="text-sm text-zinc-600 leading-relaxed max-w-sm">
            "Love is never enough." 2022 artifacts created in the void. A naive rebellion against cynical times.
          </p>
        </Link>

        {/* QUADRANT 4: LEGACY */}
        <Link href="/unframed" className="group border-t border-zinc-200 pt-6 hover:border-red-600 transition-colors duration-500">
          <div className="text-[10px] font-mono text-zinc-400 mb-2 uppercase tracking-widest group-hover:text-red-600">
            04 / Heritage
          </div>
          <h3 className="text-3xl font-serif text-zinc-900 mb-3 group-hover:italic transition-all">
            The Foundation
          </h3>
          <p className="text-sm text-zinc-600 leading-relaxed max-w-sm">
            Managing the shadow of the colossal. How to sell the ghost of an Empire without selling your soul.
          </p>
        </Link>

      </div>

      {/* FOOTER */}
      <footer className="text-center font-sans">
        <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
          Merkurov Private Office. Est. 20XX.
        </p>
      </footer>

    </main>
  );
}