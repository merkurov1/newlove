import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SubscribeFormClient from '@/components/journal/SubscribeFormClient';

export const metadata: Metadata = {
  title: 'Поток / Flow — Subscribe',
  description: 'Редакция из одного человека и одной кнопки. One person’s taste multiplied by code.',
  openGraph: {
    title: 'Поток / Flow — Subscribe',
    description: 'Еженедельный журнал Потока. Weekly issue by Anton Merkurov.',
    url: 'https://merkurov.love/flow/join',
    images: ['https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/artifacts/IMG_1542.jpeg'],
  },
};

export default function FlowJoinPage() {
  const prototypeImageUrl = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/artifacts/IMG_1542.jpeg';

  return (
    <main className="min-h-[85vh] flex flex-col justify-between px-4 py-12 md:py-20 max-w-3xl mx-auto font-sans antialiased">
      <article className="space-y-16">
        
        {/* Header Badge & Title */}
        <header className="space-y-4 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 font-mono text-xs text-neutral-600 dark:text-neutral-300">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span>Coming soon</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
            Поток <span className="text-neutral-400 font-normal">/ Flow</span>
          </h1>
        </header>

        {/* BILINGUAL MANIFESTO */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12 pt-2 border-t border-neutral-100 dark:border-neutral-800">
          
          {/* RU VERSION */}
          <section className="space-y-4 text-neutral-800 dark:text-neutral-200 leading-relaxed text-base">
            <p className="font-semibold text-lg text-neutral-900 dark:text-white">
              Редакция из одного человека и одной кнопки.
            </p>
            <p>
              Я ничего не пишу, я только отбираю. Ссылка, видео, фото, строчка — десять секунд, и запись в ленте. Остальное делает система: сортирует, считает, верстает.
            </p>
            <p>
              Раз в неделю из этого собирается выпуск. Без редакции, только вкус одного человека, умноженный на код.
            </p>
            <p className="font-medium text-neutral-900 dark:text-white pt-2">
              Если интересно, чем это кончится, оставьте адрес.
            </p>
          </section>

          {/* EN VERSION */}
          <section className="space-y-4 text-neutral-600 dark:text-neutral-400 leading-relaxed text-base">
            <p className="font-semibold text-lg text-neutral-900 dark:text-white">
              A newsroom of one person and one button.
            </p>
            <p>
              I don&apos;t write. I select. A link, a video, a photo, a line — ten seconds and it&apos;s in the stream. The system does the rest: sorts, counts, sets the type.
            </p>
            <p>
              Once a week it becomes an issue. No newsroom, just one person&apos;s taste multiplied by code.
            </p>
            <p className="font-medium text-neutral-900 dark:text-white pt-2">
              If you want to see how it ends, leave your address.
            </p>
          </section>

        </div>

        {/* PROTOTYPE PREVIEW CARD */}
        <section className="space-y-3">
          <div className="group relative overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 shadow-sm transition-all hover:shadow-md">
            <div className="relative aspect-[16/10] w-full overflow-hidden">
              <img
                src={prototypeImageUrl}
                alt="Flow Issue Prototype Preview"
                className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]"
              />
            </div>
            <div className="p-3 md:p-4 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border-t border-neutral-200/60 dark:border-neutral-800 flex items-center justify-between text-xs font-mono text-neutral-500 dark:text-neutral-400">
              <span>PROTOTYPE // ISSUE #0</span>
              <span className="uppercase tracking-wider">Weekly Issue Layout</span>
            </div>
          </div>
        </section>

        {/* FORM SECTION */}
        <section className="pt-2">
          <SubscribeFormClient defaultLanguage="ru" />
        </section>

        {/* DISCLAIMER / LIVE STREAM LINK */}
        <footer className="p-4 md:p-5 rounded-xl bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200/60 dark:border-neutral-800 text-center text-xs md:text-sm text-neutral-600 dark:text-neutral-400">
          <p className="mb-2">
            <strong>Скоро.</strong> Выпуски начнут выходить в ближайшее время, а пока Поток можно читать в реальном времени.
          </p>
          <p>
            <strong>Coming soon.</strong> Issues will launch shortly. In the meantime, follow the stream live:
          </p>
          <div className="mt-3">
            <Link
              href="/flow"
              className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-wider text-black dark:text-white font-semibold underline hover:opacity-80 transition-opacity"
            >
              merkurov.love/flow &rarr;
            </Link>
          </div>
        </footer>

      </article>
    </main>
  );
}
