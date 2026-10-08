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

  // Перемешиваем и назначаем случайные размеры при каждом обновлении seed
  const projects = useMemo(() => {
    const sizes: ('sm' | 'md' | 'lg' | 'xl')[] = ['sm', 'md', 'lg', 'xl'];
    const shuffled = [...rawProjects].sort(() => Math.random() - 0.5);
    
    return shuffled.map((p) => ({
      ...p,
      size: sizes[Math.floor(Math.random() * sizes.length)],
      weight: Math.floor(Math.random() * 3) + 1, // от 1 до 3 для вариативности шрифта
    }));
  }, [seed]);

  useEffect(() => {
    // Рандомизация порядка при монтировании на клиенте
    setSeed(Date.now());
  }, []);

  return (
    <main className="min-h-[80vh] flex flex-col justify-between px-6 py-12 md:py-20 max-w-5xl mx-auto selection:bg-neutral-800 selection:text-neutral-100">
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-neutral-800 pb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-light tracking-tight text-neutral-100">
              index
            </h1>
            <p className="text-sm text-neutral-500 mt-1 font-mono">
              merkurov.love / all projects & spaces
            </p>
          </div>
          <button
            onClick={() => setSeed(Date.now())}
            className="self-start sm:self-auto text-xs uppercase tracking-widest text-neutral-400 hover:text-neutral-100 transition-colors border border-neutral-800 hover:border-neutral-600 px-4 py-2 rounded-full font-mono"
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
                    ? 'border-neutral-800 bg-neutral-900/50 text-neutral-300 hover:border-neutral-500 hover:text-neutral-100 hover:bg-neutral-800/80 hover:scale-105 shadow-sm'
                    : 'border-neutral-900 bg-neutral-950/30 text-neutral-600 cursor-not-allowed opacity-60'
                } ${sizeClasses}`}
              >
                <span>{project.name}</span>
                {!project.active && (
                  <span className="text-[10px] tracking-tighter uppercase text-neutral-700 bg-neutral-900 px-1.5 py-0.5 rounded">
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
                className="inline-block focus:outline-none focus:ring-1 focus:ring-neutral-400 rounded-full"
              >
                {content}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mt-12 pt-6 border-t border-neutral-900 text-xs text-neutral-600 font-mono flex justify-between items-center">
        <span>total: {rawProjects.length} nodes</span>
        <span>randomized layout</span>
      </div>
    </main>
  );
}
