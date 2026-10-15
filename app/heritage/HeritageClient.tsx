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
  // TODO: 2003 has no source on the page — confirm via Armenpress or drop.
  { d: '2003', x: { en: 'Substantial restoration of the house.', ru: 'Масштабная реставрация дома.' } },
  { d: '2012', x: { en: 'Anton Merkurov presents the book of the sculptor’s memoirs in Yerevan (22 April, Gafesjian Center) and at the Pushkin Museum, Moscow (28 April); leads the seminar “New Technologies for Museums” in Gyumri (6 June); on 22 September hands documents from the sculptor’s archive to the museum.', ru: 'Антон Меркуров представляет книгу воспоминаний скульптора в Ереване (22 апреля, Центр Гафесчяна) и в ГМИИ им. Пушкина (28 апреля); проводит в Гюмри семинар «Новые технологии для музеев» (6 июня); 22 сентября передаёт музею документы из архива скульптора.' } },
  { d: '2013', x: { en: 'Gyumri is CIS Cultural Capital; Anton meets Armenian President Serzh Sargsyan at the exhibition (20 September). His essay “The Museum as a Tool of City Development” appears in Chastny Korrespondent (30 October).', ru: 'Гюмри — культурная столица СНГ; Антон встречается с президентом Армении Сержем Саргсяном на выставке (20 сентября). В «Частном корреспонденте» выходит его статья «Музей как инструмент развития города» (30 октября).' } },
  { d: '2014', x: { en: 'Exhibition “Sergey Merkurov Archive” on photo stands at Muzeon Park, Moscow (from 20 April): monumental portraits alongside lesser-known sculpture and death masks.', ru: 'Выставка «Архив Сергея Меркурова» на фотостендах в парке «Музеон», Москва (с 20 апреля): монументальные портреты и менее известная пластика, посмертные маски.' } },
  { d: '2014', x: { en: 'Armenpress (5 December): the Culture Minister visits the museum. A renovation planned for 2015 (about 45 million AMD, per the report) had been postponed since 2013. The museum holds about 3,000 items, with 30 masks and 13 sculptures on display, and a large archival display donated by the sculptor’s heirs.', ru: 'Armenpress (5 декабря): министр культуры посещает музей. Ремонт, запланированный на 2015 год (около 45 млн драмов по данным репортажа), откладывался с 2013 года. В собрании около 3 000 предметов; экспонируются 30 масок и 13 скульптур, а также большая архивная экспозиция, переданная наследниками скульптора.' } },
  { d: '2016', x: { en: 'The Armenian Museum of Moscow reports that restoration of the house began with Anton Merkurov’s active participation.', ru: 'Армянский музей Москвы сообщает, что реставрация дома началась при активном участии Антона Меркурова.' } },
  { d: '2023', x: { en: 'Further renovation and reopening reported by Armenian media.', ru: 'Армянские СМИ сообщают о дальнейшем ремонте и повторном открытии.' } },
];

const dynamoRows: Row[] = [
  { d: '2012', x: { en: 'The reliefs are removed during stadium redevelopment. BBC News Russian Service reports on the campaign to preserve them.', ru: 'Барельефы демонтированы при реконструкции стадиона. Русская служба Би-би-си рассказывает о борьбе за их сохранение.' } },
  { d: '2016–18', x: { en: 'Comprehensive restoration, two years (mos.ru; The Art Newspaper Russia). The reliefs are recognised as cultural heritage objects, so copies, not the originals, were placed on the rebuilt facades.', ru: 'Комплексная реставрация, два года (mos.ru; The Art Newspaper Russia). Барельефы признаны объектами культурного наследия, поэтому на фасады вернули копии, а не оригиналы.' } },
  { d: '2017', x: { en: 'Reporting from the restoration workshop; Anton Merkurov is quoted after visiting it.', ru: 'Репортаж из реставрационной мастерской; цитируется Антон Меркуров после визита.' } },
  { d: '2019', x: { en: 'Where the originals should be shown remains open. Anton argues they should stay tied to the historic stadium and visible to the public.', ru: 'Вопрос о месте экспонирования оригиналов не решён. Антон выступает за то, чтобы они остались связаны с историческим стадионом и были доступны публике.' } },
  { d: '2022–23', x: { en: 'A 1,500 m² art space opens at Arena Plaza, VTB Arena (announced for 30 December 2022; ceremony on 18 January 2023, attended by Anton Merkurov). The six panels face each other for the first time in over 80 years.', ru: 'В «Арена Плаза» на ВТБ Арене открывается арт-пространство в 1 500 м² (анонс на 30 декабря 2022; церемония 18 января 2023, среди гостей — Антон Меркуров). Шесть панелей впервые за более чем 80 лет стоят лицом друг к другу.' } },
];

