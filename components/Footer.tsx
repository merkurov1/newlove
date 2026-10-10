'use client';

import PierrotChat from './PierrotChat';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <>
      {/* Плавающий ассистент Пьеро в правом нижнем углу */}
    

      {/* Лаконичный футер */}
      <footer className="w-full bg-[#FAF8F5] border-t border-zinc-200/60 py-8 px-6 text-center font-mono text-[11px] text-zinc-500 uppercase tracking-[0.2em]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3">
          <span>&copy; {currentYear} Anton Merkurov</span>
          <span className="text-zinc-400 lowercase text-[10px] tracking-normal font-sans italic">
            made with AI. potential hallucinations apply.
          </span>
        </div>
      </footer>
    </>
  );
}
