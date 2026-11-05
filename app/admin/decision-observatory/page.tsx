import type { Metadata } from 'next';
import DecisionObservatoryClient from './DecisionObservatoryClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Decision Observatory',
};

export default function DecisionObservatoryPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-12 lg:px-8">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#990F3D]">
        Intelligence · owner only
      </p>
      <h1 className="mt-3 font-serif text-4xl leading-tight text-[#211F1F] lg:text-5xl">
        Decision Observatory
      </h1>
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-[#625D58]">
        Отдельный инструмент рядом с Editorial Engine. Он смотрит на сохранённые решения, их
        предположения и последующие события, чтобы отделить подтверждённые результаты от простой
        временной последовательности.
      </p>

      <DecisionObservatoryClient />
    </div>
  );
}