const alphabetRows: Row[] = [
  { d: '1931', x: { en: 'Date inscribed on a sheet reproduced in circulated images. Provenance and authorship are not conclusively established by the cited fact-check.', ru: 'Дата на листе, воспроизведённом в сетевых копиях. Происхождение и авторство не установлены окончательно в цитируемом фактчекинге.' } },
  { d: '2020', x: { en: 'Anton Merkurov organises an exhibition around the series at Cube art space, Moscow; a screenprint edition and postcards are produced from redrawings of low-resolution scans.', ru: 'Антон Меркуров организует выставку по мотивам серии в арт-пространстве Cube, Москва; выпущены сериграфии и открытки по перерисовкам низкокачественных сканов.' } },
  { d: '2021', x: { en: 'Provereno.Media publishes a fact-check of the attribution, the images and the exhibition.', ru: '«Проверено.Медиа» публикует фактчекинг атрибуции, изображений и выставки.' } },
];

type Press = { outlet: string; date: string; title: L; kind: 'own' | 'cov'; href?: string; img?: string };
// href missing = link not in the PDF text; fill in before publishing.
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
  { outlet: 'Москвич Mag', date: '', title: { en: 'Great-grandson of Merkurov plans a sculpture theme park in Izmailovo', ru: 'Правнук монументалиста Меркурова откроет в Измайлово тематический парк скульптуры' }, kind: 'cov', href: 'https://moskvichmag.ru/?p=80720' },
  { outlet: 'Москвич Mag', date: '2023-01', title: { en: 'See how the Dynamo stadium reliefs were restored', ru: 'Посмотрите, как отреставрировали барельефы с фасадов стадиона «Динамо»' }, kind: 'cov', href: 'https://moskvichmag.ru/gorod/posmotrite-kak-otrestavrirovali-barelefy-s-fasadov-stadiona-dinamo/' },
  { outlet: 'Rambler / City news', date: '2023-01-18', title: { en: 'Art space with Merkurov’s reliefs opens at VTB Arena', ru: 'На ВТБ Арене в САО открыли арт-пространство с барельефами Сергея Меркурова' }, kind: 'cov', href: 'https://news.rambler.ua/moscow_city/50052225-na-vtb-arene-v-sao-otkryli-art-prostranstvo-s-barelefami-sergeya-merkurova/amp/' },
  { outlet: 'Смотрим (ВГТРК)', date: '', title: { en: 'The famous Dynamo reliefs presented after restoration', ru: 'Знаменитые барельефы стадиона «Динамо» представили после реставрации' }, kind: 'cov', href: 'https://smotrim.ru/journal/3156761' },
  { outlet: 'Мэр Москвы / mos.ru', date: '2022-12', title: { en: 'Art space with Merkurov’s reliefs to open at Dynamo on 30 December', ru: 'Арт-пространство с барельефами Сергея Меркурова откроется на стадионе «Динамо»' }, kind: 'cov', href: 'https://www.mos.ru/news/item/118004073' },
  { outlet: 'Коммерсантъ FM', date: '', title: { en: 'A Lenin death mask kept by Merkurov goes to auction in New York', ru: 'Маска Ленина, которую оставил себе Меркуров, выставлена на аукцион в Нью-Йорке' }, kind: 'cov', href: 'https://www.kommersant.ru/doc/213272' },
  { outlet: 'Armenpress (HY)', date: '2014-12-05', title: { en: 'Merkurov House-Museum to be renovated in 2015', ru: 'Дом-музей Сергея Меркурова отремонтируют в 2015 году' }, kind: 'cov', href: 'https://armenpress.am/hy/article/786759' },
  { outlet: 'Provereno.Media', date: '2021-07-20', title: { en: 'Did Merkurov draw the Soviet erotic alphabet?', ru: 'Правда ли, что советскую эротическую азбуку нарисовал скульптор Меркуров' }, kind: 'cov', href: S.alphabet },
];

