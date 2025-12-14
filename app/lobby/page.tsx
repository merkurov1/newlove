import Link from "next/link";

export const metadata = {
  title: "Merkurov | System Access",
  description: "I architect futures in the digital void.",
};

export default function LobbyPage() {
  return (
    <main className="bg-[#050505] text-zinc-300 font-sans selection:bg-red-900 selection:text-white h-screen overflow-y-scroll snap-y snap-mandatory scroll-smooth">
      
      {/* --- SECTION 1: INTRO (THE HOOK) --- */}
      <section className="h-screen snap-start flex flex-col items-center justify-center p-8 text-center relative border-b border-zinc-900">
        <p className="text-xs font-mono text-red-600 mb-6 tracking-widest uppercase animate-pulse">
          Incoming Signal...
        </p>
        <h1 className="text-4xl md:text-7xl font-bold text-white mb-6 leading-tight max-w-4xl">
          I architect futures <br/> in the digital void.
        </h1>
        <p className="text-lg md:text-xl font-serif text-zinc-500 max-w-xl mx-auto leading-relaxed">
          The world is noisy. This interface is silent.
          <br/>Welcome to the private office of Anton Merkurov.
        </p>
        
        {/* Scroll Indicator */}
        <div className="absolute bottom-12 flex flex-col items-center gap-2 opacity-50 animate-bounce">
          <span className="text-[10px] font-mono uppercase tracking-widest">Initialise Protocol</span>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
        </div>
      </section>


      {/* --- SECTION 2: FORESIGHT (THE PROOF) --- */}
      <section className="h-screen snap-start flex flex-col items-center justify-center p-8 bg-[#080808] border-b border-zinc-900">
        <div className="max-w-4xl w-full">
          <h2 className="text-xs font-mono text-zinc-500 mb-12 uppercase tracking-widest text-center">
            01 / FORESIGHT METRICS
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connecting Line */}
            <div className="hidden md:block absolute top-4 left-0 w-full h-[1px] bg-zinc-800 z-0"></div>

            {/* Item 1 */}
            <div className="relative z-10 bg-[#080808] pr-4">
              <span className="block w-2 h-2 bg-zinc-600 rounded-full mb-4"></span>
              <div className="font-mono text-red-500 text-sm mb-2">2012</div>
              <h3 className="text-xl text-white font-bold mb-2">The Splinternet</h3>
              <p className="text-sm text-zinc-500">Predicted the fragmentation of the global web and the rise of digital borders.</p>
            </div>

            {/* Item 2 */}
            <div className="relative z-10 bg-[#080808] pr-4">
              <span className="block w-2 h-2 bg-zinc-600 rounded-full mb-4"></span>
              <div className="font-mono text-red-500 text-sm mb-2">2018</div>
              <h3 className="text-xl text-white font-bold mb-2">Crypto Utility</h3>
              <p className="text-sm text-zinc-500">Forecasted the shift from "speculation" to "infrastructure" long before the ETF.</p>
            </div>

            {/* Item 3 */}
            <div className="relative z-10 bg-[#080808] pr-4">
              <span className="block w-2 h-2 bg-white rounded-full mb-4 shadow-[0_0_10px_white]"></span>
              <div className="font-mono text-red-500 text-sm mb-2">2025</div>
              <h3 className="text-xl text-white font-bold mb-2">The Digital Collar</h3>
              <p className="text-sm text-zinc-500">Documenting the era of voluntary submission to algorithms.</p>
            </div>
          </div>
        </div>
      </section>


      {/* --- SECTION 3: PHILOSOPHY (THE BRIDGE) --- */}
      <section className="h-screen snap-start flex flex-col items-center justify-center p-8 bg-[#050505] border-b border-zinc-900">
        <h2 className="text-xs font-mono text-zinc-500 mb-8 uppercase tracking-widest">
          02 / THE DIGITAL MONUMENTALIST
        </h2>
        
        <blockquote className="text-2xl md:text-4xl font-serif text-center max-w-3xl leading-relaxed text-zinc-200">
          "My great-grandfather carved the Empire in <span className="text-white border-b border-zinc-700">granite</span>.
          <br className="hidden md:block" />
          I preserve its ghost in the <span className="text-white border-b border-zinc-700">digital ether</span>."
        </blockquote>

        <p className="mt-8 text-sm font-mono text-zinc-500 text-center max-w-md">
          Transmuting history into assets. <br/>
          From physical monuments to blockchain provenance.
        </p>
      </section>


      {/* --- SECTION 4: DOMAINS (THE GRID) --- */}
      <section className="min-h-screen snap-start flex flex-col items-center justify-center p-4 md:p-12 bg-[#050505]">
        <h2 className="text-xs font-mono text-zinc-500 mb-8 uppercase tracking-widest mt-12 md:mt-0">
          03 / SELECT YOUR PROTOCOL
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-zinc-800 border border-zinc-800 w-full max-w-5xl">
          
          <Link href="/research" className="bg-black p-8 hover:bg-zinc-900 transition group">
            <div className="text-red-900 font-mono text-[10px] mb-2 uppercase group-hover:text-red-500">Intelligence</div>
            <h3 className="text-2xl text-white font-serif mb-2">Foresight</h3>
            <p className="text-xs text-zinc-500">Forensic analysis & geopolitical risk.</p>
          </Link>

          <Link href="/advising" className="bg-black p-8 hover:bg-zinc-900 transition group">
            <div className="text-red-900 font-mono text-[10px] mb-2 uppercase group-hover:text-red-500">Capital</div>
            <h3 className="text-2xl text-white font-serif mb-2">Valuation</h3>
            <p className="text-xs text-zinc-500">Art advisory & algorithmic assessment.</p>
          </Link>

          <Link href="/heartandangel" className="bg-black p-8 hover:bg-zinc-900 transition group">
            <div className="text-red-900 font-mono text-[10px] mb-2 uppercase group-hover:text-red-500">Creation</div>
            <h3 className="text-2xl text-white font-serif mb-2">Art</h3>
            <p className="text-xs text-zinc-500">The symbol. The naive rebellion.</p>
          </Link>

          <Link href="/unframed" className="bg-black p-8 hover:bg-zinc-900 transition group">
            <div className="text-red-900 font-mono text-[10px] mb-2 uppercase group-hover:text-red-500">Heritage</div>
            <h3 className="text-2xl text-white font-serif mb-2">Legacy</h3>
            <p className="text-xs text-zinc-500">The book & the biography.</p>
          </Link>

        </div>
      </section>


      {/* --- SECTION 5: FINALE (CTA) --- */}
      <section className="h-[50vh] snap-start flex flex-col items-center justify-center p-8 bg-zinc-900 text-center">
        <h2 className="text-3xl font-serif text-white mb-8">
          Stay in the loop.
        </h2>
        
        <div className="flex flex-col md:flex-row gap-4 w-full max-w-md">
          <Link href="/journal" className="flex-1 py-4 bg-white text-black font-mono text-xs uppercase tracking-widest hover:bg-zinc-200 transition">
            Read Journal
          </Link>
          <a href="mailto:anton@merkurov.love" className="flex-1 py-4 border border-zinc-600 text-white font-mono text-xs uppercase tracking-widest hover:bg-black hover:border-black transition">
            Let's Talk
          </a>
        </div>

        <footer className="mt-16 text-[10px] font-mono text-zinc-500">
          © 2025 MERKUROV PRIVATE OFFICE
        </footer>
      </section>

    </main>
  );
}