'use client';

import { useState, type ReactNode } from 'react';
import Image from 'next/image';

/* ---------- THEME: single place to match the site ---------- */
const T = {
  bg: 'bg-[#FAF8F5]',
  bgRaw: '#FAF8F5',
  serif: 'font-[var(--font-cormorant,Georgia,serif)]',
};

type L = { en: string; ru: string };
type Lang = 'en' | 'ru';

const IMG =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/artifacts/Heritage/';
const MASK_3D =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/1759415449881-IMG_0545.webp';
const NFT =
  'https://og.rarible.com/token/0xd07dc4262bcdbf85190c01c996b4c06a461d2430:504531?tab=overview';

const S = {
  museum: 'https://sergey-merkurov.mus.am/en/',
  arites: 'https://arites.am/en/merkulovmuseum',
  history: 'https://armenpress.am/ru/article/1118071',
  restoration: 'https://www.armmuseum.ru/news-blog/2016/8/24/-8',
  gyumri: 'https://regionalpost.org/en/articles/anton-merkurov.html',
  russianLife: 'https://russianlife.com/magazine/sep-oct-2013/the-death-artist/',
  bbc: 'https://www.bbc.com/russian/sport/2012/03/120109_dynamo_stadium_reconstruction',
  tan2017: 'https://www.theartnewspaper.ru/posts/4754/',
  tan2019: 'https://www.theartnewspaper.ru/posts/6657/',
  tan2023: 'https://www.theartnewspaper.ru/posts/20230112-vrlc/',
  mt: 'https://www.themoscowtimes.com/2014/06/16/controversial-lenin-death-mask-for-sale-in-us-a36443',
  kp: 'https://www.kp.ru/daily/28353.5/4499365/',
  alphabet:
    'https://provereno.media/blog/2021/07/20/pravda-li-chto-sovetskuju-eroticheskuju-azbuku-narisoval-skulptor-merkurov/',
  tan:
    'https://www.theartnewspaper.com/2021/03/19/pussy-riots-weekly-nft-drop-is-just-one-instance-of-russian-and-ukrainian-artists-embracing-new-modes-of-online-selling',
  linkedin:
    'https://www.linkedin.com/posts/merkurov_from-lenins-death-mask-to-ai-art-curator-activity-7400837518541234176-qG5L',
  rodin: 'https://oms.ru/sergej-merkurov-slezy-i-krov-rodena',
  azbuka: 'https://merkurov.love/azbuka/',
};

/* ---------- UI copy ---------- */
const ui = {
  heroA: { en: 'Objects have', ru: 'У вещей' },
  heroB: { en: 'their own', ru: 'есть своя' },
  heroC: { en: 'histories.', ru: 'история.' },
  lead: {
    en: 'A documented record of the legacy of sculptor Sergey Merkurov and the work of his great-grandson, Anton Merkurov, across family archives, public monuments, museum history, print and digital art.',
    ru: 'Документированная история наследия скульптора Сергея Меркурова и работы его правнука Антона Меркурова: семейный архив, городские монументы, музейная история, печать и цифровое искусство.',
  },
  note: {
    en: 'Historical facts, published reporting and personal participation are distinguished throughout. Unresolved attributions are identified rather than presented as established facts.',
    ru: 'Исторические факты, публикации в прессе и личное участие разделены. Неподтверждённые атрибуции названы как таковые.',
  },
  tags: {
    en: ['Family archive', 'Museum history', 'Public monuments', 'Digital reinterpretation'],
    ru: ['Семейный архив', 'История музея', 'Городские монументы', 'Цифровое осмысление'],
  },
  sources: { en: 'Sources', ru: 'Источники' },
  top: { en: 'Back to top ↑', ru: 'Наверх ↑' },
  read: { en: 'Read', ru: 'Читать' },
  own: { en: 'By Anton Merkurov', ru: 'Автор — Антон Меркуров' },
  cov: { en: 'Coverage', ru: 'Упоминание' },
  partners: { en: 'Institutions and partners', ru: 'Институции и партнёры' },
};

const nav: [string, L, string][] = [
  ['01', { en: 'Family', ru: 'Семья' }, '#family'],
  ['02', { en: 'Gyumri museum', ru: 'Дом-музей' }, '#museum'],
  ['03', { en: 'Dynamo', ru: 'Динамо' }, '#dynamo'],
  ['04', { en: 'Death masks', ru: 'Маски' }, '#masks'],
  ['05', { en: 'Digital art', ru: 'Цифровое' }, '#digital'],
  ['06', { en: 'Erotic Alphabet', ru: 'Азбука' }, '#alphabet'],
  ['07', { en: 'In the press', ru: 'В прессе' }, '#press'],
  ['08', { en: 'Sources', ru: 'Источники' }, '#sources'],
];

type Row = { d: string; x: L };

