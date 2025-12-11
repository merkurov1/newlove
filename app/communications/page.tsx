"use client";

import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Space_Mono, Inter, Playfair_Display } from 'next/font/google';
import { 
  Zap, Radio, Globe, Smartphone, Fingerprint, 
  MessageSquare, Server, Eye, Share2, AlertTriangle, 
  Terminal, Cpu, Clock, MousePointer
} from 'lucide-react';

// --- FONTS ---
const sans = Inter({ subsets: ['latin'], variable: '--font-sans' });
const serif = Playfair_Display({ subsets: ['latin'], variable: '--font-serif' });
const mono = Space_Mono({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-mono' });

// --- DATA FROM PDF (FULL VOLUME) ---
const LECTURE_DATA = [
  {
    id: '01',
    title: 'THE ORIGINS',
    duration: '15 MIN',
    icon: Clock,
    summary: 'From Smoke Signals to The Telegraph.',
    blocks: [
      {
        head: 'Smoke & Tribes',
        text: 'The era of high latency. Communication speed is slow. The lifespan of news is incredibly long. Geography dictates destiny.'
      },
      {
        head: 'Post & Pigeons',
        text: 'The speed of communication increases. The territory of news distribution expands. The signal begins to travel faster than the walking human.'
      },
      {
        head: 'Books & Literacy',
        text: 'Population growth drives communication volume. More people are involved in the process. News begins to arrive from different countries. The world gets bigger.'
      },
      {
        head: 'Telegraph & Correspondence',
        text: 'The first global synchronization. Huge coverage of territory. The birth of the Media Business: Newspapers, Radio, Telephone Companies. Events begin to happen "fast."'
      }
    ]
  },
  {
    id: '02',
    title: 'THE CONNECTION',
    duration: '10 MIN',
    icon: Globe,
    summary: 'The Internet: From Desktop to Pocket.',
    blocks: [
      {
        head: 'Infrastructure Growth',
        text: 'The Internet appeared first in institutions, then in every home, and finally in every pocket. Bandwidth exploded. Cost of access dropped to near zero.'
      },
      {
        head: 'The Protocols of Chaos',
        text: 'The evolution of digital habitats: BBS → FidoNet → IRC → Forums → ICQ → LiveJournal. Each step lowered the barrier to entry. Now: Facebook, Twitter, VKontakte.'
      },
      {
        head: 'Multimedia Explosion',
        text: 'We moved from text to rich media. Skype and Video calls replaced the telegraph style. Half the world is now online (tens of millions in Russia alone).'
      }
    ]
  },
  {
    id: '03',
    title: 'THE DEVICE',
    duration: '20 MIN',
    icon: Smartphone,
    summary: 'The Death of the PC & The Rise of Mobile.',
    blocks: [
      {
        head: 'The Form Factor Shift',
        text: 'From mainframes to personal computers, and now to smartphones. The "Personal Computer" is dying. Mobile + Geolocation is the new standard.'
      },
      {
        head: 'The Loss of Non-Verbal',
        text: 'Crucial Loss: In text, we lose gestures, tone, volume, and appearance. We are forced to "invent" what happens on the other side of the screen. Emojis and Stickers appeared as prosthetics for emotions.'
      },
      {
        head: 'Virtual Personas',
        text: 'In a chat (SMS/IM), we demand instant answers. But we also gain the ability to lie. We can invent a persona. We can be anyone. The gap between Reality and Avatar widens.'
      },
      {
        head: 'The Solitude',
        text: 'One on one with the computer. And with the whole world simultaneously.'
      }
    ]
  },
  {
    id: '04',
    title: 'THE PROCESS',
    duration: '20 MIN',
    icon: Server,
    summary: 'How Information Moves Now.',
    blocks: [
      {
        head: 'The Archive is Eternal',
        text: 'Instant spread of information. Giant volumes of data. Key Axiom: Nothing can be deleted from the Internet. The digital footprint is permanent.'
      },
      {
        head: 'The Death of Gatekeepers',
        text: 'Previously, only TV/Newspapers could broadcast. Now, anyone is a media outlet. The influence of traditional media is shrinking; the influence of the individual is growing.'
      },
      {
        head: 'The 15 Minutes of Fame',
        text: 'The lifespan of news is incredibly short. You can become a star instantly, but you will be forgotten just as fast. Huge, instantaneous audience reach, followed by silence.'
      },
      {
        head: 'Human as Sensor',
        text: 'Automatic generation of information. Check-ins, sensors, wearables. We generate data simply by existing and moving through the city.'
      }
    ]
  },
  {
    id: '05',
    title: 'CYBERSPACE',
    duration: '10 MIN',
    icon: Cpu,
    summary: 'The Merger of Realities.',
    blocks: [
      {
        head: 'The IoT Ratio',
        text: 'There are now more connected devices than people. The network is becoming autonomous.'
      },
      {
        head: 'The New Reality',
        text: 'Everything important happens online: News, Communication, Shopping, Entertainment, and War. The physical world is becoming a secondary layer.'
      },
      {
        head: 'The Social Contract',
        text: 'By pressing "Like," we become part of the main process. Therefore, one must behave well. Do not do stupid things. The system remembers everything.'
      }
    ]
  }
];

export default function HistoryLecturePage() {
  const containerRef = useRef(null);
  const [scaleX, setScaleX] = useState(0);

  // Simple smooth scroll progress fallback (avoids framer-motion hooks)
  useEffect(() => {
    let raf = 0;
    let current = 0;

    const tick = () => {
      const scrollTop = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const target = Math.min(1, scrollTop / max);
      current += (target - current) * 0.12; // simple easing
      setScaleX(current);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={containerRef} className={`bg-[#050505] text-zinc-300 min-h-screen selection:bg-red-600 selection:text-white ${sans.variable} ${mono.variable} ${serif.variable}`}>
      
      {/* --- PROGRESS BAR --- */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-zinc-900 z-50">
        <motion.div style={{ scaleX, transformOrigin: "left" }} className="h-full bg-red-600 shadow-[0_0_10px_red]" />
      </div>

      {/* --- HEADER --- */}
      <header className="py-32 px-6 border-b border-zinc-900">
        <div className="max-w-6xl mx-auto">
             <div className="flex items-center gap-3 mb-6">
                <div className="w-2 h-2 bg-red-600 animate-pulse rounded-full" />
                <span className="font-mono text-xs uppercase tracking-[0.3em] text-zinc-500">
                    Lecture Archive / 2015
                </span>
             </div>
             <h1 className="text-5xl md:text-8xl font-black text-white mb-8 tracking-tighter font-sans uppercase">
                The History <br/> of Communication
             </h1>
             <p className="font-serif text-xl md:text-2xl max-w-2xl text-zinc-400 italic leading-relaxed">
                "From smoke signals to the realization that nothing can be deleted."
             </p>
        </div>
      </header>

      {/* --- CONTENT LOOP --- */}
        <main className="max-w-6xl mx-auto">
        {LECTURE_DATA.map((sec, i) => {
          const Icon = sec.icon;
          return (
          <section key={sec.id} className="grid md:grid-cols-12 gap-12 py-32 border-b border-zinc-900 px-6">
                
            {/* LEFT: STICKY HEADER */}
            <div className="md:col-span-4 relative">
              <div className="sticky top-12">
                <div className="flex items-center gap-4 text-red-600 mb-4 font-mono text-sm">
                  <span>0{i + 1}</span>
                  <div className="h-[1px] w-8 bg-red-600" />
                  <span>{sec.duration}</span>
                </div>
                <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 uppercase tracking-tight font-sans">
                  {sec.title}
                </h2>
                <div className="flex items-start gap-4 text-zinc-500 mb-8">
                  <Icon size={24} className="shrink-0 mt-1" />
                  <p className="font-serif italic text-lg leading-snug">
                    {sec.summary}
                  </p>
                </div>
              </div>
            </div>

            {/* RIGHT: DATA BLOCKS */}
            <div className="md:col-span-8 space-y-12">
              {sec.blocks.map((block, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ duration: 0.5, delay: idx * 0.1 }}
                  className="group"
                >
                  <div className="flex items-baseline gap-4 mb-4">
                    <span className="font-mono text-xs text-zinc-600 group-hover:text-red-600 transition-colors uppercase tracking-widest">
                      Node {i + 1}.{idx + 1}
                    </span>
                    <div className="h-[1px] flex-grow bg-zinc-900 group-hover:bg-red-900/30 transition-colors" />
                  </div>
                            
                  <h3 className="text-2xl text-zinc-100 font-bold mb-4 font-sans">
                    {block.head}
                  </h3>
                  <p className="font-serif text-lg text-zinc-400 leading-relaxed max-w-2xl">
                    {block.text}
                  </p>
                </motion.div>
              ))}
            </div>

          </section>
          );
        })}
        </main>

      {/* --- FOOTER --- */}
      <footer className="py-24 px-6 text-center border-t border-zinc-900 bg-black">
         <div className="mb-8">
            <MousePointer size={24} className="mx-auto text-zinc-600 animate-bounce" />
         </div>
         <p className="font-mono text-xs text-zinc-600 uppercase tracking-widest">
             End of Archive<br/>
             Anton Merkurov © 2025
         </p>
      </footer>
    </div>
  );
}