const sourceList: [string, string][] = [
  ['Sergey Merkurov House-Museum', S.museum],
  ['Armenpress — history of the house museum', S.history],
  ['Armenian Museum of Moscow, 2016', S.restoration],
  ['Regional Post — Anton Merkurov', S.gyumri],
  ['AriTes — House-Museum collection', S.arites],
  ['Armenpress (Armenian) — museum renovation, December 2014', 'https://armenpress.am/hy/article/786759'],
  ['Evn magazine (Armenian) — Merkurov House-Museum', 'https://evnmag.com/articles/qaxaqic-dours-tangaranayin-chanaparhordoutyoun.html'],
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

/* ---------- layout primitives ---------- */
const wrap = 'mx-auto w-full max-w-[1280px] px-5 sm:px-8 lg:px-12';
const prose = 'max-w-[62ch] text-[15px] leading-[1.75] text-stone-700';
const mono = 'font-mono text-[11px] uppercase tracking-[0.14em] text-stone-500';

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-stone-300 underline-offset-4 transition-colors hover:decoration-stone-900">
      {children}<span aria-hidden="true" className="ml-1 text-[10px]">↗</span>
    </a>
  );
}

function Section({ id, n, label, title, children }: { id: string; n: string; label: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16 border-t border-stone-900 py-14 sm:py-20">
      <div className={wrap}>
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
          <header className="lg:col-span-4">
            <div className="lg:sticky lg:top-24">
              <p className={mono}>{n} — {label}</p>
              <h2 className={`${T.serif} mt-4 whitespace-pre-line text-4xl leading-[1.02] tracking-[-0.03em] sm:text-5xl`}>{title}</h2>
            </div>
          </header>
          <div className="min-w-0 space-y-10 lg:col-span-8">{children}</div>
        </div>
      </div>
    </section>
  );
}

function Fig({ src, alt, caption, ratio = 'aspect-[4/3]', contain = false, priority = false }: { src: string; alt: string; caption?: string; ratio?: string; contain?: boolean; priority?: boolean }) {
  return (
    <figure className="min-w-0">
      <div className={`relative w-full overflow-hidden bg-stone-200 ${ratio}`}>
        <Image src={src.startsWith('http') ? src : IMG + src} alt={alt} fill priority={priority} sizes="(min-width:1024px) 40vw, 100vw" className={contain ? 'object-contain' : 'object-cover'} />
      </div>
      {caption && <figcaption className="mt-3 text-xs leading-5 text-stone-500">{caption}</figcaption>}
    </figure>
  );
}