const museumRows: Row[] = [
  { d: '1869', x: { en: 'The family house is built by Fyodor Merkurov, the sculptor’s grandfather.', ru: 'Дом построен Фёдором Меркуровым, дедом скульптора.' } },
  { d: '1950', x: { en: 'Sergey Merkurov transfers the house to the city.', ru: 'Сергей Меркуров передаёт дом городу.' } },
  { d: '1984', x: { en: 'The House-Museum opens to the public.', ru: 'Дом-музей открывается для посетителей.' } },
  { d: '1988', x: { en: 'The earthquake damages the building.', ru: 'Землетрясение повреждает здание.' } },
  { d: '2003', x: { en: 'Substantial restoration of the house.', ru: 'Масштабная реставрация дома.' } },
  { d: '2012', x: { en: 'Anton Merkurov presents the book of the sculptor’s memoirs in Yerevan (22 April, Gafesjian Center) and at the Pushkin Museum, Moscow (28 April); leads the seminar “New Technologies for Museums” in Gyumri (6 June); on 22 September hands documents from the sculptor’s archive to the museum.', ru: 'Антон Меркуров представляет книгу воспоминаний скульптора в Ереване (22 апреля, Центр Гафесчяна) и в ГМИИ им. Пушкина (28 апреля); проводит в Гюмри семинар «Новые технологии для музеев» (6 июня); 22 сентября передаёт музею документы из архива скульптора.' } },
  { d: '2013', x: { en: 'Gyumri is CIS Cultural Capital; Anton meets Armenian President Serzh Sargsyan at the exhibition (20 September). His essay “The Museum as a Tool of City Development” appears in Chastny Korrespondent (30 October).', ru: 'Гюмри — культурная столица СНГ; Антон встречается с президентом Армении Сержем Саргсяном на выставке (20 сентября). В «Частном корреспонденте» выходит его статья «Музей как инструмент развития города» (30 октября).' } },
  { d: '2014', x: { en: 'Exhibition “Sergey Merkurov Archive” on photo stands at Muzeon Park, Moscow (from 20 April): monumental portraits alongside lesser-known sculpture and death masks.', ru: 'Выставка «Архив Сергея Меркурова» на фотостендах в парке «Музеон», Москва (с 20 апреля): монументальные портреты и менее известная пластика, посмертные маски.' } },
  { d: '2016', x: { en: 'The Armenian Museum of Moscow reports that restoration of the house began with Anton Merkurov’s active participation.', ru: 'Армянский музей Москвы сообщает, что реставрация дома началась при активном участии Антона Меркурова.' } },
  { d: '2023', x: { en: 'Further renovation and reopening reported by Armenian media.', ru: 'Армянские СМИ сообщают о дальнейшем ремонте и повторном открытии.' } },
];

const dynamoRows: Row[] = [
  { d: '2012', x: { en: 'The reliefs are removed during stadium redevelopment. BBC News Russian Service reports on the campaign to preserve them.', ru: 'Барельефы демонтированы при реконструкции стадиона. Русская служба Би-би-си рассказывает о борьбе за их сохранение.' } },
  { d: '2016', x: { en: 'Restoration begins (The Art Newspaper Russia).', ru: 'Начинается реставрация (The Art Newspaper Russia).' } },
  { d: '2017', x: { en: 'Reporting from the restoration workshop; Anton Merkurov is quoted after visiting it.', ru: 'Репортаж из реставрационной мастерской; цитируется Антон Меркуров после визита.' } },
  { d: '2019', x: { en: 'Where the originals should be shown remains open. Anton argues they should stay tied to the historic stadium and visible to the public.', ru: 'Вопрос о месте экспонирования оригиналов не решён. Антон выступает за то, чтобы они остались связаны с историческим стадионом и были доступны публике.' } },
  { d: '2022–23', x: { en: 'The originals are installed in the renewed Dynamo complex, Arena Plaza area.', ru: 'Оригиналы установлены в обновлённом комплексе «Динамо», в зоне Arena Plaza.' } },
];

const alphabetRows: Row[] = [
  { d: '1931', x: { en: 'Date inscribed on a sheet reproduced in circulated images. Provenance and authorship are not conclusively established by the cited fact-check.', ru: 'Дата на листе, воспроизведённом в сетевых копиях. Происхождение и авторство не установлены окончательно в цитируемом фактчекинге.' } },
  { d: '2020', x: { en: 'Anton Merkurov organises an exhibition around the series at Cube art space, Moscow; a screenprint edition and postcards are produced from redrawings of low-resolution scans.', ru: 'Антон Меркуров организует выставку по мотивам серии в арт-пространстве Cube, Москва; выпущены сериграфии и открытки по перерисовкам низкокачественных сканов.' } },
  { d: '2021', x: { en: 'Provereno.Media publishes a fact-check of the attribution, the images and the exhibition.', ru: '«Проверено.Медиа» публикует фактчекинг атрибуции, изображений и выставки.' } },
];

type Press = { outlet: string; date: string; title: L; kind: 'own' | 'cov'; href?: string; img?: string };

