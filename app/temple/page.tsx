'use client';

import React, { useState } from 'react';
import Header from '@/components/Header';
import { useAuth } from '@/components/AuthContext';
import Link from 'next/link';
import { Sparkles, Shield, Compass, Heart, Feather, ArrowRight } from 'lucide-react';

type ServiceType = 'temple' | 'cast' | 'vigil' | 'absolution' | 'letitgo';

export default function TemplePage() {
  const { user, profile } = useAuth();
  const [activeView, setActiveView] = useState<ServiceType>('temple');

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 selection:bg-zinc-900 selection:text-white">
      {/* Background glow atmosphere */}
      <div className="fixed top-[-10%] left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-tr from-amber-200/30 via-indigo-200/20 to-purple-200/30 blur-[140px] pointer-events-none rounded-full" />

      {/* Header */}
      <Header />

      {/* --- MAIN CONTENT CONTAINER --- */}
      <main className="max-w-4xl mx-auto px-6 pt-36 pb-24 relative z-10">
        
        {/* HERO INTRO */}
        <div className="text-center space-y-6 mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-zinc-200/60 backdrop-blur-md text-zinc-800 text-xs font-mono uppercase tracking-widest border border-zinc-300/50">
            <Sparkles size={14} className="text-amber-600" />
            Digital Sanctuary & Metamodern Spaces
          </div>
          <h1 className="text-4xl lg:text-6xl font-extrabold tracking-tight text-zinc-900 font-sans">
            Digital Temple
          </h1>
          <p className="text-lg lg:text-xl text-zinc-600 max-w-2xl mx-auto font-light leading-relaxed">
            Пространство для психометрических исследований, рефлексии, отпущения цифровых балластов и архитектуры смыслов.
          </p>
        </div>

        {/* SERVICES GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* 1. THE CAST */}
          <Link 
            href="/cast"
            className="group p-8 rounded-3xl bg-white/80 backdrop-blur-xl border border-zinc-200/80 hover:border-zinc-400 shadow-[0_10px_30px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.06)] transition-all flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 text-white flex items-center justify-center group-hover:scale-110 transition-transform">
                <Compass size={22} />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-zinc-900">The Cast</h2>
              <p className="text-sm text-zinc-600 leading-relaxed font-light">
                Психометрический инструмент классификации архетипов на основе глубокого анализа текстовых паттернов и реакций.
              </p>
            </div>
            <div className="mt-8 flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-zinc-900 font-semibold group-hover:translate-x-1 transition-transform">
              <span>Исследовать архетипы</span>
              <ArrowRight size={14} />
            </div>
          </Link>

          {/* 2. VIGIL */}
          <Link 
            href="/vigil"
            className="group p-8 rounded-3xl bg-white/80 backdrop-blur-xl border border-zinc-200/80 hover:border-zinc-400 shadow-[0_10px_30px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.06)] transition-all flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 text-white flex items-center justify-center group-hover:scale-110 transition-transform">
                <Shield size={22} />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-zinc-900">Vigil</h2>
              <p className="text-sm text-zinc-600 leading-relaxed font-light">
                Пространство бдения, мониторинга цифровых потоков и фиксации ключевых экзистенциальных состояний.
              </p>
            </div>
            <div className="mt-8 flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-zinc-900 font-semibold group-hover:translate-x-1 transition-transform">
              <span>Войти в бдение</span>
              <ArrowRight size={14} />
            </div>
          </Link>

          {/* 3. ABSOLUTION */}
          <Link 
            href="/absolution"
            className="group p-8 rounded-3xl bg-white/80 backdrop-blur-xl border border-zinc-200/80 hover:border-zinc-400 shadow-[0_10px_30px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.06)] transition-all flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 text-white flex items-center justify-center group-hover:scale-110 transition-transform">
                <Feather size={22} />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-zinc-900">Absolution</h2>
              <p className="text-sm text-zinc-600 leading-relaxed font-light">
                Ритуал очищения от информационного шума, ментальных фиксаций и груза избыточных смыслов.
              </p>
            </div>
            <div className="mt-8 flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-zinc-900 font-semibold group-hover:translate-x-1 transition-transform">
              <span>Пройти отпущение</span>
              <ArrowRight size={14} />
            </div>
          </Link>

          {/* 4. LET IT GO */}
          <Link 
            href="/letitgo"
            className="group p-8 rounded-3xl bg-white/80 backdrop-blur-xl border border-zinc-200/80 hover:border-zinc-400 shadow-[0_10px_30px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.06)] transition-all flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 text-white flex items-center justify-center group-hover:scale-110 transition-transform">
                <Heart size={22} />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-zinc-900">Let It Go</h2>
              <p className="text-sm text-zinc-600 leading-relaxed font-light">
                Интерактивный инструмент финального отпускания прошлого и освобождения личного пространства.
              </p>
            </div>
            <div className="mt-8 flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-zinc-900 font-semibold group-hover:translate-x-1 transition-transform">
              <span>Отпустить</span>
              <ArrowRight size={14} />
            </div>
          </Link>

        </div>
      </main>
    </div>
  );
}
