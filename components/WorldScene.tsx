'use client';

import { useState } from 'react';
import Header from '@/components/Header';

export default function HeartAngelClient() {
  const [hovered, setHovered] = useState(false);

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-neutral-900 font-sans selection:bg-neutral-900 selection:text-white overflow-x-hidden relative flex flex-col">
      
      {/* HEADER */}
      <Header />

      {/* MAIN VISUAL STAGE (Top padding added to avoid header collision) */}
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 pt-28 sm:pt-36 pb-16 flex flex-col justify-between relative min-h-[75vh]">
        
        {/* SKY ELEMENTS (Sun & Clouds scaled down) */}
        <div className="absolute inset-x-0 top-24 px-8 pointer-events-none flex justify-between items-start z-0 opacity-90">
          {/* Sun (reduced by half: w-12 h-12 instead of w-24) */}
          <div className="relative left-12 sm:left-24">
            <div className="w-12 h-12 rounded-full bg-yellow-300 shadow-sm animate-pulse flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border border-yellow-400 scale-125 opacity-60"></div>
            </div>
          </div>

          {/* Cloud 1 */}
          <div className="bg-white/70 backdrop-blur-sm rounded-full px-4 py-1.5 shadow-sm text-[10px] font-mono text-neutral-400 tracking-widest uppercase">
            [ empathy // source code ]
          </div>
        </div>

        {/* CENTERED BALLOON & THREAD */}
        <div className="absolute left-1/2 top-32 -translate-x-1/2 z-10 flex flex-col items-center pointer-events-none">
          {/* Heart Balloon (Centered on screen) */}
          <div 
            className={`w-10 h-10 bg-rose-600 rotate-45 relative rounded-sm shadow-md transition-transform duration-500 cursor-pointer pointer-events-auto ${hovered ? 'scale-110' : 'scale-100'}`}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <div className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-rose-600"></div>
            <div className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-rose-600"></div>
            {/* Balloon knot */}
            <div className="absolute bottom-[-6px] right-[-6px] w-2.5 h-2.5 bg-rose-700 rotate-45"></div>
          </div>

          {/* Corrected Thread / String connecting balloon to character */}
          <svg className="overflow-visible w-40 h-56" style={{ transform: 'translateX(-35px)' }}>
            <path 
              d="M 40 6 Q 10 70 -35 180" 
              fill="none" 
              stroke="#a3a3a3" 
              strokeWidth="1.5" 
              strokeDasharray="3 3"
            />
          </svg>
        </div>

        {/* SCENE STAGE (Ground, Character, House, Tree) */}
        <div className="relative w-full h-[450px] mt-auto flex items-end justify-between px-4 sm:px-16 z-10">
          
          {/* GROUND LINE (Otrisovannaja zemlya) */}
          <div className="absolute bottom-0 inset-x-0 h-1 bg-neutral-300 rounded-full"></div>
          <div className="absolute bottom-[-10px] left-10 right-10 h-3 bg-gradient-to-t from-neutral-200/50 to-transparent blur-sm"></div>

          {/* LEFT: CHARACTER (Reduced by half) */}
          <div className="relative mb-1 flex flex-col items-center scale-50 origin-bottom">
            {/* Head */}
            <div className="w-24 h-24 rounded-full border-2 border-neutral-900 bg-white shadow-sm flex items-center justify-center relative">
              <div className="w-2 h-2 bg-neutral-900 rounded-full absolute right-8 top-10"></div>
            </div>
            {/* Body / Cloak & Backpack */}
            <div className="w-28 h-36 bg-white border-2 border-neutral-900 rounded-t-full rounded-b-2xl relative -mt-3 shadow-sm flex items-center justify-center">
              <div className="absolute -left-6 top-6 w-12 h-20 bg-neutral-100 border-2 border-neutral-900 rounded-2xl -rotate-12"></div>
            </div>
            {/* Legs */}
            <div className="flex gap-6 -mt-1">
              <div className="w-2.5 h-12 bg-neutral-900 rounded-full"></div>
              <div className="w-2.5 h-12 bg-neutral-900 rounded-full"></div>
            </div>
          </div>

          {/* RIGHT: HOUSE & TREE (Reduced by 3 times) */}
          <div className="relative mb-1 flex items-end gap-3 scale-[0.35] origin-bottom-right">
            {/* Tree */}
            <div className="flex flex-col items-center relative -right-4">
              <div className="w-36 h-36 rounded-full border-4 border-neutral-900 bg-emerald-500 relative overflow-hidden shadow-sm">
                <div className="absolute inset-0 border-2 border-neutral-900 rounded-full opacity-40 scale-90"></div>
                <div className="absolute top-0 right-4 w-4 h-4 bg-yellow-300 rounded-full border border-neutral-900"></div>
              </div>
              <div className="w-4 h-28 bg-neutral-800 border-x-2 border-neutral-900 -mt-4"></div>
            </div>

            {/* House */}
            <div className="relative flex flex-col items-center">
              {/* Roof */}
              <div className="w-44 h-28 bg-purple-500 border-4 border-neutral-900 rounded-t-full relative z-20 shadow-sm flex items-center justify-center">
                <div className="w-3 h-3 bg-white rounded-full border border-neutral-900"></div>
              </div>
              {/* House Body */}
              <div className="w-36 h-44 bg-white border-4 border-neutral-900 border-t-0 relative -mt-2 rounded-b-3xl flex flex-col items-center justify-start pt-6 shadow-sm">
                {/* Window */}
                <div className="w-14 h-14 rounded-full border-3 border-neutral-900 bg-yellow-100 flex items-center justify-center relative">
                  <div className="absolute inset-0 flex items-center justify-center"><div className="w-full h-0.5 bg-neutral-900"></div></div>
                  <div className="absolute inset-0 flex items-center justify-center"><div className="h-full w-0.5 bg-neutral-900"></div></div>
                </div>
                {/* Door */}
                <div className="w-12 h-20 border-3 border-neutral-900 border-b-0 rounded-t-full mt-auto bg-neutral-50"></div>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