const press: Press[] = [
  { outlet: 'BBC', date: '2012-03-01', title: { en: 'The fight for Merkurov’s reliefs at Dynamo stadium', ru: 'Борьба за барельефы Меркурова на стадионе «Динамо»' }, kind: 'cov', href: S.bbc },
  { outlet: 'Спорт-Экспресс', date: '2013-10-03', title: { en: 'Historic Dynamo stadium reliefs shown in Moscow', ru: 'В Москве показали исторические барельефы стадиона «Динамо»' }, kind: 'cov' },
  { outlet: 'Частный корреспондент', date: '2013-10-30', title: { en: 'The Museum as a Tool of City Development', ru: 'Музей как инструмент развития города' }, kind: 'own', img: 'Chaskor.jpg' },
  { outlet: 'Московский комсомолец', date: '2013-12-10', title: { en: 'Great-grandson of the Kyiv Lenin monument’s author: “A lesson for Ukraine in how not to do it”', ru: 'Правнук автора «киевского» памятника Ленину: «Это урок Украине как не надо делать»' }, kind: 'cov', img: 'LeninFalls.jpg' },
  { outlet: 'Московский комсомолец', date: '2015-11-11', title: { en: 'The master’s works will regain their former look', ru: 'Работам мастера Сергея Меркурова вернут прежний вид' }, kind: 'cov' },
  { outlet: 'The Moscow Times', date: '2014-06-16', title: { en: 'Controversial Lenin death mask for sale in US', ru: 'Спорная посмертная маска Ленина выставлена на продажу в США' }, kind: 'cov', href: S.mt },
  { outlet: 'Russian Life', date: '2013-09', title: { en: 'The Death Artist', ru: 'The Death Artist' }, kind: 'cov', href: S.russianLife },
  { outlet: 'The Art Newspaper Russia', date: '2017', title: { en: 'Dynamo reliefs in the restoration workshop', ru: 'Барельефы «Динамо» в реставрационной мастерской' }, kind: 'cov', href: S.tan2017 },
  { outlet: 'The Art Newspaper Russia', date: '2019', title: { en: 'Where should the Dynamo originals go?', ru: 'Где показывать оригиналы барельефов «Динамо»' }, kind: 'cov', href: S.tan2019 },
  { outlet: 'The Art Newspaper Russia', date: '2023', title: { en: 'The reliefs at Dynamo, restored', ru: 'Барельефы на «Динамо» после реставрации' }, kind: 'cov', href: S.tan2023 },
  { outlet: 'Комсомольская правда', date: '2021-11', title: { en: 'Interview: the digital Lenin mask', ru: 'Интервью: цифровая маска Ленина' }, kind: 'cov', href: S.kp },
  { outlet: 'The Art Newspaper', date: '2021-03', title: { en: 'Digital art and new modes of online selling', ru: 'Цифровое искусство и новые способы онлайн-продаж' }, kind: 'cov', href: S.tan },
  { outlet: 'Provereno.Media', date: '2021-07-20', title: { en: 'Did Merkurov draw the Soviet erotic alphabet?', ru: 'Правда ли, что советскую эротическую азбуку нарисовал скульптор Меркуров' }, kind: 'cov', href: S.alphabet },
];

const sourceList: [string, string][] = [
  ['Sergey Merkurov House-Museum', S.museum],
  ['Armenpress — history of the house museum', S.history],
  ['Armenian Museum of Moscow, 2016', S.restoration],
  ['Regional Post — Anton Merkurov', S.gyumri],
  ['AriTes — House-Museum collection', S.arites],
  ['Sergey Merkurov: Tears and Blood of Rodin', S.rodin],
  ['Anton Merkurov — LinkedIn', S.linkedin],
  ['Rarible — Lenin mask NFT', NFT],
];

const logos: [string, string][] = [
  ['MinCultAmLogo.jpg', 'Ministry of Culture of Armenia'],
  ['Dev_logo.jpg', 'DVV International'],
  ['Domain_am.jpg', 'Internet Society Armenia'],
  ['KremlinMultimediaLogo.jpg', 'Kremlin Multimedia'],
  ['MuseonLogo.jpg', 'Muzeon'],
];

/* ---------- primitives ---------- */
function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-stone-300 underline-offset-4 transition-colors hover:decoration-stone-900">
      {children}
      <span aria-hidden="true" className="ml-1 text-[10px]">↗</span>
    </a>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.17em] text-stone-500 sm:text-[11px]">{children}</p>;
}

function Title({ n, eyebrow, children }: { n: string; eyebrow: string; children: ReactNode }) {
  return (
    <div className="mb-8 sm:mb-10">
      <Eyebrow>{n} / {eyebrow}</Eyebrow>
      <h2 className={`max-w-3xl ${T.serif} text-4xl leading-[0.98] tracking-[-0.035em] text-stone-900 sm:text-5xl lg:text-6xl`}>{children}</h2>
    </div>
  );
}

function Timeline({ rows, t }: { rows: Row[]; t: (o: L) => string }) {
  return (
    <div>
      {rows.map((r) => (
        <div key={r.d + r.x.en.slice(0, 10)} className="grid grid-cols-[76px_minmax(0,1fr)] gap-4 border-t border-stone-200 py-5 sm:grid-cols-[105px_minmax(0,1fr)] sm:gap-8">
          <p className="pt-1 font-mono text-xs tabular-nums text-stone-500">{r.d}</p>
          <p className="min-w-0 text-sm leading-7 text-stone-700">{t(r.x)}</p>
        </div>
      ))}
    </div>
  );
}

