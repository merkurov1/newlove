"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, BookOpen, Lock } from 'lucide-react';
import { Inter, Playfair_Display, Space_Mono } from 'next/font/google';

// --- FONTS ---
const sans = Inter({ subsets: ['latin'], variable: '--font-sans' });
const serif = Playfair_Display({ subsets: ['latin'], variable: '--font-serif' });
const mono = Space_Mono({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-mono' });

// --- UPDATED SAMPLES (NO WAR / NO POLITICS) ---
const SAMPLES = [
  {
    id: 'floor',
    title: 'THE FLOOR',
    subtitle: 'Moscow, 1984',
    content: `
      I have a vivid memory, clear as 4K video. I am four years old. I am lying on the warm parquet floor. The apartment is usually noisy—phones ringing, adults arguing about high culture or low salaries, the constant hum of the Soviet intelligentsia trying to survive.
      
      But in this moment, there is silence. I am drawing.
      
      The parquet was warm. The sun was coming through the tall windows—those two-meter Stalinist windows designed to make you feel small and the State feel eternal. But I didn't feel small. I felt infinite. The pencil moved across the paper, and the world appeared. Not the world as it was given to me by adults, by teachers, by the System. The world as I decided it should be.
      
      My mother walked past and smiled. She didn't interrupt. She just kept walking. My grandfather, a Colonel of the Interior Ministry, didn't scold me for blocking the hallway. He stepped over me carefully, like I was a sacred object that shouldn't be disturbed.
      
      The true legacy of the family wasn't found in plaster or marble scattered on the floor. It was in the paper. Walls were lined with encyclopedias. This library became the graveyard of my childish beliefs. I had access to two distinct versions of reality, sitting side by side on those shelves.
      
      On the left: Brockhaus and Efron, the pre-revolutionary encyclopedia. Thick, leather-bound volumes printed before 1917. The world of the Tsar, gold, aesthetics, and God.
      
      On the right: The Great Soviet Encyclopedia. Red spines. The world of the Party, concrete, quotas, and Dialectical Materialism.
      
      I invented a game. I would open them to the same letter. I would compare the definitions. It was my first experience with how history is edited in real time. Take the word "Merchant". In Brockhaus, he was a pillar of society. In the Soviet edition, he was a class enemy. Same word. Two different truths.
      
      I was seven years old, sitting on the parquet floor, surrounded by the intellectual debris of two dead empires, learning the most important skill of my life: how to read between the lines.
    `
  },
  {
    id: 'rooftops',
    title: 'THE ROOFTOPS',
    subtitle: 'The Digital Wild West, 1998',
    content: `
      Dial-up was a bottleneck. We needed speed, and the market refused to give it to us. The major ISPs laughed at me. "Berezhkovskaya Embankment? No coverage. Impossible." They saw a dead zone. I saw a captive market. I decided to build my own provider.
      
      I gathered a crew. We weren't engineers; we were teenagers with a drill and a total lack of fear. The plan was simple: if the ISPs wouldn't come to us, we would build the infrastructure ourselves.
      
      We went up to the roofs. Imagine the Moscow winter. Minus 20 degrees Celsius. The wind from the Moscow River cuts through your jacket like a knife. The roof is covered in ice. Your fingers go numb in minutes. And there we were, balancing on the edge of a seven-story Stalinka, running coaxial cables from building to building.
      
      We drilled through walls built to withstand Nazi artillery. The Stalinka construction was absurdly solid—brick walls half a meter thick. Our drill bits overheated and broke. The noise was deafening, but the neighbors didn't complain. Most of them were old Soviet intelligentsia who understood that progress requires sacrifice. Plus, we promised them free internet once the network was live.
      
      We pulled kilometers of black cable through ventilation shafts and attics. We built a physical network with our bare, frozen hands. We connected the neighborhood. By the time we finished, I had created one of the first private ISPs in the district.
      
      My computer wasn't just a screen anymore; it was a server. A Node. It gave me something I hadn't had before: legitimacy. The physical world is messy and ruled by gravity. The digital world is clean, logical, and ruled by those who write the code. I made my choice. I moved into the machine.
    `
  },
  {
    id: 'tiger',
    title: 'THE SPECTRAL TIGER',
    subtitle: 'The Economy of Air, 2008',
    content: `
      2008 was the year the world cracked. The subprime mortgage bubble burst, banks collapsed, and the global economy turned into a live autopsy. At the office, we were cutting budgets and writing reports about the end of capitalism.
      
      But I had an escape route. Every evening, I would take off my suit and log into a better jurisdiction: World of Warcraft.
      
      And then, I found the ultimate asset. The Spectral Tiger.
      
      It came from a loot code in a physical trading card game. It was rare. It was expensive. But here is the key economic detail: The Tiger gave you nothing. It didn't run faster than a standard horse. It didn't add stamina or strength. Its utility was exactly zero. Its only function was Status.
      
      I bought it on eBay for $500. In 2008, spending five hundred dollars on a digital cat was considered insanity. You could buy a used car for that money.
      
      Why? To stand in Ironforge. I would summon the Tiger and just... park. I stood there, in the center of the main square, doing absolutely nothing. Other players would run past, stop, and look. They knew the price. They knew the rarity. It was the digital equivalent of parking a yellow Ferrari on Red Square. You don't drive it to get groceries. You drive it to show that you can.
      
      While the real economy was burning outside my window, I sat on my glowing ghost tiger, radiating success. It was my first real lesson in the modern economy: Utility is for the poor. The real markup is always on the Air.
    `
  }
];

export default function ProposalPage() {
  const [activeTab, setActiveTab] = useState(SAMPLES[0].id);
  const [status, setStatus] = useState('idle');

  const activeContent = SAMPLES.find(s => s.id === activeTab);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    // Simulate API call
    setTimeout(() => setStatus('success'), 1500);
  };

  return (
    <div className={`min-h-screen bg-[#F5F5F0] text-[#1A1A1A] font-sans selection:bg-red-600 selection:text-white ${sans.variable} ${serif.variable} ${mono.variable}`}>
      
      {/* --- HEADER --- */}
      <header className="fixed top-0 w-full z-50 bg-[#F5F5F0]/90 backdrop-blur-md border-b border-[#E5E5E5] px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse" />
            <span className="font-mono text-xs tracking-widest uppercase text-zinc-500">
                Publishing Proposal
            </span>
        </div>
        <div className="hidden md:flex gap-6 font-mono text-[10px] uppercase tracking-widest text-zinc-400">
            <span>Anton Merkurov</span>
            <span>Est. 60,000 Words</span>
            <span>Rights: Available</span>
        </div>
      </header>

      <main className="pt-28 pb-24 max-w-5xl mx-auto px-6">
        
        {/* --- TITLE SECTION --- */}
        <section className="mb-6 text-center">
            <h1 className="text-6xl md:text-9xl font-black tracking-tighter uppercase mb-4 font-sans leading-none">
                Unframed
            </h1>
            {/* Subheading mirrored from /unframed */}
            <div className="flex items-center gap-6 mt-2 justify-center mb-4">
               <div className="h-[2px] w-12 bg-red-600 shadow-[0_0_15px_red]" />
               <p className="font-mono text-xs md:text-sm uppercase tracking-[0.3em] text-zinc-500">A Memoir by Anton Merkurov</p>
               <div className="h-[2px] w-12 bg-red-600 shadow-[0_0_15px_red]" />
            </div>
            <p className="font-serif text-2xl md:text-3xl text-zinc-600 max-w-2xl mx-auto leading-relaxed">
                The Granite, The Glitch, and <br className="hidden md:block"/> The Ghost of an Empire.
            </p>
            {/* divider removed to reduce vertical line/spacing */}
        </section>

        {/* --- SYNOPSIS GRID --- */}
        <section className="grid md:grid-cols-12 gap-12 mb-24 border-t border-[#E5E5E5] pt-6">
            <div className="md:col-span-4">
                <h3 className="font-mono text-xs uppercase tracking-widest text-zinc-400 mb-4">The Pitch</h3>
                <div className="space-y-4 font-serif text-lg leading-relaxed text-zinc-800">
                    <p>
                        <b>UNFRAMED</b> is a memoir about the collision between heavy granite legacy and the weightless digital ether.
                    </p>
                    <p>
                        It is the story of a man who spent twenty years trying to upload the Empire to the cloud, only to watch the server farm burn down.
                    </p>
                    <p className="text-zinc-500 text-base">
                        From building illegal internet providers on icy rooftops in the 90s to tokenizing historical artifacts during the crypto-boom, this is a look at the "Russian Code" through the eyes of a Digital Strategist.
                    </p>
                </div>
            </div>
            
            <div className="md:col-span-8 bg-white border border-[#E5E5E5] p-8 md:p-12 shadow-sm">
                 <div className="flex justify-between items-center mb-10 border-b border-zinc-100 pb-4">
                     <h3 className="font-mono text-xs uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                        <BookOpen size={14} /> Sample Chapters
                     </h3>
                     <div className="flex gap-2">
                        {SAMPLES.map(s => (
                            <button 
                                key={s.id}
                                onClick={() => setActiveTab(s.id)}
                                className={`px-3 py-1 text-[10px] font-mono uppercase tracking-widest border transition-all ${
                                    activeTab === s.id 
                                    ? 'bg-red-600 text-white border-red-600' 
                                    : 'bg-transparent text-zinc-400 border-zinc-200 hover:border-zinc-400'
                                }`}
                            >
                                {s.id.toUpperCase()}
                            </button>
                        ))}
                     </div>
                 </div>

                 <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3 }}
                    >
                        <h4 className="text-3xl font-bold font-sans uppercase mb-2 text-black">{activeContent?.title}</h4>
                        <span className="font-mono text-xs text-red-600 tracking-widest uppercase mb-8 block">
                             {activeContent?.subtitle}
                        </span>
                        
                        <div className="font-serif text-lg leading-loose text-zinc-700 space-y-6 text-justify">
                            {activeContent?.content.split('\n').map((paragraph, i) => (
                                paragraph.trim() && <p key={i}>{paragraph.trim()}</p>
                            ))}
                        </div>
                    </motion.div>
                 </AnimatePresence>
            </div>
        </section>

        {/* --- AUTHOR & COMPARABLES --- */}
        <section className="grid md:grid-cols-2 gap-12 mb-32 border-t border-[#E5E5E5] pt-12">
             <div>
                <h3 className="font-mono text-xs uppercase tracking-widest text-zinc-400 mb-6">Market Context</h3>
                <ul className="space-y-4">
                    {[
                        { title: 'When We Cease to Understand the World', author: 'Benjamin Labatut', reason: 'For the analytical obsession with reality breaking apart.' },
                        { title: 'Limonov', author: 'Emmanuel Carrère', reason: 'For the portrait of a specific archetype.' },
                        { title: 'Nothing Is True and Everything Is Possible', author: 'Peter Pomerantsev', reason: 'For the surreal context of the elite.' }
                    ].map((book, i) => (
                        <li key={i} className="border-b border-zinc-200 pb-4 last:border-0">
                            <p className="font-bold text-lg font-serif italic">{book.title}</p>
                            <p className="text-xs font-mono uppercase text-zinc-500 mb-2">{book.author}</p>
                            <p className="text-sm text-zinc-600">{book.reason}</p>
                        </li>
                    ))}
                </ul>
             </div>

             <div className="bg-zinc-900 text-white p-10 flex flex-col justify-between">
                <div>
                    <h3 className="font-mono text-xs uppercase tracking-widest text-zinc-500 mb-4">The Author</h3>
                    <p className="font-serif text-xl leading-relaxed mb-6">
                        Anton Merkurov is a digital strategist and the great-grandson of Sergey Merkurov, the sculptor of the Soviet Empire. He spent two decades building independent internet infrastructure before watching it become a digital enclosure.
                    </p>
                </div>
                <div className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                    Status: Unframed
                </div>
             </div>
        </section>

        {/* --- CALL TO ACTION --- */}
        <section className="max-w-xl mx-auto text-center">
            <div className="mb-8 flex justify-center text-zinc-300">
                <Lock size={24} />
            </div>
            <h2 className="text-3xl font-bold uppercase mb-4 font-sans">Full Manuscript Available</h2>
            <p className="font-serif text-zinc-600 mb-10">
                The complete 60,000-word manuscript is available for review by authorized literary agents and publishers.
            </p>

            {status === 'success' ? (
                <div className="bg-green-50 text-green-800 px-6 py-4 border border-green-200 font-mono text-sm">
                    Request received. A secure link will be sent to your email shortly.
                </div>
            ) : (
                <form onSubmit={handleRequest} className="space-y-4">
                    <input 
                        type="email" 
                        placeholder="Enter your professional email" 
                        className="w-full px-4 py-3 bg-white border border-zinc-300 focus:outline-none focus:border-red-600 font-mono text-sm transition-colors text-center"
                        required
                    />
                    <button 
                        type="submit"
                        disabled={status === 'loading'}
                        className="w-full bg-black text-white px-8 py-4 font-bold uppercase tracking-[0.2em] text-xs hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                    >
                        {status === 'loading' ? 'Processing...' : 'Request Access'} <Download size={14} />
                    </button>
                </form>
            )}
            
            <p className="mt-8 font-mono text-[10px] text-zinc-400 uppercase tracking-widest">
                Representation: Direct Contact <br/>
                merkurov@gmail.com
            </p>
        </section>

      </main>
    </div>
  );
}