function Gallery({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) {
  return <div className={`grid items-start gap-x-5 gap-y-8 ${cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>{children}</div>;
}

function Timeline({ rows, t }: { rows: Row[]; t: (o: L) => string }) {
  return (
    <dl className="border-b border-stone-200">
      {rows.map((r) => (
        <div key={r.d + r.x.en.slice(0, 10)} className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-5 border-t border-stone-200 py-4 sm:grid-cols-[96px_minmax(0,1fr)]">
          <dt className="pt-0.5 font-mono text-xs tabular-nums text-stone-500">{r.d}</dt>
          <dd className="text-sm leading-7 text-stone-700">{t(r.x)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Stats({ items }: { items: [string, string][] }) {
  return (
    <div className="grid grid-cols-2 border-y border-stone-300 sm:grid-cols-4 sm:divide-x sm:divide-stone-300">
      {items.map(([n, l]) => (
        <div key={n} className="py-5 sm:px-5 sm:first:pl-0">
          <p className="font-mono text-2xl sm:text-3xl">{n}</p>
          <p className="mt-2 text-xs leading-5 text-stone-500">{l}</p>
        </div>
      ))}
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="border-l-2 border-stone-900 pl-4 text-sm leading-7 text-stone-700">{children}</p>;
}

function Links({ children }: { children: ReactNode }) {
  return <div className="flex flex-col items-start gap-3 text-sm">{children}</div>;
}

function PressCard({ p, t, lang }: { p: Press; t: (o: L) => string; lang: Lang }) {
  const body = (
    <>
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-stone-100">
        {p.img ? (
          <Image src={IMG + p.img} alt="" fill sizes="(min-width:1024px) 33vw, 100vw" className="object-cover grayscale transition duration-500 group-hover:grayscale-0" />
        ) : (
          <span className={`absolute inset-0 flex items-end p-5 ${T.serif} text-3xl leading-none tracking-[-0.02em] text-stone-400 transition-colors group-hover:text-stone-200`}>{p.outlet}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.14em]">
          <span className="min-w-0 truncate">{p.outlet}</span>
          <span className="shrink-0 opacity-60">{p.date.slice(0, 4)}</span>
        </div>
        <h3 className={`mt-3 ${T.serif} text-2xl leading-[1.15] tracking-[-0.015em]`}>{t(p.title)}</h3>
        <div className="mt-auto flex items-center justify-between pt-6 font-mono text-[10px] uppercase tracking-[0.14em]">
          <span className={p.kind === 'own' ? 'border border-current px-2 py-1' : 'opacity-60'}>{t(p.kind === 'own' ? ui.own : ui.cov)}</span>
          {p.href && <span>{t(ui.read)} ↗</span>}
        </div>
      </div>
    </>
  );
  const cls = 'group flex h-full flex-col border border-stone-900 bg-white transition-colors';
  return p.href ? (
    <a href={p.href} target="_blank" rel="noopener noreferrer" lang={lang} className={`${cls} hover:bg-stone-900 hover:text-[#FAF8F5]`}>{body}</a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/* ---------- page ---------- */
export default function HeritageClient() {
  const [lang, setLang] = useState<Lang>('en');
  const t = (o: L) => o[lang];
  const tx = (en: string, ru: string) => (lang === 'en' ? en : ru);

  return (
    <main id="top" lang={lang} className={`min-h-screen overflow-x-clip ${T.bg} text-stone-900`}>
      {/* HERO */}
      <header className={`${wrap} pb-12 pt-28 sm:pb-16 sm:pt-36`}>
        <h1 className={`${T.serif} text-[clamp(3.5rem,11vw,7.5rem)] leading-[0.9] tracking-[-0.05em]`}>
          {t(ui.heroA)} <span className="text-stone-400">{t(ui.heroB)}</span> {t(ui.heroC)}
        </h1>
        <div className="mt-10 grid gap-6 lg:grid-cols-12 lg:gap-12">
          <p className="text-lg leading-8 text-stone-700 lg:col-span-7">{t(ui.lead)}</p>
          <p className="text-xs leading-6 text-stone-500 lg:col-span-4 lg:col-start-9">{t(ui.note)}</p>
        </div>
        <div className="mt-8 flex flex-wrap gap-2">
          {ui.tags[lang].map((s) => (
            <span key={s} className="border border-stone-300 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-stone-600">{s}</span>
          ))}
        </div>
        <div className="mt-10">
          <Fig priority ratio="aspect-[16/9] sm:aspect-[21/9]" src="TheThinker.jpg" alt={tx('Sculpture “Thought” on Sergey Merkurov’s grave', 'Скульптура «Мысль» на могиле Сергея Меркурова')} caption={tx('“Thought”, on Sergey Merkurov’s grave.', '«Мысль» на могиле Сергея Меркурова.')} />
        </div>
      </header>

      {/* STICKY NAV — TODO: set top-* to the site header height */}
      <nav aria-label="On this page" className="sticky top-0 z-20 border-y border-stone-300 bg-[#FAF8F5]/95 backdrop-blur">
        <div className={`${wrap} flex items-center gap-4`}>
          <div className="flex min-w-0 flex-1 overflow-x-auto">
            {nav.map(([n, label, href]) => (
              <a key={n} href={href} className="flex min-h-11 shrink-0 items-center gap-2 pr-6 text-xs text-stone-600 transition-colors hover:text-black">
                <span className="font-mono text-[10px] text-stone-400">{n}</span>{t(label)}
              </a>
            ))}
          </div>
          <div role="group" aria-label="Language" className="flex shrink-0 border border-stone-300 font-mono text-[10px] uppercase tracking-[0.12em]">
            {(['en', 'ru'] as Lang[]).map((l) => (
              <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l} className={`px-3 py-1.5 transition-colors ${lang === l ? 'bg-stone-900 text-[#FAF8F5]' : 'text-stone-600 hover:text-black'}`}>{l}</button>
            ))}
          </div>
        </div>
      </nav>

      {/* 01 FAMILY */}
      <Section id="family" n="01" label={tx('Family record', 'Семейный архив')} title={tx('Two generations.\nDifferent media.', 'Два поколения.\nРазные медиа.')}>
        <div className="grid gap-10 sm:grid-cols-2">
          <article className="space-y-4">
            <Fig ratio="aspect-[4/5]" src="Merkurov1.jpg" alt="Sergey Merkurov" caption="Sergey Merkurov." />
            <p className={mono}>1881–1952 / {tx('Sculpture', 'Скульптура')}</p>
            <h3 className={`${T.serif} text-3xl leading-tight`}>{tx('Sergey Dmitrievich Merkurov', 'Сергей Дмитриевич Меркуров')}</h3>
            <p className="text-sm leading-7 text-stone-700">{tx('Born in Alexandropol, now Gyumri, on 7 November 1881. Studied in Europe, including the Munich Academy of Fine Arts; worked in Paris in 1905–07 and studied in Auguste Rodin’s studio, an experience he later called decisive. Monumental sculptor and master of the posthumous mask; director of the Pushkin Museum of Fine Arts, Moscow, 1944–49.', 'Родился в Александрополе (ныне Гюмри) 7 ноября 1881 года. Учился в Европе, в том числе в Мюнхенской академии художеств; в 1905–07 годах работал в Париже, в мастерской Огюста Родена, — опыт, который позже называл решающим. Скульптор-монументалист и мастер посмертной маски; директор ГМИИ им. Пушкина в 1944–49 годах.')}</p>
            <p className="text-xs leading-6 text-stone-500">{t(ui.sources)}: <Ext href={S.rodin}>Tears and Blood of Rodin</Ext> · <Ext href={S.museum}>House-Museum</Ext></p>
          </article>
          <article className="space-y-4">
            <Fig ratio="aspect-[4/5]" src="Gafechian.jpg" alt="Anton Merkurov presenting the book, Yerevan" caption={tx('Presenting the memoir volume, Gafesjian Center, Yerevan, 22 April 2012.', 'Презентация книги воспоминаний, Центр Гафесчяна, Ереван, 22 апреля 2012.')} />
            <p className={mono}>{tx('Born 1981 / Research and projects', 'Род. 1981 / Исследования и проекты')}</p>
            <h3 className={`${T.serif} text-3xl leading-tight`}>{tx('Anton Merkurov', 'Антон Меркуров')}</h3>
            <p className="text-sm leading-7 text-stone-700">{tx('Great-grandson of the sculptor. Documented work with the legacy: advocacy for the Dynamo reliefs, the Gyumri house museum, publication and transfer of family archival material, exhibitions, and the digitisation and reinterpretation of Lenin’s death mask. Alongside: media and technology work, writing and art-market commentary.', 'Правнук скульптора. Документированная работа с наследием: защита барельефов «Динамо», дом-музей в Гюмри, публикация и передача семейных архивных материалов, выставки, оцифровка и переосмысление маски Ленина. Параллельно — медиа и технологии, тексты, комментарии об арт-рынке.')}</p>
            <p className="text-xs leading-6 text-stone-500">{t(ui.sources)}: <Ext href={S.gyumri}>Regional Post</Ext> · <Ext href={S.linkedin}>LinkedIn</Ext></p>
          </article>
        </div>
        <div className="border-t border-stone-200 pt-8">
          <p className={`${mono} mb-4`}>{tx('Family papers', 'Семейные бумаги')}</p>
          <p className={`${prose} mb-6`}>{tx('The memoir volume — recollections, letters, articles and contemporaries’ accounts — was presented in Yerevan and at the Pushkin Museum in April 2012. Russian Life drew on the family archive for a 2013 profile.', 'Том «Воспоминания, письма, статьи, заметки, суждения современников» представлен в Ереване и в ГМИИ им. Пушкина в апреле 2012 года. Russian Life опирался на семейный архив в профиле 2013 года.')}</p>
          <Gallery>
            <Fig contain src="Book.jpg" alt="Cover of the memoir volume" caption={tx('S. D. Merkurov: memoir volume.', 'С. Д. Меркуров: том воспоминаний.')} />
            <Fig src="Pushkinsky.jpg" alt="Book presentation, Pushkin Museum" caption={tx('Pushkin Museum, Moscow, 28 April 2012.', 'ГМИИ им. Пушкина, 28 апреля 2012.')} />
          </Gallery>
          {/* TODO: concrete inventory of the archive (volume, what is published). */}
        </div>
      </Section>

      {/* 02 MUSEUM */}
      <Section id="museum" n="02" label="Gyumri, Armenia" title={tx('The family house\nbecomes a museum.', 'Семейный дом\nстановится музеем.')}>
        <p className={prose}>{tx('The House-Museum occupies the Gyumri house where the sculptor was born: a nineteenth-century residence turned public collection and cultural centre. Built in 1869 by his grandfather Fyodor Merkurov, per published museum histories.', 'Дом-музей занимает дом в Гюмри, где родился скульптор: жилой дом XIX века, ставший публичным собранием и культурным центром. Построен в 1869 году дедом скульптора Фёдором Меркуровым, по опубликованной истории музея.')}</p>
        <Gallery>
          <Fig src="Museum.jpg" alt="Merkurov House-Museum, Gyumri" caption={tx('The House-Museum, Gyumri.', 'Дом-музей Меркурова, Гюмри.')} />
          <Fig src="Archive.jpg" alt="Handing archive documents to the museum" caption={tx('Handing archive documents to the museum, 22 September 2012.', 'Передача документов из архива музею, 22 сентября 2012.')} />
        </Gallery>
        <Timeline rows={museumRows} t={t} />
        <Gallery>
          <Fig src="Museum_Lecture.jpg" alt="Lecture at the museum" caption={tx('Lecture on internet promotion, Gyumri, 2012.', 'Лекция о продвижении в интернете, Гюмри, 2012.')} />
          <Fig src="With%20presidentAM.jpg" alt="With President Sargsyan" caption={tx('With President Serzh Sargsyan, 20 September 2013.', 'С президентом Сержем Саргсяном, 20 сентября 2013.')} />
          <Fig src="MuseumEvent.jpg" alt="Event in the museum courtyard" caption={tx('Event in the museum courtyard.', 'Событие во дворе музея.')} />
          <Fig src="Museon.jpg" alt="Exhibition at Muzeon Park" caption={tx('“Sergey Merkurov Archive”, Muzeon, 2014.', '«Архив Сергея Меркурова», «Музеон», 2014.')} />
        </Gallery>
        <p className="text-xs leading-6 text-stone-500">{t(ui.sources)}: <Ext href={S.history}>Armenpress</Ext> · <Ext href="https://armenpress.am/hy/article/786759">Armenpress (HY)</Ext> · <Ext href={S.restoration}>Armenian Museum of Moscow</Ext> · <Ext href={S.museum}>{tx('museum site', 'сайт музея')}</Ext></p>
        <div className="border-t border-stone-200 pt-6">
          <p className={`${mono} mb-5`}>{t(ui.partners)}</p>
          <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
            {logos.map(([f, name]) => (
              <Image key={f} src={IMG + f} alt={name} width={120} height={56} className="h-12 w-auto object-contain opacity-80 grayscale" />
            ))}
          </div>
        </div>
      </Section>

      {/* 03 DYNAMO */}
      <Section id="dynamo" n="03" label={tx('Moscow / Public monuments', 'Москва / Монументы')} title={tx('Dynamo.\nThe fate of six reliefs.', 'Динамо.\nСудьба шести барельефов.')}>
        <p className={prose}>{tx('Six large relief panels of athletes decorated the porticos of Moscow’s Dynamo stadium for decades. Their removal in 2012 triggered a public debate about restoration, location and access; Anton Merkurov was one of its public voices.', 'Шесть больших рельефов со спортсменами десятилетиями украшали портики московского стадиона «Динамо». Их демонтаж в 2012 году вызвал дискуссию о реставрации, месте и доступе; Антон Меркуров был одним из публичных голосов в ней.')}</p>
        <Stats items={[['6', tx('Original panels', 'Оригинальных панелей')], ['44', tx('Athletes, per reporting', 'Спортсменов по публикациям')], ['7,000+', tx('Fragments in restoration', 'Фрагментов при реставрации')], ['2012→2023', tx('Removal to display', 'От демонтажа до экспозиции')]]} />
        {/* TODO: confirm which of The Art Newspaper Russia 2017 / 2023 carries 44 and 7,000+. */}
        <p className="-mt-6 text-xs leading-6 text-stone-500">{tx('Figures: The Art Newspaper Russia, 2017 and 2023.', 'Цифры: The Art Newspaper Russia, 2017 и 2023.')}</p>
        <Fig src="Basreliefs.jpg" alt="Dynamo reliefs and restorers" caption={tx('Dynamo reliefs and restorers. The six panels: Footballers, Combine Harvester, Tractor, Airplanes, Red Army Men, Strongmen; installed on the south and north porticos in 1930.', 'Барельефы «Динамо» и реставраторы. Шесть панелей: «Футболисты», «Комбайн», «Трактор», «Аэропланы», «Красноармейцы», «Силачи»; установлены на южном и северном портиках в 1930 году.')} />
        <Timeline rows={dynamoRows} t={t} />
        <Note>{tx('The reliefs were restored by specialists, including the St Petersburg workshop “Nasledie”. Anton Merkurov’s documented role was public advocacy and commentary on preservation and placement, not the restoration itself.', 'Реставрацию выполняли специалисты, в том числе петербургская мастерская «Наследие». Документированная роль Антона Меркурова — публичная позиция и комментарии о сохранении и размещении, а не сама реставрация.')}</Note>
      </Section>

      {/* 04 MASKS */}
      <Section id="masks" n="04" label={tx('Sculpture / Historical objects', 'Скульптура / Исторические объекты')} title={tx('The death mask\nas an archive.', 'Посмертная маска\nкак архив.')}>
        <p className={prose}>{tx('Merkurov is known for posthumous masks of prominent figures. Published figures differ: more than 300 masks made in total (AriTes; Evn magazine); masks of 59 leaders and public figures reported as exhibited (AriTes); and, per Armenpress in December 2014, 30 masks and 13 sculptures on display among about 3,000 items. These figures refer to different things and dates.', 'Меркуров известен посмертными масками видных деятелей. Публикуемые цифры различаются: более 300 масок сделано всего (AriTes; Evn magazine); маски 59 деятелей названы среди экспонировавшихся (AriTes); по данным Armenpress на декабрь 2014 — 30 масок и 13 скульптур в экспозиции из около 3 000 предметов. Это цифры о разных вещах и датах.')}</p>
        <div className="border-t border-stone-300 pt-6">
          <p className={`${mono} mb-3`}>2014 / {tx('Public controversy', 'Публичный спор')}</p>
          <h3 className={`${T.serif} mb-4 text-3xl leading-tight`}>{tx('The Lenin mask and a proposed US sale.', 'Маска Ленина и продажа в США.')}</h3>
          <p className={prose}>{tx('The Moscow Times reported that a Lenin death mask, supposedly kept by Merkurov, was offered by the Boston-based RR Auction (estimate $35,000–40,000). Anton Merkurov told the paper that the mask is Soviet cultural heritage and its sale illegal, and that the family had stopped several earlier attempts at auction. The article also questions whether the mask is an original.', 'The Moscow Times сообщила, что посмертную маску Ленина, предположительно оставленную себе Меркуровым, выставил на торги бостонский RR Auction (оценка $35–40 тыс.). Антон Меркуров заявил изданию, что маска — часть советского культурного наследия, а её продажа незаконна, и что семья ранее останавливала несколько попыток аукциона. В статье также ставится вопрос о подлинности маски.')}</p>
          <p className="mt-4 text-sm"><Ext href={S.mt}>The Moscow Times, 16 June 2014</Ext></p>
        </div>
        <div className="border-t border-stone-300 pt-6">
          <p className={`${mono} mb-3`}>2013 / {tx('Kyiv', 'Киев')}</p>
          <h3 className={`${T.serif} mb-4 text-3xl leading-tight`}>{tx('The Kyiv Lenin.', 'Киевский Ленин.')}</h3>
          <p className={`${prose} mb-6`}>{tx('After the Kyiv Lenin monument was toppled, Moskovsky Komsomolets spoke to Anton Merkurov as the author’s great-grandson (10 December 2013).', 'После сноса киевского памятника Ленину «Московский комсомолец» поговорил с Антоном Меркуровым как с правнуком автора (10 декабря 2013).')}</p>
          <Fig src="LeninFalls.jpg" alt="Toppled Lenin monument, Kyiv" caption={tx('Kyiv, December 2013.', 'Киев, декабрь 2013.')} />
        </div>
      </Section>

      {/* 05 DIGITAL */}
      <Section id="digital" n="05" label={tx('Digitisation / Contemporary art', 'Оцифровка / Современное искусство')} title={tx('From a historical cast\nto a digital artwork.', 'От исторического слепка\nк цифровому объекту.')}>
        <p className={prose}>{tx('In 2021, Anton Merkurov discussed a project built on a 3D digitisation of Lenin’s death mask, taking the object into animation and NFT distribution. The published account describes a collaborative production. Physical object → 3D model → animated artwork; technical details are attributed to published reporting.', 'В 2021 году Антон Меркуров рассказал о проекте на основе 3D-оцифровки посмертной маски Ленина: объект попал в анимацию и NFT. По опубликованному рассказу, проект делался командой. Физический объект → 3D-модель → анимированная работа; технические детали приведены по публикациям.')}</p>
        <Gallery>
          <Fig src={MASK_3D} alt="3D-printed Lenin mask on a palm" caption={tx('3D-printed mask, palm-sized.', 'Напечатанная на 3D-принтере маска размером с ладонь.')} />
          <a href={NFT} target="_blank" rel="noopener noreferrer" className="group flex aspect-[4/3] flex-col justify-between border border-stone-900 p-5 transition-colors hover:bg-stone-900 hover:text-[#FAF8F5]">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em]">NFT</span>
            <span className={`${T.serif} text-2xl leading-tight sm:text-3xl`}>{tx('Lenin opens his eyes and is slowly covered by grass.', 'Ленин открывает глаза и постепенно зарастает травой.')}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em]">Rarible ↗</span>
          </a>
        </Gallery>
        <Links>
          <Ext href={S.kp}>{tx('Komsomolskaya Pravda, 6 Nov 2021 — interview', 'Комсомольская правда, 6 ноября 2021 — интервью')}</Ext>
          <Ext href={S.tan}>The Art Newspaper, March 2021</Ext>
          <Ext href={S.linkedin}>{tx('“From Lenin’s death mask to AI art curator”', '«От посмертной маски Ленина до AI-куратора»')}</Ext>
        </Links>
      </Section>

      {/* 06 ALPHABET */}
      <Section id="alphabet" n="06" label={tx('Print / Attribution', 'Печать / Атрибуция')} title={tx('The Erotic Alphabet,\n1931.', 'Эротическая азбука,\n1931.')}>
        <p className={prose}>{tx('Images of an erotic alphabet dated 1931 circulate online attributed to Sergey Merkurov. A reproduced sheet bears the inscription “Рисовал С. Д. Меркуров 17-Х-931 г.” The attribution remains qualified: Anton Merkurov told Provereno.Media he had not handled the original, and found the signature consistent with his great-grandfather’s handwriting from family archival material.', 'В сети ходят изображения эротической азбуки 1931 года с атрибуцией Сергею Меркурову. На воспроизведённом листе надпись: «Рисовал С. Д. Меркуров 17-Х-931 г.» Атрибуция остаётся предположительной: Антон Меркуров сказал «Проверено.Медиа», что оригинал не держал в руках, а подпись считает совпадающей с почерком прадеда по семейным архивным материалам.')}</p>
        <Timeline rows={alphabetRows} t={t} />
        <Note>{tx('The exhibition and reproductions are documented projects; by themselves they do not establish provenance or authorship of the 1931 sheets.', 'Выставка и репродукции — документированные проекты; сами по себе они не подтверждают происхождение и авторство листов 1931 года.')}</Note>
        {/* Check rights and content suitability before adding an image here. */}
        <Links>
          <Ext href={S.alphabet}>{tx('Provereno.Media — fact-check', 'Проверено.Медиа — фактчекинг')}</Ext>
          <Ext href={S.azbuka}>{tx('Explore the project archive', 'Архив проекта')}</Ext>
        </Links>
      </Section>

      {/* 07 PRESS */}
      <section id="press" className="scroll-mt-16 border-t border-stone-900 py-14 sm:py-20">
        <div className={wrap}>
          <p className={mono}>07 — {tx('Press', 'Пресса')}</p>
          <h2 className={`${T.serif} mb-10 mt-4 text-4xl leading-[1.02] tracking-[-0.03em] sm:text-5xl`}>{tx('What was written.', 'Что писали.')}</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {press.map((x) => <PressCard key={x.outlet + x.date + x.title.en} p={x} t={t} lang={lang} />)}
          </div>
        </div>
      </section>

      {/* 08 SOURCES */}
      <Section id="sources" n="08" label={tx('Sources and verification', 'Источники и проверка')} title={tx('Follow\nthe evidence.', 'Проверяйте\nпо источникам.')}>
        <ol>
          {sourceList.map(([title, href], i) => (
            <li key={href} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 border-t border-stone-200 py-3.5 text-sm">
              <span className="pt-0.5 font-mono text-[10px] text-stone-400">{String(i + 1).padStart(2, '0')}</span>
              <Ext href={href}>{title}</Ext>
            </li>
          ))}
        </ol>
        <p className="max-w-[62ch] text-xs leading-6 text-stone-500">{tx('A working historical record. Where provenance or authorship is not conclusively established by the cited sources, the page says so. Personal participation is described separately from the work of institutions, restorers and collaborators.', 'Рабочая историческая запись. Если происхождение или авторство не подтверждены источниками, это указано. Личное участие описано отдельно от работы институций, реставраторов и соавторов.')}</p>
      </Section>

      <div className="border-t border-stone-900">
        <div className={`${wrap} flex justify-end py-5`}>
          <a href="#top" className={`${mono} hover:text-stone-900`}>{t(ui.top)}</a>
        </div>
      </div>
    </main>
  );
}
