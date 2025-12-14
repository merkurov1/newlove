import Link from "next/link";

export const metadata = {
  title: "Merkurov | System Access",
  description: "The Digital Monumentalist. System Status: Live.",
};

export default function LobbyPage() {
  return (
    <main className="bg-zinc-50 text-zinc-900 font-serif h-screen overflow-y-scroll snap-y snap-mandatory scroll-smooth selection:bg-red-600 selection:text-white">
      
      {/* --- SECTION 1: INTRO (THE MANIFESTO) --- */}
      <section className="h-screen snap-start flex flex-col items-center justify-center p-6 md:p-12 text-center relative border-b border-zinc-200">
        
        {/* Status Header */}
        <div className="absolute top-6 w-full flex justify-between px-6 md:px-12 text-[10px] font-mono tracking-widest text-zinc-400 uppercase">
          <span>System: Online</span>
          <span>Loc: Global / Unframed</span>
        </div>

        <div className="max-w-4xl mx-auto space-y-8">
          <p className="text-xs font-mono text-red-600 tracking-[0.2em] uppercase">
            // Operating System v.3.0
          </p>
          
          <h1 className="text-5xl md:text-8xl font-bold text-zinc-900 leading-[0.9] tracking-tight">
            I architect futures <br/> in the digital void.
          </h1>
          
          <div className="max-w-2xl mx-auto space-y-6 text-lg md:text-xl text-zinc-600 leading-relaxed">
            <p>
              The world is drowning in noise. Algorithms dictate your attention. 
              Politics dictate your geography.
            </p>
            <p>
              Here, there are no algorithms. Only structure. 
              I am Anton Merkurov. This is my private office. 
              I transmute Chaos (History, Data, Art) into Assets.
            </p>
          </div>

          {/* Audio Button Placeholder */}
          <button className="group mt-8 flex items-center gap-3 mx-auto px-6 py-3 border border-zinc-300 rounded-full hover:border-red-600 hover:text-red-600 transition-all cursor-pointer">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            <span className="text-xs font-mono tracking-widest uppercase">Listen to Protocol</span>
          </button>
        </div>
        
        {/* Scroll Indicator */}
        <div className="absolute bottom-8 animate-bounce text-zinc-400">
          ↓
        </div>
      </section>


      {/* --- SECTION 2: FORESIGHT (THE PROOF) --- */}
      <section className="h-screen snap-start flex items-center justify-center p-6 md:p-12 bg-zinc-100 border-b border-zinc-200">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 max-w-7xl w-full items-center">
          
          {/* Left: Introduction */}
          <div className="space-y-6">
            <h2 className="text-xs font-mono text-red-600 uppercase tracking-widest">
              01 / The Track Record
            </h2>
            <h3 className="text-4xl md:text-6xl font-bold text-zinc-900 leading-tight">
              Predicting the collapse <br/> before it happens.
            </h3>
            <p className="text-lg text-zinc-600 leading-relaxed">
              I don't use crystal balls. I use forensic data analysis. 
              For 15 years, I have documented the inevitable collision between 
              Authoritarianism and Technology. Being right is boring, but profitable.
            </p>
          </div>

          {/* Right: Timeline */}
          <div className="space-y-8 border-l-2 border-zinc-300 pl-8 relative">
            
            {/* 2012 */}
            <div className="relative">
              <span className="absolute -left-[39px] top-2 w-4 h-4 bg-zinc-300 rounded-full border-4 border-zinc-100"></span>
              <div className="font-mono text-zinc-400 text-sm mb-1">2012 — The Splinternet</div>
              <h4 className="text-xl font-bold text-zinc-900">The Fragmentation Prediction</h4>
              <p className="text-sm text-zinc-600 mt-2 max-w-md">
                Predicted that the global web would fracture into sovereign intranets. 
                Warned that economic isolation would precede physical isolation.
              </p>
            </div>

            {/* 2018 */}
            <div className="relative">
              <span className="absolute -left-[39px] top-2 w-4 h-4 bg-zinc-300 rounded-full border-4 border-zinc-100"></span>
              <div className="font-mono text-zinc-400 text-sm mb-1">2018 — The Resistance</div>
              <h4 className="text-xl font-bold text-zinc-900">The Telegram War</h4>
              <p className="text-sm text-zinc-600 mt-2 max-w-md">
                Forecasted the rise of "Digital Emigres" and the failure of state blocking attempts. 
                Identified the shift from "Compliance" to "Evasion" as a business model.
              </p>
            </div>

            {/* 2025 */}
            <div className="relative">
              <span className="absolute -left-[39px] top-2 w-4 h-4 bg-red-600 rounded-full border-4 border-red-100 animate-pulse"></span>
              <div className="font-mono text-red-600 text-sm mb-1">2025 — The Reality</div>
              <h4 className="text-xl font-bold text-zinc-900">The Digital Collar</h4>
              <p className="text-sm text-zinc-600 mt-2 max-w-md">
                The era of voluntary submission. The infrastructure of control is no longer external; 
                it is internal. We register ourselves.
              </p>
            </div>

          </div>
        </div>
      </section>


      {/* --- SECTION 3: MEDIA TICKER (THE VALIDATION) --- */}
      <section className="snap-start py-12 bg-zinc-900 border-y border-zinc-800 flex items-center overflow-hidden whitespace-nowrap relative">
        <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-zinc-900 to-transparent z-10"></div>
        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-zinc-900 to-transparent z-10"></div>
        
        <div className="animate-marquee inline-block">
          <span className="text-xl md:text-3xl font-mono text-zinc-400 mx-8">
            <span className="text-white font-bold">THE NEW YORK TIMES (2018):</span> "Putin never really uses the internet, so he doesn't understand how it works." — Anton Merkurov
          </span>
          <span className="text-xl md:text-3xl font-mono text-zinc-500 mx-8">///</span>
          <span className="text-xl md:text-3xl font-mono text-zinc-400 mx-8">
            <span className="text-white font-bold">THE WASHINGTON POST (2018):</span> "The result will be millions of digital emigres turning their backs on the state."
          </span>
          <span className="text-xl md:text-3xl font-mono text-zinc-500 mx-8">///</span>
          <span className="text-xl md:text-3xl font-mono text-zinc-400 mx-8">
            <span className="text-white font-bold">EURACTIV (2020):</span> "The main danger is physical access to the device. Biology is the weak link."
          </span>
           <span className="text-xl md:text-3xl font-mono text-zinc-500 mx-8">///</span>
        </div>
      </section>


      {/* --- SECTION 4: PHILOSOPHY (THE BRIDGE) --- */}
      <section className="h-screen snap-start flex items-center justify-center p-6 md:p-12 bg-white">
        <div className="max-w-5xl text-center space-y-12">
          <h2 className="text-xs font-mono text-zinc-400 uppercase tracking-widest">
            02 / The Philosophy
          </h2>
          
          <h3 className="text-4xl md:text-7xl font-bold text-zinc-900">
            From Granite to Ether.
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 text-left mt-12">
            <div className="p-8 bg-zinc-50 border border-zinc-200">
              <h4 className="font-mono text-red-600 text-xs uppercase mb-4">The Past</h4>
              <p className="text-lg text-zinc-800 font-serif leading-relaxed">
                My great-grandfather, Sergey Merkurov, carved the Soviet Empire in <span className="font-bold">Granite</span>. 
                He created the death masks of Lenin and Tolstoy. 
                He solidified history into heavy, immovable monuments.
              </p>
            </div>
            <div className="p-8 bg-zinc-900 text-zinc-100 border border-zinc-800">
              <h4 className="font-mono text-zinc-400 text-xs uppercase mb-4">The Future</h4>
              <p className="text-lg font-serif leading-relaxed">
                I operate in the <span className="font-bold text-white">Ether</span>. 
                I transmute that heavy heritage into digital assets. 
                My monuments are made of code, blockchain, and data. 
                Granite crumbles. Data is forever.
              </p>
            </div>
          </div>
        </div>
      </section>


      {/* --- SECTION 5: DOMAINS (THE PROTOCOLS) --- */}
      <section className="min-h-screen snap-start flex flex-col justify-center p-6 md:p-12 bg-zinc-50">
        <h2 className="text-xs font-mono text-red-600 uppercase tracking-widest mb-12 text-center md:text-left">
          03 / Select Your Protocol
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 h-full">
          
          {/* CARD 1 */}
          <Link href="/research" className="group bg-white border border-zinc-200 p-8 hover:border-red-600 hover:shadow-xl transition-all duration-300 flex flex-col justify-between h-[400px]">
            <div>
              <div className="text-zinc-400 font-mono text-xs mb-4">01</div>
              <h3 className="text-3xl font-serif text-zinc-900 mb-4 group-hover:text-red-600">Intelligence</h3>
              <p className="text-sm text-zinc-600 leading-relaxed">
                <strong className="block text-zinc-900 mb-2">The Foresight</strong>
                Access forensic analysis of digital decay and geopolitical risk. 
                For universities, think tanks, and those who need truth, not news.
              </p>
            </div>
            <span className="text-xs font-mono text-zinc-400 group-hover:text-red-600">ACCESS RESEARCH →</span>
          </Link>

          {/* CARD 2 */}
          <Link href="/advising" className="group bg-white border border-zinc-200 p-8 hover:border-red-600 hover:shadow-xl transition-all duration-300 flex flex-col justify-between h-[400px]">
            <div>
              <div className="text-zinc-400 font-mono text-xs mb-4">02</div>
              <h3 className="text-3xl font-serif text-zinc-900 mb-4 group-hover:text-red-600">Capital</h3>
              <p className="text-sm text-zinc-600 leading-relaxed">
                <strong className="block text-zinc-900 mb-2">The Engine</strong>
                Algorithmic art advisory and valuation. 
                Data is the new marble. Converting chaos into liquid assets for Family Offices.
              </p>
            </div>
            <span className="text-xs font-mono text-zinc-400 group-hover:text-red-600">ACCESS ADVISORY →</span>
          </Link>

          {/* CARD 3 */}
          <Link href="/heartandangel" className="group bg-white border border-zinc-200 p-8 hover:border-red-600 hover:shadow-xl transition-all duration-300 flex flex-col justify-between h-[400px]">
            <div>
              <div className="text-zinc-400 font-mono text-xs mb-4">03</div>
              <h3 className="text-3xl font-serif text-zinc-900 mb-4 group-hover:text-red-600">Creation</h3>
              <p className="text-sm text-zinc-600 leading-relaxed">
                <strong className="block text-zinc-900 mb-2">The Symbol</strong>
                2022 unique artifacts created in the void. 
                Love is the only coordinate that remains constant when the map burns.
              </p>
            </div>
            <span className="text-xs font-mono text-zinc-400 group-hover:text-red-600">VIEW ART →</span>
          </Link>

          {/* CARD 4 */}
          <Link href="/unframed" className="group bg-white border border-zinc-200 p-8 hover:border-red-600 hover:shadow-xl transition-all duration-300 flex flex-col justify-between h-[400px]">
            <div>
              <div className="text-zinc-400 font-mono text-xs mb-4">04</div>
              <h3 className="text-3xl font-serif text-zinc-900 mb-4 group-hover:text-red-600">Legacy</h3>
              <p className="text-sm text-zinc-600 leading-relaxed">
                <strong className="block text-zinc-900 mb-2">The Codex</strong>
                "Unframed": A techno-political biography. 
                The story of how I survived the collapse of the Empire and the rise of the Matrix.
              </p>
            </div>
            <span className="text-xs font-mono text-zinc-400 group-hover:text-red-600">READ STORY →</span>
          </Link>

        </div>
      </section>


      {/* --- SECTION 6: FINALE (CTA) --- */}
      <section className="h-[60vh] snap-start flex flex-col items-center justify-center p-8 bg-zinc-900 text-center relative overflow-hidden">
        
        {/* Background Noise/Grid */}
        <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '30px 30px'}}></div>

        <div className="z-10 max-w-2xl w-full space-y-8">
          <h2 className="text-4xl md:text-5xl font-serif text-white mb-8">
            Stay in the loop.
          </h2>
          <p className="text-zinc-400 text-sm md:text-lg mb-12">
            I am currently building this system in real-time. 
            Join the signal. Ignore the noise.
          </p>
          
          <div className="flex flex-col md:flex-row gap-6 w-full">
            <Link href="/journal" className="flex-1 py-5 bg-white text-black font-mono text-xs uppercase tracking-widest hover:bg-zinc-200 transition">
              Read System Logs (Journal)
            </Link>
            <a href="mailto:anton@merkurov.love" className="flex-1 py-5 border border-zinc-600 text-white font-mono text-xs uppercase tracking-widest hover:bg-black hover:border-white transition">
              Request Access
            </a>
          </div>
        </div>

        <footer className="absolute bottom-8 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
          © 2025 Merkurov Private Office. London / Global.
        </footer>
      </section>

      {/* Marquee animation moved to global CSS (app/main.css) */}

    </main>
  );
}