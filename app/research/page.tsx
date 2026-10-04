import type { Metadata } from 'next';
import Link from "next/link";
import Header from '@/components/Header';
import { SubmitButton } from "./submit-button";
import { submitInquiry } from "./actions";
import { FileText, ArrowRight, ShieldAlert, Sparkles } from 'lucide-react';

export const metadata: Metadata = {
  title: 'The Merkurov Doctrine — Research | Anton Merkurov',
  description: 'A forensic study: The Digital Decay — a chronicle and analysis (2010–2025) by Anton Merkurov.',
  alternates: {
    canonical: 'https://www.merkurov.love/research',
  },
  openGraph: {
    title: 'The Merkurov Doctrine — Research | Anton Merkurov',
    description: 'A forensic study: The Digital Decay — a chronicle and analysis (2010–2025).',
    url: 'https://www.merkurov.love/research',
    siteName: 'Anton Merkurov',
    images: [
      {
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png',
        width: 1200,
        height: 630,
        alt: 'The Merkurov Doctrine — Research',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The Merkurov Doctrine — Research | Anton Merkurov',
    description: 'A forensic study: The Digital Decay — a chronicle and analysis (2010–2025).',
    creator: '@merkurov',
    site: '@merkurov',
  },
};

export default function ResearchPage() {
  const pdfUrl = "https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/The%20Merkurov%20Timeline%20of%20Digital%20Decay%20A%20Manifesto%20of%20Unheeded.pdf";

  return (
    <main className="min-h-screen bg-[#FAF8F5] text-[#111] font-sans selection:bg-black selection:text-white relative overflow-x-hidden">
      
      {/* HEADER */}
      <Header />

      <div className="max-w-4xl mx-auto px-6 pt-36 md:pt-44 pb-24">
        
        {/* HEADER */}
        <header className="mb-20 border-l-2 border-[#CC0000] pl-8">
          <div className="font-mono text-xs uppercase tracking-widest text-[#CC0000] mb-3 flex items-center gap-2">
            <span>// RESEARCH / ARCHIVE</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-serif font-bold text-black mb-4 leading-tight">
            The Digital Decay:<br />
            <span className="text-stone-500">A Chronicle of Voluntary Submission.</span>
          </h1>
          <div className="flex flex-col md:flex-row gap-6 text-sm font-mono text-stone-600 mt-8">
            <span>ARCHIVE: 2010–2025</span>
            <span>STATUS: IRREVERSIBLE</span>
            <span className="text-[#CC0000]">AUTHOR: ANTON MERKUROV</span>
          </div>
        </header>

        {/* FEATURED: NOVAYA GAZETA REPORT (NEW LINK) */}
        <section className="mb-20">
          <div className="bg-white border border-stone-300 p-8 rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all relative group">
            <div className="absolute top-6 right-6 font-mono text-[10px] bg-[#CC0000] text-white px-3 py-1 uppercase tracking-widest rounded-full">
              Featured Report • RU / EN / FR
            </div>
            <div className="font-mono text-xs text-stone-400 mb-2 uppercase tracking-widest">Novaya Gazeta • 2025 Analysis</div>
            <h3 className="text-2xl md:text-3xl font-serif font-bold text-black mb-4 group-hover:text-[#CC0000] transition-colors">
              From Content Censorship to Hardware Hegemony
            </h3>
            <p className="text-stone-700 text-base md:text-lg leading-relaxed mb-6 font-light max-w-2xl">
              Strategic analysis on the transformation of digital control in Russia — transitioning from soft IP filtering to hardware registries, IMEI tracking, and device-level restrictions.
            </p>
            <Link 
              href="/research/novayagazeta2025"
              className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider font-bold bg-black text-white px-6 py-3 rounded-sm hover:bg-[#CC0000] transition-colors"
            >
              Read Full Report <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>

        {/* ABSTRACT */}
        <section className="mb-20 grid md:grid-cols-3 gap-12 bg-white/70 border border-stone-200 p-8 rounded-2xl">
          <div className="md:col-span-1">
            <h3 className="text-xs font-mono text-stone-500 mb-4 tracking-widest uppercase">Abstract</h3>
            <p className="text-stone-600 text-sm leading-relaxed">
              Generated based on 15 years of public commentary in BBC, Washington Post, Novaya Gazeta, and Al Jazeera. A forensic analysis of foresight.
            </p>
          </div>
          <div className="md:col-span-2">
            <p className="text-lg md:text-xl font-serif leading-relaxed text-stone-900">
              The internet was not killed by the state. It was surrendered by the user. 
              This document traces the evolution of the "Digital Iron Curtain" from a technical impossibility (2012) to a psychological reality (2025).
            </p>
          </div>
        </section>

        {/* TIMELINE */}
        <section className="mb-20">
          <h3 className="text-xs font-mono text-stone-500 mb-8 tracking-widest uppercase border-b border-stone-200 pb-2">The Timeline of Warnings</h3>
          
          <div className="space-y-12 border-l border-stone-300 ml-2 pl-8 relative">
            
            {/* ITEM 1 */}
            <div className="relative">
              <span className="absolute -left-[37px] top-1 h-4 w-4 rounded-full bg-white border-2 border-stone-400"></span>
              <div className="font-mono text-[#CC0000] text-sm mb-1 font-bold">2012 — THE ILLUSION</div>
              <h4 className="text-xl font-bold text-black mb-2 font-serif">"Shooting Themselves in the Foot"</h4>
              <p className="text-stone-600 italic">Prediction: Banning IPs will destroy the economy before it destroys dissent.</p>
              <div className="mt-2 text-xs text-stone-400 font-mono">Source: BBC Interview</div>
            </div>

            {/* ITEM 2 */}
            <div className="relative">
              <span className="absolute -left-[37px] top-1 h-4 w-4 rounded-full bg-white border-2 border-stone-400"></span>
              <div className="font-mono text-[#CC0000] text-sm mb-1 font-bold">2018 — THE RESISTANCE</div>
              <h4 className="text-xl font-bold text-black mb-2 font-serif">"The Digital Migration"</h4>
              <p className="text-stone-600 italic">Prediction: The state cannot win a math war (Encryption), but they will win a physical war (Fear).</p>
              <div className="mt-2 text-xs text-stone-400 font-mono">Source: Al Jazeera / DW</div>
            </div>

            {/* ITEM 3 */}
            <div className="relative">
              <span className="absolute -left-[37px] top-1 h-4 w-4 rounded-full bg-[#CC0000] border-2 border-black shadow-sm"></span>
              <div className="font-mono text-[#CC0000] text-sm mb-1 font-bold">2025 — THE COLLAR</div>
              <h4 className="text-xl font-bold text-black mb-2 font-serif">"Voluntary Submission"</h4>
              <p className="text-stone-600 italic">Verdict: The infrastructure of control is now internal. We register ourselves.</p>
              <div className="mt-2 text-xs text-stone-400 font-mono">Source: The Merkurov Doctrine</div>
            </div>

          </div>
        </section>

        {/* DOWNLOAD */}
        <section className="mb-20 p-8 border border-stone-300 bg-white rounded-2xl shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-lg font-serif font-bold text-black">Full Dossier (PDF)</h3>
            <p className="text-sm text-stone-500 font-mono mt-1">12 Pages • Academic Analysis • 2.4 MB</p>
          </div>
          <a 
            href={pdfUrl}
            target="_blank"
            className="px-6 py-3 bg-black text-white font-mono text-sm uppercase tracking-wider hover:bg-[#CC0000] transition"
          >
            Download Artifact
          </a>
        </section>

        {/* CONTACT FORM */}
        <section className="border-t border-stone-200 pt-12">
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h3 className="text-2xl font-serif text-black mb-4">Academic Inquiry</h3>
              <p className="text-stone-600 text-sm mb-6 leading-relaxed">
                Available for university lectures, think-tank briefings, and institutional review.
                <br/><br/>
                Request access to the Private Office.
              </p>
            </div>

            <form action={submitInquiry} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input 
                  name="name" 
                  placeholder="Name" 
                  className="bg-white border border-stone-300 p-3 text-sm text-black focus:outline-none focus:border-[#CC0000] transition rounded-sm"
                  required
                />
                <input 
                  name="org" 
                  placeholder="Institution / Org" 
                  className="bg-white border border-stone-300 p-3 text-sm text-black focus:outline-none focus:border-[#CC0000] transition rounded-sm"
                />
              </div>
              <input 
                  name="email" 
                  type="email"
                  placeholder="Institutional Email" 
                  className="w-full bg-white border border-stone-300 p-3 text-sm text-black focus:outline-none focus:border-[#CC0000] transition rounded-sm"
                  required
              />
              <SubmitButton />
            </form>
          </div>
        </section>

      </div>
    </main>
  );
}