function Fig({ src, alt, caption, ratio = 'aspect-[4/3]', priority = false, className = '' }: { src?: string; alt: string; caption?: string; ratio?: string; priority?: boolean; className?: string }) {
  return (
    <figure className={className}>
      <div className={`relative w-full overflow-hidden bg-stone-200 ${ratio}`}>
        {src && <Image src={src.startsWith('http') ? src : IMG + src} alt={alt} fill priority={priority} sizes="(min-width:1024px) 50vw, 100vw" className="object-cover" />}
      </div>
      {caption && <figcaption className="mt-3 text-xs leading-5 text-stone-500">{caption}</figcaption>}
    </figure>
  );
}

function PressCard({ p, t, lang }: { p: Press; t: (o: L) => string; lang: Lang }) {
  const inner = (
    <>
      {p.img && (
        <div className="relative mb-5 aspect-[16/10] w-full overflow-hidden bg-stone-200">
          <Image src={IMG + p.img} alt="" fill sizes="(min-width:1024px) 33vw, 100vw" className="object-cover grayscale transition duration-500 group-hover:grayscale-0" />
        </div>
      )}
      <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.14em]">
        <span>{p.outlet}</span>
        <span className="opacity-60">{p.date.slice(0, 4)}</span>
      </div>
      <h3 className={`mt-4 ${T.serif} text-2xl leading-tight tracking-[-0.02em] sm:text-[28px]`}>{t(p.title)}</h3>
      <div className="mt-auto flex items-center justify-between pt-6 font-mono text-[10px] uppercase tracking-[0.14em]">
        <span className={p.kind === 'own' ? 'border border-current px-2 py-1' : 'opacity-60'}>{t(p.kind === 'own' ? ui.own : ui.cov)}</span>
        {p.href && <span>{t(ui.read)} ↗</span>}
      </div>
    </>
  );
  const cls = 'group flex h-full flex-col border border-stone-900 bg-white p-5 transition-colors sm:p-6';
  return p.href ? (
    <a href={p.href} target="_blank" rel="noopener noreferrer" lang={lang} className={`${cls} hover:bg-stone-900 hover:text-[#FAF8F5]`}>{inner}</a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/* ---------- main component export ---------- */
export function HeritageClient() {
  const [lang, setLang] = useState<Lang>('en');
  const t = (o: L) => o[lang];
  const tx = (en: string, ru: string) => (lang === 'en' ? en : ru);
  const sec = 'scroll-mt-32 border-b border-stone-300 py-12 sm:py-16';
  const p = 'text-sm leading-7 text-stone-700';
  const h3 = `${T.serif} text-3xl leading-tight tracking-[-0.025em] sm:text-4xl`;

  return (
    <main id="top" lang={lang} className={`min-h-screen overflow-x-clip ${T.bg} text-stone-900`}>
      <div className="mx-auto w-full max-w-[1500px] px-5 pb-20 pt-28 sm:px-8 sm:pb-28 sm:pt-36 lg:px-12">
        {/* INTRO */}
        <section className="border-b border-stone-300 pb-10 sm:pb-14">
          <h1 className={`max-w-5xl ${T.serif} text-6xl leading-[0.88] tracking-[-0.055em] sm:text-8xl lg:text-[112px]`}>
            {t(ui.heroA)}<br /><span className="text-stone-400">{t(ui.heroB)}</span><br />{t(ui.heroC)}
          </h1>
          <div className="mt-8 grid gap-6 sm:mt-10 sm:grid-cols-[1.2fr_0.8fr] sm:items-end">
            <p className="max-w-2xl text-base leading-7 text-stone-700 sm:text-lg sm:leading-8">{t(ui.lead)}</p>
            <p className="max-w-sm text-xs leading-6 text-stone-500 sm:justify-self-end">{t(ui.note)}</p>
          </div>
          <div className="mt-8 flex flex-wrap gap-2">
            {ui.tags[lang].map((s) => (
              <span key={s} className="border border-stone-300 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-stone-600 sm:text-[10px]">{s}</span>
            ))}
          </div>
          <Fig className="mt-10" ratio="aspect-[16/9]" priority src="TheThinker.jpg" alt={tx('Sculpture “Thought” on Sergey Merkurov’s grave', 'Скульптура «Мысль» на могиле Сергея Меркурова')} caption={tx('“Thought”, on Sergey Merkurov’s grave.', '«Мысль» на могиле Сергея Меркурова.')} />
        </section>

        {/* NAV + LANGUAGE */}
        <nav aria-label="On this page" className={`sticky top-0 z-20 -mx-5 flex items-center justify-between border-b border-stone-300 bg-[#FAF8F5]/95 px-5 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12`}>
          <div className="flex overflow-x-auto">
            {nav.map(([n, label, href]) => (
              <a key={n} href={href} className="flex min-h-11 shrink-0 items-center gap-2 py-2 pr-6 text-xs text-stone-600 transition-colors hover:text-black">
                <span className="font-mono text-[10px] text-stone-400">{n}</span>{t(label)}
              </a>
            ))}
          </div>
          <div role="group" aria-label="Language" className="ml-4 flex shrink-0 border border-stone-300 font-mono text-[10px] uppercase tracking-[0.12em]">
            {(['en', 'ru'] as Lang[]).map((l) => (
              <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l} className={`px-3 py-2 transition-colors ${lang === l ? 'bg-stone-900 text-[#FAF8F5]' : 'text-stone-600 hover:text-black'}`}>{l}</button>
            ))}
          </div>
        </nav>

        {/* 01 FAMILY */}
        <section id="family" className={sec}>
          <Title n="01" eyebrow={tx('Family record', 'Семейный архив')}>
            {tx('Two generations.', 'Два поколения.')}<br />{tx('Different media.', 'Разные медиа.')}
          </Title>
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
            <article className="border-t border-stone-300 pt-5">
              <Fig className="mb-6" ratio="aspect-[4/5]" src="Merkurov1.jpg" alt="Sergey Merkurov" caption="Sergey Merkurov." />
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500">1881–1952 / {tx('Sculpture', 'Скульптура')}</p>
              <h3 className={`mt-4 ${h3}`}>{tx('Sergey Dmitrievich Merkurov', 'Сергей Дмитриевич Меркуров')}</h3>
              <p className={`mt-4 ${p}`}>{tx('Born in Alexandropol, now Gyumri, on 7 November 1881. Studied in Europe, including the Munich Academy of Fine Arts, and worked in Paris in 1905–07, where he studied in Auguste Rodin’s studio — an experience he later called decisive.', 'Родился в Александрополе (ныне Гюмри) 7 ноября 1881 года. Учился в Европе, в том числе в Мюнхенской академии художеств, в 1905–07 годах работал в Париже, в мастерской Огюста Родена, — опыт, который позже называл решающим.')}</p>
              <p className={`mt-4 ${p}`}>{tx('Monumental sculpture and posthumous masks. Director of the Pushkin State Museum of Fine Arts, Moscow, 1944–49. His legacy survives in public monuments, museum collections, archives and the family house in Gyumri.', 'Монументальная скульптура и посмертные маски. Директор ГМИИ им. Пушкина в 1944–49 годах. Наследие сохранилось в городских монументах, музейных собраниях, архивах и семейном доме в Гюмри.')}</p>
              <p className="mt-5 text-xs leading-6 text-stone-500">{tx('Sources', 'Источники')}: <Ext href={S.rodin}>Tears and Blood of Rodin</Ext> · <Ext href={S.museum}>House-Museum</Ext></p>
            </article>
            <article className="border-t border-stone-300 pt-5">
              <Fig className="mb-6" ratio="aspect-[4/5]" src="Gafechian.jpg" alt="Anton Merkurov presenting the book, Yerevan" caption={tx('Anton Merkurov presenting the memoir volume, Gafesjian Center, Yerevan, 22 April 2012.', 'Антон Меркуров представляет книгу воспоминаний, Центр Гафесчяна, Ереван, 22 апреля 2012.')} />
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500">{tx('Born 1981 / Research and contemporary projects', 'Род. 1981 / Исследования и современные проекты')}</p>
              <h3 className={`mt-4 ${h3}`}>{tx('Anton Merkurov', 'Антон Меркуров')}</h3>
              <p className={`mt-4 ${p}`}>{tx('Sergey Merkurov’s great-grandson. Documented engagement with the legacy: advocacy for the Dynamo reliefs, work with the Gyumri house museum, publication and transfer of family archival material, exhibitions, and the digitisation and reinterpretation of Lenin’s death mask.', 'Правнук Сергея Меркурова. Документированная работа с наследием: защита барельефов «Динамо», работа с домом-музеем в Гюмри, публикация и передача семейных архивных материалов, выставки, оцифровка и художественное переосмысление маски Ленина.')}</p>
              <p className={`mt-4 ${p}`}>{tx('Alongside these, his public record includes media and technology work, writing, art-market commentary and experiments with digital distribution.', 'Параллельно — работа в медиа и технологиях, тексты, комментарии об арт-рынке, эксперименты с цифровой дистрибуцией.')}</p>
              <p className="mt-5 text-xs leading-6 text-stone-500">{tx('Sources', 'Источники')}: <Ext href={S.gyumri}>Regional Post</Ext> · <Ext href={S.linkedin}>LinkedIn</Ext></p>
            </article>
          </div>
          <div className="mt-10 grid gap-8 border-t border-stone-200 pt-6 sm:grid-cols-[200px_minmax(0,1fr)]">
            <Fig ratio="aspect-[4/5]" src="Book.jpg" alt="Cover of S. D. Merkurov’s memoir volume" />
            <div>
              <Eyebrow>{tx('Family papers', 'Семейный архив')}</Eyebrow>
              <p className={`max-w-3xl ${p}`}>{tx('The memoir volume — recollections, letters, articles and contemporaries’ accounts — was presented in Yerevan and at the Pushkin Museum in April 2012. Russian Life drew on the family archive for a 2013 profile of the sculptor.', 'Том «Воспоминания, письма, статьи, заметки, суждения современников» представлен в Ереване и в ГМИИ им. Пушкина в апреле 2012 года. Russian Life опирался на семейный архив в профиле скульптора 2013 года.')}</p>
              <Fig className="mt-6 max-w-xl" src="Pushkinsky.jpg" alt="Book presentation, Pushkin Museum" caption={tx('Presentation at the Pushkin Museum, Moscow, 28 April 2012.', 'Презентация в ГМИИ им. Пушкина, 28 апреля 2012.')} />
            </div>
          </div>
        </section>

        {/* 02 MUSEUM */}
        <section id="museum" className={sec}>
          <Title n="02" eyebrow="Gyumri, Armenia">{tx('The family house', 'Семейный дом')}<br />{tx('becomes a museum.', 'становится музеем.')}</Title>
          <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16">
            <div>
              <p className={p}>{tx('The House-Museum occupies the Gyumri house where the sculptor was born: a nineteenth-century residence turned public collection and, today, a cultural centre.', 'Дом-музей занимает дом в Гюмри, где родился скульптор: жилой дом XIX века, ставший публичным собранием и культурным центром.')}</p>
              <div className="mt-6 border-y border-stone-300 py-5">
                <p className="font-mono text-3xl tracking-tight">1869</p>
                <p className="mt-2 text-xs leading-6 text-stone-500">{tx('Built by Fyodor Merkurov, the sculptor’s grandfather, per published museum histories.', 'Построен Фёдором Меркуровым, дедом скульптора, по опубликованной истории музея.')}</p>
              </div>
              <Fig className="mt-8" src="Museum.jpg" alt="Merkurov House-Museum, Gyumri" caption={tx('The House-Museum, Gyumri.', 'Дом-музей Меркурова, Гюмри.')} />
              <Fig className="mt-6" src="Archive.jpg" alt="Handing archive documents to the museum" ratio="aspect-[3/4]" caption={tx('Handing documents from the sculptor’s archive to the museum, 22 September 2012.', 'Передача музею документов из архива скульптора, 22 сентября 2012.')} />
              <p className="mt-4 text-sm"><Ext href={S.museum}>{tx('Official museum website', 'Сайт музея')}</Ext></p>
            </div>
            <div>
              <Timeline rows={museumRows} t={t} />
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Fig src="Museum_Lecture.jpg" alt="Lecture at the museum" caption={tx('Lecture on internet promotion for museums, Gyumri, 2012.', 'Лекция о продвижении музея в интернете, Гюмри, 2012.')} />
                <Fig src="With%20presidentAM.jpg" alt="With President Sargsyan" caption={tx('With President Serzh Sargsyan, Gyumri, 20 September 2013.', 'С президентом Сержем Саргсяном, Гюмри, 20 сентября 2013.')} />
                <Fig src="MuseumEvent.jpg" alt="Event in the museum courtyard" caption={tx('Event in the museum courtyard.', 'Событие во дворе музея.')} />
                <Fig src="Museon.jpg" alt="Exhibition at Muzeon Park" caption={tx('“Sergey Merkurov Archive”, Muzeon Park, Moscow, 2014.', '«Архив Сергея Меркурова», парк «Музеон», Москва, 2014.')} />
              </div>
              <p className="mt-5 text-xs leading-6 text-stone-500">{tx('Sources', 'Источники')}: <Ext href={S.history}>Armenpress</Ext> · <Ext href={S.restoration}>Armenian Museum of Moscow, 2016</Ext> · <Ext href={S.gyumri}>Regional Post</Ext></p>
            </div>
          </div>
          <div className="mt-10 border-t border-stone-200 pt-5">
            <Eyebrow>{t(ui.partners)}</Eyebrow>
            <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
              {logos.map(([f, name]) => (
                <Image key={f} src={IMG + f} alt={name} width={120} height={56} className="h-12 w-auto object-contain opacity-80 grayscale" />
              ))}
            </div>
          </div>
        </section>

        {/* 03 DYNAMO */}
        <section id="dynamo" className={sec}>
          <Title n="03" eyebrow={tx('Moscow / Public monuments', 'Москва / Городские монументы')}>Dynamo.<br />{tx('The fate of six reliefs.', 'Судьба шести барельефов.')}</Title>
          <p className="max-w-3xl text-sm leading-7 text-stone-700 sm:text-base sm:leading-8">{tx('Six large relief panels of athletes decorated the porticos of Moscow’s Dynamo stadium for decades. Their removal in 2012 triggered a public debate about restoration, location and access. Anton Merkurov, as the sculptor’s great-grandson, became a public voice in it.', 'Шесть больших рельефов со спортсменами десятилетиями украшали портики московского стадиона «Динамо». Их демонтаж в 2012 году вызвал общественную дискуссию о реставрации, месте и доступе. Антон Меркуров, правнук скульптора, стал одним из публичных голосов в ней.')}</p>
          <div className="my-8 grid grid-cols-2 gap-4 border-y border-stone-300 py-6 sm:grid-cols-4">
            {[['6', tx('Original relief panels', 'Оригинальных панелей')], ['44', tx('Athletes in published reporting', 'Спортсменов по публикациям')], ['7,000+', tx('Fragments reported in restoration', 'Фрагментов при реставрации')], ['2012→2023', tx('From removal to display', 'От демонтажа до экспозиции')]].map(([n, l]) => (
              <div key={n}><p className="font-mono text-3xl sm:text-4xl">{n}</p><p className="mt-2 text-xs leading-5 text-stone-500">{l}</p></div>
            ))}
          </div>
          <p className="-mt-4 mb-8 text-xs leading-6 text-stone-500">{tx('Figures: The Art Newspaper Russia, 2017 and 2023.', 'Цифры: The Art Newspaper Russia, 2017 и 2023.')}</p>
          <div className="mb-8 grid gap-8 lg:grid-cols-2">
            <Fig src="Basreliefs.jpg" alt="Dynamo reliefs and restorers" caption={tx('Dynamo reliefs and restorers.', 'Барельефы «Динамо» и реставраторы.')} />
            <Timeline rows={dynamoRows} t={t} />
          </div>
          <div className="border-l border-stone-400 pl-4">
            <p className={p}>{tx('The reliefs were restored by specialists, including the St Petersburg workshop “Nasledie”. Anton Merkurov’s documented role was public advocacy and commentary on preservation and placement — not the restoration itself.', 'Реставрацию выполняли специалисты, в том числе петербургская мастерская «Наследие». Документированная роль Антона Меркурова — публичная позиция и комментарии о сохранении и размещении, но не сама реставрация.')}</p>
          </div>
        </section>

        {/* 04 MASKS */}
        <section id="masks" className={sec}>
          <Title n="04" eyebrow={tx('Sculpture / Historical objects', 'Скульптура / Исторические объекты')}>{tx('The death mask', 'Посмертная маска')}<br />{tx('as an archive.', 'как архив.')}</Title>
          <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16">
            <div>
              <p className={p}>{tx('Merkurov is known for posthumous masks of prominent figures. Published descriptions of the collection state that he made more than 300 masks and that masks of 59 political and public figures, including Lenin’s original, were exhibited at the house museum.', 'Меркуров известен посмертными масками видных деятелей. По опубликованным описаниям собрания, он сделал более 300 масок, а в доме-музее экспонировались маски 59 политических и общественных деятелей, включая оригинал маски Ленина.')}</p>
              <p className="mt-5 text-xs leading-6 text-stone-500">{tx('The total made and the number displayed are different figures.', 'Общее число масок и число экспонируемых — разные величины.')}</p>
              <p className="mt-4 text-sm"><Ext href={S.arites}>AriTes — House-Museum</Ext></p>
            </div>
            <div className="space-y-8">
              <div className="border-t border-stone-300 pt-5">
                <Eyebrow>2014 / {tx('Public controversy', 'Публичный спор')}</Eyebrow>
                <h3 className={h3}>{tx('The Lenin mask and a proposed US sale.', 'Маска Ленина и продажа в США.')}</h3>
                <p className={`mt-4 ${p}`}>{tx('The Moscow Times reported on a proposed sale of a Lenin death mask in the United States and Anton Merkurov’s objection to the auction.', 'The Moscow Times сообщила о планируемой продаже посмертной маски Ленина в США и возражении Антона Меркурова против аукциона.')}</p>
                <p className="mt-3 text-sm"><Ext href={S.mt}>The Moscow Times, 16 June 2014</Ext></p>
              </div>
              <div className="border-t border-stone-300 pt-5">
                <Eyebrow>2013 / {tx('Kyiv', 'Киев')}</Eyebrow>
                <h3 className={h3}>{tx('The Kyiv Lenin.', 'Киевский Ленин.')}</h3>
                <p className={`mt-4 ${p}`}>{tx('After the toppling of the Kyiv Lenin monument, Moskovsky Komsomolets interviewed Anton Merkurov as the author’s great-grandson (10 December 2013).', 'После сноса киевского памятника Ленину «Московский комсомолец» поговорил с Антоном Меркуровым как с правнуком автора (10 декабря 2013).')}</p>
                <Fig className="mt-5 max-w-xl" src="LeninFalls.jpg" alt="Toppled Lenin monument, Kyiv" caption={tx('Kyiv, December 2013.', 'Киев, декабрь 2013.')} />
              </div>
            </div>
          </div>
        </section>

        {/* 05 DIGITAL */}
        <section id="digital" className={sec}>
          <Title n="05" eyebrow={tx('Digitisation / Contemporary art', 'Оцифровка / Современное искусство')}>{tx('From a historical cast', 'От исторического слепка')}<br />{tx('to a digital artwork.', 'к цифровому объекту.')}</Title>
          <p className="max-w-3xl text-sm leading-7 text-stone-700 sm:text-base sm:leading-8">{tx('In 2021, Anton Merkurov discussed a project built on a 3D digitisation of Lenin’s death mask, bringing the object into animation and NFT distribution. The published account describes a collaborative production.', 'В 2021 году Антон Меркуров рассказал о проекте на основе 3D-оцифровки посмертной маски Ленина: объект попал в анимацию и NFT. По опубликованному рассказу, проект делался командой.')}</p>
          <div className="my-8 grid gap-4 sm:grid-cols-2">
            <Fig src={MASK_3D} alt="3D-printed Lenin mask on a palm" ratio="aspect-square" caption={tx('3D-printed mask, palm-sized.', 'Напечатанная на 3D-принтере маска размером с ладонь.')} />
            <div className="flex flex-col justify-center border border-stone-900 p-6">
              <Eyebrow>NFT</Eyebrow>
              <p className={`${T.serif} text-3xl leading-tight sm:text-4xl`}>{tx('Animation: Lenin opens his eyes and is slowly covered by grass.', 'Анимация: Ленин открывает глаза и постепенно зарастает травой.')}</p>
              <p className="mt-6 text-sm"><Ext href={NFT}>{tx('View the token on Rarible', 'Токен на Rarible')}</Ext></p>
            </div>
          </div>
          <p className={`max-w-3xl ${p}`}>{tx('Physical object → 3D model → animated artwork. Technical details are attributed to published reporting.', 'Физический объект → 3D-модель → анимированная работа. Технические детали приведены по публикациям.')}</p>
          <div className="mt-6 flex flex-col items-start gap-3 text-sm">
            <Ext href={S.kp}>{tx('Komsomolskaya Pravda, November 2021 — interview', 'Комсомольская правда, ноябрь 2021 — интервью')}</Ext>
            <Ext href={S.tan}>The Art Newspaper, March 2021</Ext>
            <Ext href={S.linkedin}>{tx('Anton Merkurov — “From Lenin’s death mask to AI art curator”', 'Антон Меркуров — «От посмертной маски Ленина до AI-куратора»')}</Ext>
          </div>
        </section>

        {/* 06 ALPHABET */}
        <section id="alphabet" className={sec}>
          <Title n="06" eyebrow={tx('Print / Attribution / Exhibition', 'Печать / Атрибуция / Выставка')}>{tx('The Erotic Alphabet,', 'Эротическая азбука,')}<br />1931.</Title>
          <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16">
            <div>
              <p className={p}>{tx('Images of an erotic alphabet dated 1931 circulate online attributed to Sergey Merkurov. A reproduced sheet bears the inscription “Рисовал С. Д. Меркуров 17-Х-931 г.”', 'В сети ходят изображения эротической азбуки 1931 года с атрибуцией Сергею Меркурову. На воспроизведённом листе надпись: «Рисовал С. Д. Меркуров 17-Х-931 г.»')}</p>
              <p className={`mt-4 ${p}`}>{tx('The attribution remains qualified. Anton Merkurov told Provereno.Media he had not handled the original, and found the signature consistent with his great-grandfather’s handwriting from family archival material.', 'Атрибуция остаётся предположительной. Антон Меркуров сказал «Проверено.Медиа», что оригинал не держал в руках, а подпись считает совпадающей с почерком прадеда по семейным архивным материалам.')}</p>
            </div>
            <div>
              <Timeline rows={alphabetRows} t={t} />
              <div className="mt-6 border-l border-stone-400 pl-4">
                <p className="text-xs leading-6 text-stone-500">{tx('The exhibition and reproductions are documented projects; by themselves they do not establish provenance or authorship of the 1931 sheets.', 'Выставка и репродукции — документированные проекты; сами по себе они не подтверждают происхождение и авторство листов 1931 года.')}</p>
              </div>
              <p className="mt-5 text-sm"><Ext href={S.alphabet}>{tx('Provereno.Media — fact-check', 'Проверено.Медиа — фактчекинг')}</Ext></p>
              <p className="mt-3 text-sm"><Ext href={S.azbuka}>{tx('Explore the project archive', 'Архив проекта')}</Ext></p>
            </div>
          </div>
        </section>

        {/* 07 PRESS */}
        <section id="press" className={sec}>
          <Title n="07" eyebrow={tx('Press', 'Пресса')}>{tx('What was written.', 'Что писали.')}</Title>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {press.map((x) => <PressCard key={x.outlet + x.date + x.title.en} p={x} t={t} lang={lang} />)}
          </div>
        </section>

        {/* 08 SOURCES */}
        <section id="sources" className="scroll-mt-32 py-12 sm:py-16">
          <Title n="08" eyebrow={tx('Sources and verification', 'Источники и проверка')}>{tx('Follow the evidence.', 'Проверяйте по источникам.')}</Title>
          <ol>
            {sourceList.map(([title, href], i) => (
              <li key={href} className="grid grid-cols-[24px_minmax(0,1fr)] gap-3 border-t border-stone-200 py-4 text-sm">
                <span className="pt-0.5 font-mono text-[10px] text-stone-400">{String(i + 1).padStart(2, '0')}</span>
                <Ext href={href}>{title}</Ext>
              </li>
            ))}
          </ol>
          <p className="mt-8 max-w-3xl border-t border-stone-300 pt-5 text-xs leading-6 text-stone-500">{tx('A working historical record. Where provenance or authorship is not conclusively established by the cited sources, the page says so. Personal participation is described separately from the work of institutions, restorers and collaborators.', 'Рабочая историческая запись. Если происхождение или авторство не подтверждены источниками, это указано. Личное участие описано отдельно от работы институций, реставраторов и соавторов.')}</p>
        </section>

        <div className="flex justify-end border-t border-stone-300 pt-5">
          <a href="#top" className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500 hover:text-stone-900">{t(ui.top)}</a>
        </div>
      </div>
    </main>
  );
}
