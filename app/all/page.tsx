'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

interface Project {
  name: string;
  slug: string;
  active: boolean;
  size: 'sm' | 'md' | 'lg' | 'xl';
  weight: number;
}

const rawProjects: Omit<Project, 'size' | 'weight'>[] = [
  { name: 'communications', slug: 'communications', active: true },
  { name: 'isakeyforall', slug: 'isakeyforall', active: true },
  { name: 'journal', slug: 'journal', active: true },
  { name: 'kit', slug: 'kit', active: true },
  { name: 'profile', slug: 'profile', active: true },
  { name: 'talks', slug: 'talks', active: true },
  { name: 'temple', slug: 'temple', active: true },
  { name: 'absolution', slug: 'absolution', active: true },
  { name: 'digest', slug: 'digest', active: true },
  { name: 'letters', slug: 'letters', active: true },
  { name: 'quiz', slug: 'quiz', active: false },
  { name: 'tribute', slug: 'tribute', active: true },
  { name: 'unframed', slug: 'unframed', active: true },
  { name: 'advising', slug: 'advising', active: true },
  { name: 'liveheart', slug: 'liveheart', active: true },
  { name: 'research', slug: 'research', active: true },
  { name: 'users', slug: 'users', active: false },
  { name: 'lobby', slug: 'lobby', active: true },
  { name: 'vigil', slug: 'vigil', active: true },
  { name: 'flow', slug: 'flow', active: true },
  { name: 'login', slug: 'login', active: true },
  { name: 'you', slug: 'you', active: true },
  { name: 'art-engine', slug: 'art-engine', active: true },
  { name: 'heartandangel', slug: 'heartandangel', active: true },
  { name: 'case-study', slug: 'case-study', active: false },
  { name: 'heritage', slug: 'heritage', active: true },
  { name: 'selection', slug: 'selection', active: true },
  { name: 'cast', slug: 'cast', active: true },
  { name: 'silence', slug: 'silence', active: true },
];

export default function AllProjectsPage() {
  const [seed, setSeed] = useState(0);

  // Перемешиваем и назначаем случайные размеры при каждом обновлении seed.
  // seed = 0 is the deterministic first render shared by the server and the
  // client; the effect below replaces it with a timestamp after hydration.
  const projects = useMemo(() => {
    const sizes: ('sm' | 'md' | 'lg' | 'xl')[] = ['sm', 'md', 'lg', 'xl'];
    let cursor = seed || 1;

    const next = () => {
      cursor = (cursor * 1664525 + 1013904223) % 4294967296;
      return cursor / 4294967296;
    };

    const shuffled = seed === 0 ? [...rawProjects] : [...rawProjects].sort(() => next() - 0.5);

    return shuffled.map((p) => ({
      ...p,
      size: sizes[Math.floor((seed === 0 ? 0.5 : next()) * sizes.length)],
      weight: Math.floor((seed === 0 ? 0.5 : next()) * 3) + 1,
    }));
  }, [seed]);

  useEffect(() => {
    // Рандомизация порядка при монтировании на клиенте
    setSeed(Date.now());
  }, []);

  return (
    <div className="light-gallery min-h-screen flex flex-col justify-between px-6 py-12 md:py-20 max-w-5xl mx-auto text-[#1D1B18] selection:bg-[#1D1B18] selection:text-[#F5F2EB]">
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#1D1B18]/15 pb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-serif font-normal tracking-tight text-[#1D1B18]">
              index
            </h1>
            <p className="text-sm text-[#6F6A60] mt-1 font-mono">
              merkurov.love / all projects & spaces
            </p>
          </div>
          <button
            onClick={() => setSeed(Date.now())}
            className="self-start sm:self-auto text-xs uppercase tracking-widest text-[#5C574F] hover:text-[#1D1B18] transition-colors border border-[#1D1B18]/15 bg-white/55 hover:border-[#1D1B18]/40 hover:bg-white/70 px-4 py-2 rounded-full font-mono shadow-[0_12px_30px_rgba(58,46,30,0.06)] backdrop-blur-md"
          >
            shuffle matrix
          </button>
        </div>

        {/* Облако тегов */}
        <div className="flex flex-wrap items-center justify-center gap-3 md:gap-4 py-12 md:py-16 min-h-[400px]">
          {projects.map((project) => {
            // Классы размеров для тегов
            const sizeClasses = {
              sm: 'text-xs md:text-sm px-3 py-1.5',
              md: 'text-sm md:text-base px-4 py-2',
              lg: 'text-base md:text-lg px-5 py-2.5',
              xl: 'text-lg md:text-2xl px-6 py-3 font-normal',
            }[project.size];

            const content = (
              <span
                className={`inline-flex items-center gap-2 rounded-full border transition-all duration-300 font-mono select-none ${
                  project.active
                    ? 'border-[#1D1B18]/15 bg-white/55 text-[#3E3A34] shadow-[0_10px_28px_rgba(58,46,30,0.06)] hover:border-[#1D1B18]/40 hover:bg-white/80 hover:text-[#1D1B18] hover:scale-105'
                    : 'border-[#1D1B18]/10 bg-white/25 text-[#8B857B] cursor-not-allowed opacity-70'
                } ${sizeClasses}`}
              >
                <span>{project.name}</span>
                {!project.active && (
                  <span className="text-[10px] tracking-tighter uppercase text-[#8B857B] bg-[#1D1B18]/5 px-1.5 py-0.5 rounded">
                    off
                  </span>
                )}
              </span>
            );

            if (!project.active) {
              return (
                <div key={project.slug} title="Project currently inactive" className="inline-block">
                  {content}
                </div>
              );
            }

            return (
              <Link
                key={project.slug}
                href={`/${project.slug}`}
                className="inline-block max-w-full rounded-full focus:outline-none focus:ring-1 focus:ring-[#1D1B18]/40"
              >
                {content}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mt-12 pt-6 border-t border-[#1D1B18]/10 text-xs text-[#6F6A60] font-mono flex justify-between items-center">
        <span>total: {rawProjects.length} nodes</span>
        <span>randomized layout</span>
      </div>
    </div>
  );
}
