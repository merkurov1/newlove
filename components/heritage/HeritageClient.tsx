'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowUpRight,
  ExternalLink,
  Calendar,
  Layers,
  Sparkles,
  Maximize2,
  X,
  ChevronRight,
  Share2,
  Check,
  Building2,
  BookOpen,
  Eye,
  Award,
  Globe,
  ArrowUp,
  FileText,
} from 'lucide-react';

type Lang = 'en' | 'ru';
type L = { en: string; ru: string };

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
  tan: 'https://www.theartnewspaper.com/2021/03/19/pussy-riots-weekly-nft-drop-is-just-one-instance-of-russian-and-ukrainian-artists-embracing-new-modes-of-online-selling',
  linkedin:
    'https://www.linkedin.com/posts/merkurov_from-lenins-death-mask-to-ai-art-curator-activity-7400837518541234176-qG5L',
  rodin: 'https://oms.ru/sergej-merkurov-slezy-i-krov-rodena',
  azbuka: 'https://merkurov.love/azbuka/',
};

type Row = { d: string; x: L };

const museumRows: Row[] = [
  {
    d: '1869',
    x: {
      en: 'The family house is built in Alexandropol (Gyumri) by Fyodor Merkurov, the sculptor’s grandfather.',
      ru: 'Дом построен в Александрополе (Гюмри) Фёдором Меркуровым, дедом скульптора.',
    },
  },
  {
    d: '1950',
    x: {
      en: 'Sergey Merkurov officially presents the ancestral estate to the city of Gyumri.',
      ru: 'Сергей Меркуров передаёт родовую усадьбу в дар родному городу.',
    },
  },
  {
    d: '1984',
    x: {
      en: 'The Sergey Merkurov House-Museum opens its doors to the public as a cultural centre.',
      ru: 'Дом-музей Сергея Меркурова открывается для посетителей как культурный центр.',
    },
  },
  {
    d: '1988',
    x: {
      en: 'The devastating Spitak earthquake strikes Gyumri, damaging the historic building.',
      ru: 'Разрушительное Спитакское землетрясение наносит ущерб историческому зданию.',
    },
  },
  {
    d: '2003',
    x: {
      en: 'Substantial structural restoration and reinforcement of the museum building.',
      ru: 'Масштабная реставрация и укрепление конструкций здания музея.',
    },
  },
  {
    d: '2012',
    x: {
      en: 'Anton Merkurov presents the sculptor’s memoirs in Yerevan (Cafesjian Center) and Pushkin Museum (Moscow); conducts the “New Technologies for Museums” seminar in Gyumri; formally hands family archive materials to the museum.',
      ru: 'Антон Меркуров представляет книгу воспоминаний скульптора в Ереване (Центр Гафесчяна) и ГМИИ им. Пушкина (Москва); проводит в Гюмри семинар «Новые технологии для музеев»; 22 сентября передаёт музею документы из семейного архива.',
    },
  },
  {
    d: '2013',
    x: {
      en: 'Gyumri is named CIS Cultural Capital; Anton meets Armenian President Serzh Sargsyan at the exhibition. Publishes essay “The Museum as a Tool of City Development”.',
      ru: 'Гюмри объявлен культурной столицей СНГ; встреча с президентом Армении Сержем Саргсяном на выставке. В «Частном корреспонденте» выходит статья «Музей как инструмент развития города».',
    },
  },
  {
    d: '2014',
    x: {
      en: 'Exhibition “Sergey Merkurov Archive” opens at Muzeon Park of Arts, Moscow: monumental portraits, lesser-known sculpture, and historic death masks.',
      ru: 'Выставка «Архив Сергея Меркурова» на фотостендах в парке «Музеон», Москва: монументальные портреты, редкая пластика и посмертные маски.',
    },
  },
  {
    d: '2016',
    x: {
      en: 'The Armenian Museum of Moscow reports that new restoration of the house began with Anton Merkurov’s active participation.',
      ru: 'Армянский музей Москвы сообщает, что новый этап реставрации дома начался при активном участии Антона Меркурова.',
    },
  },
  {
    d: '2023',
    x: {
      en: 'Further renovation, museum modernization, and festive reopening reported across Armenian cultural media.',
      ru: 'Завершение очередного этапа модернизации и торжественное повторное открытие дома-музея.',
    },
  },
];

const dynamoRows: Row[] = [
  {
    d: '2012',
    x: {
      en: 'The historic reliefs are removed during Dynamo stadium redevelopment. BBC Russian covers the campaign to preserve the masterworks.',
      ru: 'Барельефы демонтированы при реконструкции стадиона. Русская служба Би-би-си подробно освещает кампанию за их спасение.',
    },
  },
  {
    d: '2016',
    x: {
      en: 'Restoration begins by the “Nasledie” conservation workshop (The Art Newspaper Russia).',
      ru: 'Начинается масштабная научная реставрация мастерской «Наследие» (The Art Newspaper Russia).',
    },
  },
  {
    d: '2017',
    x: {
      en: 'Reporting from the conservation workshop; Anton Merkurov visits and assesses the preservation process.',
      ru: 'Репортаж из реставрационной мастерской; цитируется оценка Антона Меркурова после визита.',
    },
  },
  {
    d: '2019',
    x: {
      en: 'Public discussion on placement: Anton insists the original reliefs remain tied to Dynamo and accessible to all.',
      ru: 'Дискуссия о месте экспонирования: Антон выступает за то, чтобы оригиналы остались частью комплекса «Динамо» и были открыты публике.',
    },
  },
  {
    d: '2022–23',
    x: {
      en: 'The conserved original reliefs are permanently installed in the renewed Dynamo complex (Arena Plaza area).',
      ru: 'Отреставрированные оригинальные барельефы торжественно смонтированы в обновлённом комплексе «Динамо» в зоне Arena Plaza.',
    },
  },
];

const alphabetRows: Row[] = [
  {
    d: '1931',
    x: {
      en: 'Inscribed date on the original sheets circulating in collectors’ copies: “Рисовал С. Д. Меркуров 17-Х-931 г.” Provenance remains an active subject of critical scholarship.',
      ru: 'Дата на листах, циркулирующих среди коллекционеров: «Рисовал С. Д. Меркуров 17-Х-931 г.» Вопрос атрибуции остаётся предметом научного анализа.',
    },
  },
  {
    d: '2020',
    x: {
      en: 'Anton Merkurov curates an exhibition around the series at Cube art space (Moscow); a limited edition of silkscreens and art postcards is produced.',
      ru: 'Антон Меркуров организует выставку по мотивам серии в арт-пространстве Cube (Москва); выпущен тираж сериграфий и коллекционных открыток.',
    },
  },
  {
    d: '2021',
    x: {
      en: 'Provereno.Media conducts an extensive scholarly fact-check on the attribution, provenance, and Anton Merkurov’s contextual research.',
      ru: '«Проверено.Медиа» публикует подробный фактчекинг атрибуции рисунков, их провенанса и исследовательских комментариев Антона Меркурова.',
    },
  },
];

type Press = {
  outlet: string;
  date: string;
  title: L;
  kind: 'own' | 'cov';
  href?: string;
  img?: string;
};

const press: Press[] = [
  {
    outlet: 'BBC News Russian',
    date: '2012-03-01',
    title: {
      en: 'The fight for Merkurov’s historic reliefs at Dynamo stadium',
      ru: 'Борьба за барельефы Меркурова на стадионе «Динамо»',
    },
    kind: 'cov',
    href: S.bbc,
  },
  {
    outlet: 'Спорт-Экспресс',
    date: '2013-10-03',
    title: {
      en: 'Historic Dynamo stadium reliefs shown in Moscow',
      ru: 'В Москве показали исторические барельефы стадиона «Динамо»',
    },
    kind: 'cov',
  },
  {
    outlet: 'Частный корреспондент',
    date: '2013-10-30',
    title: {
      en: 'The Museum as a Tool of City Development',
      ru: 'Музей как инструмент развития города',
    },
    kind: 'own',
    img: 'Chaskor.jpg',
  },
  {
    outlet: 'Московский комсомолец',
    date: '2013-12-10',
    title: {
      en: 'Great-grandson of the Kyiv Lenin monument’s sculptor: “A lesson for the future”',
      ru: 'Правнук автора «киевского» памятника Ленину: «Это урок Украине как не надо делать»',
    },
    kind: 'cov',
    img: 'LeninFalls.jpg',
  },
  {
    outlet: 'The Moscow Times',
    date: '2014-06-16',
    title: {
      en: 'Controversial Lenin death mask for sale in US sparks dispute',
      ru: 'Спорная посмертная маска Ленина выставлена на продажу в США',
    },
    kind: 'cov',
    href: S.mt,
  },
  {
    outlet: 'Russian Life',
    date: '2013-09',
    title: {
      en: 'The Death Artist: Sergey Merkurov’s Monumental Legacy',
      ru: 'The Death Artist: Монументальное наследие Сергея Меркурова',
    },
    kind: 'cov',
    href: S.russianLife,
  },
  {
    outlet: 'Московский комсомолец',
    date: '2015-11-11',
    title: {
      en: 'The master’s monumental works will regain their former look',
      ru: 'Работам мастера Сергея Меркурова вернут прежний вид',
    },
    kind: 'cov',
  },
  {
    outlet: 'The Art Newspaper Russia',
    date: '2017-06',
    title: {
      en: 'Dynamo reliefs inside the master conservation workshop',
      ru: 'Барельефы «Динамо» в реставрационной мастерской',
    },
    kind: 'cov',
    href: S.tan2017,
  },
  {
    outlet: 'The Art Newspaper Russia',
    date: '2019-10',
    title: {
      en: 'Where should the original Dynamo reliefs be displayed?',
      ru: 'Где показывать оригиналы барельефов «Динамо»',
    },
    kind: 'cov',
    href: S.tan2019,
  },
  {
    outlet: 'The Art Newspaper Russia',
    date: '2023-01',
    title: {
      en: 'The restored Dynamo reliefs returned to public view',
      ru: 'Барельефы на «Динамо» после реставрации возвращены публике',
    },
    kind: 'cov',
    href: S.tan2023,
  },
  {
    outlet: 'The Art Newspaper',
    date: '2021-03',
    title: {
      en: 'Digital art and emerging modes of decentralized cultural distribution',
      ru: 'Цифровое искусство и новые формы онлайн-дистрибуции',
    },
    kind: 'cov',
    href: S.tan,
  },
  {
    outlet: 'Комсомольская правда',
    date: '2021-11',
    title: {
      en: 'Interview: From classical plaster to the digital 3D Lenin mask',
      ru: 'Интервью: От классического гипса к цифровой 3D-маске Ленина',
    },
    kind: 'cov',
    href: S.kp,
  },
  {
    outlet: 'Provereno.Media',
    date: '2021-07-20',
    title: {
      en: 'Did sculptor Merkurov draw the Soviet erotic alphabet? Investigation',
      ru: 'Правда ли, что советскую эротическую азбуку нарисовал скульптор Меркуров',
    },
    kind: 'cov',
    href: S.alphabet,
  },
];

const sourceList: [string, string, string][] = [
  ['Sergey Merkurov House-Museum (Official)', S.museum, 'sergey-merkurov.mus.am'],
  ['Armenpress — Historical Archive of the Museum', S.history, 'armenpress.am'],
  ['Armenian Museum of Moscow — Architectural Restoration', S.restoration, 'armmuseum.ru'],
  ['Regional Post — Anton Merkurov & Gyumri Heritage', S.gyumri, 'regionalpost.org'],
  ['AriTes — House-Museum Collection & Death Masks', S.arites, 'arites.am'],
  ['Moscow Sculptors Union — Tears and Blood of Rodin', S.rodin, 'oms.ru'],
  ['Anton Merkurov — Cultural & Curatorial Record', S.linkedin, 'linkedin.com'],
  ['Rarible — Posthumous Mask Web3 Artifact', NFT, 'rarible.com'],
  ['Provereno.Media — Erotic Alphabet Fact-Check', S.alphabet, 'provereno.media'],
  ['The Art Newspaper Russia — Dynamo Archive Coverage', S.tan2023, 'theartnewspaper.ru'],
];

const logos: [string, string, string][] = [
  ['MinCultAmLogo.jpg', 'Ministry of Culture of Armenia', 'Государственное содействие'],
  ['Dev_logo.jpg', 'DVV International', 'Международное партнёрство'],
  ['Domain_am.jpg', 'Internet Society Armenia', 'Цифровые инициативы'],
  ['KremlinMultimediaLogo.jpg', 'Kremlin Multimedia', 'Медиа-документация'],
  ['MuseonLogo.jpg', 'Muzeon Park of Arts', 'Выставочные проекты'],
];

const navItems: { id: string; num: string; label: L }[] = [
  { id: 'family', num: '01', label: { en: 'Family', ru: 'Семья' } },
  { id: 'museum', num: '02', label: { en: 'Gyumri', ru: 'Дом-музей' } },
  { id: 'dynamo', num: '03', label: { en: 'Dynamo', ru: 'Динамо' } },
  { id: 'masks', num: '04', label: { en: 'Death Masks', ru: 'Маски' } },
  { id: 'digital', num: '05', label: { en: 'Digital Art', ru: 'Цифровое' } },
  { id: 'alphabet', num: '06', label: { en: 'Alphabet 1931', ru: 'Азбука' } },
  { id: 'press', num: '07', label: { en: 'Press', ru: 'Пресса' } },
  { id: 'sources', num: '08', label: { en: 'Sources', ru: 'Источники' } },
];

export default function HeritageClient() {
  const [lang, setLang] = useState<Lang>('en');
  const [activeSection, setActiveSection] = useState<string>('family');
  const [pressFilter, setPressFilter] = useState<'all' | 'own' | 'cov'>('all');
  const [lightbox, setLightbox] = useState<{ src: string; alt: string; caption?: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const t = useCallback((o: L) => o[lang], [lang]);
  const tx = useCallback((en: string, ru: string) => (lang === 'en' ? en : ru), [lang]);

  // Sync scroll spy
  useEffect(() => {
    const handleScroll = () => {
      const scrollPos = window.scrollY + 200;
      for (let i = navItems.length - 1; i >= 0; i--) {
        const item = navItems[i];
        const el = document.getElementById(item.id);
        if (el && el.offsetTop <= scrollPos) {
          setActiveSection(item.id);
          break;
        }
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Handle escape for lightbox
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleShare = async () => {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Heritage Archive — Sergey & Anton Merkurov',
          url,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    }
  };

  const filteredPress = useMemo(() => {
    if (pressFilter === 'all') return press;
    return press.filter((p) => p.kind === pressFilter);
  }, [pressFilter]);

  return (
    <div
      lang={lang}
      className="min-h-screen bg-[#FAF8F5] text-[#111111] font-sans selection:bg-[#111111] selection:text-[#FAF8F5] antialiased relative overflow-x-hidden"
    >
      {/* Subtle Paper Grain Texture (Website signature) */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.025] mix-blend-overlay z-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Floating Subnav Dock */}
      <aside aria-label="Heritage Navigation" className="sticky top-20 sm:top-24 z-30 w-full px-4 sm:px-6 pointer-events-none">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 pointer-events-auto">
          {/* Section pills */}
          <nav
            aria-label="Archive chapters"
            className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar p-1.5 sm:p-2 rounded-full bg-[#FAF8F5]/90 backdrop-blur-xl border border-stone-200/90 shadow-[0_8px_30px_rgba(0,0,0,0.05)]"
          >
            {navItems.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={`px-3 sm:px-3.5 py-1.5 rounded-full text-xs transition-all whitespace-nowrap flex items-center gap-1.5 font-medium ${
                    isActive
                      ? 'bg-stone-900 text-[#FAF8F5] shadow-sm'
                      : 'text-stone-600 hover:text-stone-950 hover:bg-stone-200/60'
                  }`}
                >
                  <span
                    className={`font-mono text-[10px] ${
                      isActive ? 'text-stone-400' : 'text-stone-400'
                    }`}
                  >
                    {item.num}
                  </span>
                  <span>{t(item.label)}</span>
                </a>
              );
            })}
          </nav>

          {/* Right controls: Language + Share */}
          <div className="flex items-center gap-1.5 p-1.5 sm:p-2 rounded-full bg-[#FAF8F5]/90 backdrop-blur-xl border border-stone-200/90 shadow-[0_8px_30px_rgba(0,0,0,0.05)] shrink-0">
            {/* Lang switcher */}
            <div
              role="group"
              aria-label="Language selection"
              className="flex items-center rounded-full bg-stone-100/90 p-0.5 border border-stone-200/60"
            >
              {(['en', 'ru'] as Lang[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  aria-pressed={lang === l}
                  className={`px-2.5 py-1 rounded-full font-mono text-[10px] uppercase font-bold tracking-wider transition-all min-h-0 min-w-0 ${
                    lang === l
                      ? 'bg-stone-900 text-white shadow-xs'
                      : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            {/* Share button */}
            <button
              type="button"
              onClick={handleShare}
              title={tx('Share / Copy Link', 'Поделиться / Скопировать ссылку')}
              aria-label="Share page link"
              className="w-7 h-7 rounded-full flex items-center justify-center text-stone-600 hover:text-stone-900 hover:bg-stone-200/60 transition-colors min-h-0 min-w-0"
            >
              {copiedLink ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Share2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto px-5 sm:px-8 lg:px-12 pt-12 sm:pt-16 pb-28 relative z-20 space-y-24 sm:space-y-32">
        {/* ===================== HERO SECTION ===================== */}
        <section aria-labelledby="hero-title" className="space-y-10 border-b border-stone-200/90 pb-16 sm:pb-24">
          {/* Eyebrow & Live Accession Badge */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-stone-100 border border-stone-200/80 font-mono text-[11px] uppercase tracking-[0.2em] text-stone-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{tx('Documented Heritage Archive', 'Документальный архив наследия')}</span>
            </div>
            <span className="font-mono text-xs text-stone-600 tracking-wider">
              1881 — {new Date().getFullYear()} // MERKUROV
            </span>
          </div>

          {/* Monumental Editorial Headline */}
          <div className="space-y-4">
            <h1
              id="hero-title"
              className="text-5xl sm:text-7xl md:text-8xl lg:text-[104px] font-serif font-normal tracking-tight text-[#111111] leading-[0.94] sm:leading-[0.9] break-words"
            >
              {tx('Objects have', 'У вещей')}{' '}
              <span className="italic font-light text-stone-600">
                {tx('their own', 'есть своя')}
              </span>{' '}
              <br className="hidden sm:inline" />
              {tx('histories.', 'история.')}
            </h1>
          </div>

          {/* Subtitle & Curatorial Rigor Statement */}
          <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] items-baseline pt-4">
            <p className="text-xl sm:text-2xl text-stone-800 font-serif leading-relaxed font-normal">
              {tx(
                'A documented record of the legacy of monumental sculptor Sergey Merkurov and the cultural initiatives of his great-grandson, Anton Merkurov — spanning family archives, public monuments, museum history, print and digital art.',
                'Документированная летопись наследия монументального скульптора Сергея Меркурова и культурных инициатив его правнука Антона Меркурова: семейный архив, городские монументы, музейная история, печать и цифровое искусство.'
              )}
            </p>
            <div className="border-l-2 border-stone-300 pl-5 space-y-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-stone-600 block font-semibold">
                {tx('Methodology & Transparency', 'Методология и фактчекинг')}
              </span>
              <p className="text-xs text-stone-600 leading-relaxed">
                {tx(
                  'Historical facts, published reporting, and personal advocacy are distinguished throughout. Unresolved attributions are identified critically rather than presented as established facts.',
                  'Исторические факты, пресса и личное участие строго разделены. Неподтверждённые атрибуции квалифицированы как предметы исследования.'
                )}
              </p>
            </div>
          </div>

          {/* Topic Tags */}
          <div className="flex flex-wrap gap-2 pt-2">
            {[
              tx('Family Archive', 'Семейный архив'),
              tx('Museum History', 'История музея'),
              tx('Public Monuments', 'Городские монументы'),
              tx('Posthumous Death Masks', 'Посмертные маски'),
              tx('Digital Reinterpretation', 'Цифровое переосмысление'),
            ].map((tag) => (
              <span
                key={tag}
                className="px-3.5 py-1.5 rounded-full bg-white/80 border border-stone-200/90 text-xs font-mono uppercase tracking-wider text-stone-700 shadow-2xs"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Featured Monument: "Thought" ("Мысль") */}
          <div className="pt-6">
            <div
              onClick={() =>
                setLightbox({
                  src: IMG + 'TheThinker.jpg',
                  alt: tx('Sculpture “Thought” on Sergey Merkurov’s grave', 'Скульптура «Мысль» на могиле Сергея Меркурова'),
                  caption: tx(
                    'Sergey Merkurov’s sculpture “Thought” (granite) on his memorial at Novodevichy Cemetery, Moscow.',
                    'Скульптура Сергея Меркурова «Мысль» (гранит) на его могиле на Новодевичьем кладбище в Москве.'
                  ),
                })
              }
              className="group relative aspect-[16/9] w-full overflow-hidden rounded-3xl border border-stone-300/80 bg-stone-200 shadow-sm cursor-pointer"
            >
              <Image
                src={IMG + 'TheThinker.jpg'}
                alt={tx('Sculpture “Thought” on Sergey Merkurov’s grave', 'Скульптура «Мысль» на могиле Сергея Меркурова')}
                fill
                priority
                sizes="(max-width: 1200px) 100vw, 1200px"
                className="object-cover grayscale contrast-[1.03] group-hover:grayscale-0 group-hover:scale-[1.015] transition-all duration-700 ease-out"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80 group-hover:opacity-60 transition-opacity" />

              <div className="absolute bottom-5 left-5 right-5 sm:bottom-8 sm:left-8 sm:right-8 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 text-white">
                <div className="space-y-1">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/80">
                    {tx('Monumental Masterwork', 'Монументальный шедевр')}
                  </span>
                  <h3 className="font-serif text-2xl sm:text-3xl text-white">
                    {tx('“Thought” (1911–1913)', '«Мысль» (1911–1913)')}
                  </h3>
                  <p className="text-xs sm:text-sm text-stone-200/90 font-sans max-w-xl">
                    {tx(
                      'Carved from dark Swedish granite. Installed at Novodevichy Cemetery as the sculptor’s gravestone.',
                      'Высечена из шведского гранита. Установлена на Новодевичьем кладбище над могилой скульптора.'
                    )}
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-black/40 backdrop-blur-md border border-white/20 text-xs font-mono uppercase tracking-wider text-white shrink-0 group-hover:bg-white group-hover:text-black transition-all">
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>{tx('Enlarge', 'Просмотр')}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== SECTION 01: FAMILY ===================== */}
        <section id="family" className="scroll-mt-36 space-y-12">
          {/* Section Header */}
          <div className="space-y-3 border-b border-stone-200/90 pb-8">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-stone-600 block font-semibold">
              01 // {tx('Family Record', 'Семейный архив')}
            </span>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-serif text-[#111111] leading-tight">
              {tx('Two generations.', 'Два поколения.')}{' '}
              <span className="italic font-light text-stone-600">
                {tx('Different media.', 'Разные медиа.')}
              </span>
            </h2>
          </div>

          {/* Two Generations Bento Cards */}
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Sergey Merkurov Card */}
            <article className="rounded-3xl border border-stone-200/90 bg-white/80 backdrop-blur-xl p-6 sm:p-8 flex flex-col justify-between hover:shadow-xl hover:border-stone-900 transition-all duration-300 group">
              <div className="space-y-6">
                <div
                  onClick={() =>
                    setLightbox({
                      src: IMG + 'Merkurov1.jpg',
                      alt: 'Sergey Dmitrievich Merkurov',
                      caption: tx('Sergey Dmitrievich Merkurov (1881–1952), People’s Artist of the USSR, sculptor.', 'Сергей Дмитриевич Меркуров (1881–1952), народный художник СССР, скульптор-монументалист.'),
                    })
                  }
                  className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-stone-100 border border-stone-200/80 cursor-pointer"
                >
                  <Image
                    src={IMG + 'Merkurov1.jpg'}
                    alt="Sergey Merkurov"
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-cover grayscale contrast-105 group-hover:scale-102 transition-transform duration-500"
                  />
                  <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-stone-900/80 backdrop-blur-md text-white font-mono text-[10px] uppercase tracking-widest">
                    1881 — 1952
                  </div>
                  <div className="absolute bottom-3 right-3 p-2 rounded-full bg-white/90 text-stone-900 shadow-xs opacity-0 group-hover:opacity-100 transition-opacity">
                    <Maximize2 className="w-4 h-4" />
                  </div>
                </div>

                <div className="space-y-3">
                  <span className="font-mono text-xs uppercase tracking-[0.16em] text-stone-600 block">
                    {tx('Classical & Monumental Sculpture', 'Классическая и монументальная скульптура')}
                  </span>
                  <h3 className="text-3xl sm:text-4xl font-serif text-[#111111]">
                    {tx('Sergey Dmitrievich Merkurov', 'Сергей Дмитриевич Меркуров')}
                  </h3>
                  <p className="text-stone-700 text-sm sm:text-base leading-relaxed font-sans">
                    {tx(
                      'Born in Alexandropol (now Gyumri) on 7 November 1881. Educated in Europe, including the Munich Academy of Fine Arts, he worked in Paris between 1905 and 1907 in Auguste Rodin’s studio — a foundational experience that defined his monumental vision.',
                      'Родился в Александрополе (ныне Гюмри) 7 ноября 1881 года. Получил образование в Европе, включая Мюнхенскую академию художеств; в 1905–1907 годах работал в Париже в мастерской Огюста Родена — опыт, который скульптор считал определяющим.'
                    )}
                  </p>
                  <p className="text-stone-700 text-sm sm:text-base leading-relaxed font-sans">
                    {tx(
                      'Pioneer of monumental stone sculpture and the master of over 300 posthumous death masks. Director of the Pushkin State Museum of Fine Arts (1944–1949). His works are preserved in public city squares, state museum collections, and the family estate in Gyumri.',
                      'Классик монументальной гранитной скульптуры, автор более 300 посмертных масок. Директор ГМИИ им. Пушкина (1944–1949). Наследие сохранилось в городских монументах, музейных фондах и доме-музее в Гюмри.'
                    )}
                  </p>
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-stone-200 flex flex-wrap items-center gap-3 text-xs font-mono">
                <a
                  href={S.rodin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-800 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{tx('Tears and Blood of Rodin', 'Слёзы и кровь Родена')}</span>
                  <ArrowUpRight className="w-3 h-3 text-stone-400" />
                </a>
                <a
                  href={S.museum}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-800 transition-colors"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>{tx('House-Museum', 'Дом-музей')}</span>
                  <ArrowUpRight className="w-3 h-3 text-stone-400" />
                </a>
              </div>
            </article>

            {/* Anton Merkurov Card */}
            <article className="rounded-3xl border border-stone-200/90 bg-white/80 backdrop-blur-xl p-6 sm:p-8 flex flex-col justify-between hover:shadow-xl hover:border-stone-900 transition-all duration-300 group">
              <div className="space-y-6">
                <div
                  onClick={() =>
                    setLightbox({
                      src: IMG + 'Gafechian.jpg',
                      alt: 'Anton Merkurov presenting the memoir volume, Yerevan',
                      caption: tx('Anton Merkurov presenting the memoirs, Cafesjian Center for the Arts, Yerevan, 2012.', 'Антон Меркуров представляет книгу воспоминаний скульптора, Центр Гафесчяна, Ереван, 2012.'),
                    })
                  }
                  className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-stone-100 border border-stone-200/80 cursor-pointer"
                >
                  <Image
                    src={IMG + 'Gafechian.jpg'}
                    alt="Anton Merkurov presenting memoirs"
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-cover grayscale contrast-105 group-hover:scale-102 transition-transform duration-500"
                  />
                  <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-stone-900/80 backdrop-blur-md text-white font-mono text-[10px] uppercase tracking-widest">
                    {tx('Born 1981', 'Род. 1981')}
                  </div>
                  <div className="absolute bottom-3 right-3 p-2 rounded-full bg-white/90 text-stone-900 shadow-xs opacity-0 group-hover:opacity-100 transition-opacity">
                    <Maximize2 className="w-4 h-4" />
                  </div>
                </div>

                <div className="space-y-3">
                  <span className="font-mono text-xs uppercase tracking-[0.16em] text-stone-600 block">
                    {tx('Digital Strategy & Heritage Architecture', 'Цифровая стратегия и архитектура контекста')}
                  </span>
                  <h3 className="text-3xl sm:text-4xl font-serif text-[#111111]">
                    {tx('Anton Merkurov', 'Антон Меркуров')}
                  </h3>
                  <p className="text-stone-700 text-sm sm:text-base leading-relaxed font-sans">
                    {tx(
                      'Sergey Merkurov’s great-grandson. Documented public advocacy and contemporary engagement: championing the preservation of the Dynamo reliefs, institutional cooperation with the Gyumri museum, publishing family archival memoirs, and digitising historical artifacts into 3D and Web3.',
                      'Правнук Сергея Меркурова. Документированная работа с культурным наследием: защита барельефов «Динамо», содействие дому-музею в Гюмри, публикация архивных мемуаров, оцифровка слепков в 3D и переосмысление в формате Web3-арта.'
                    )}
                  </p>
                  <p className="text-stone-700 text-sm sm:text-base leading-relaxed font-sans">
                    {tx(
                      'Operates across media, emerging technology, art dealing, and strategic advisory. Bridges classical historical capital with 21st-century distributed networks and AI curation.',
                      'Работает на стыке медиа, современных технологий, арт-рынка и стратегического консалтинга. Соединяет классический культурный капитал с цифровыми сетями и кураторством в эпоху AI.'
                    )}
                  </p>
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-stone-200 flex flex-wrap items-center gap-3 text-xs font-mono">
                <a
                  href={S.gyumri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-800 transition-colors"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>{tx('Regional Post Profile', 'Профиль в Regional Post')}</span>
                  <ArrowUpRight className="w-3 h-3 text-stone-400" />
                </a>
                <a
                  href={S.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-800 transition-colors"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>{tx('LinkedIn Record', 'LinkedIn')}</span>
                  <ArrowUpRight className="w-3 h-3 text-stone-400" />
                </a>
              </div>
            </article>
          </div>

          {/* Family Papers & Memoir Volume Spotlight */}
          <div className="rounded-3xl border border-stone-200/90 bg-stone-100/60 p-6 sm:p-10">
            <div className="grid gap-8 md:grid-cols-[220px_1fr] items-center">
              <div
                onClick={() =>
                  setLightbox({
                    src: IMG + 'Book.jpg',
                    alt: 'Memoir volume cover: Sergey Merkurov',
                    caption: tx(
                      'Sergey Merkurov: “Recollections, Letters, Articles, Notes, Contemporary Judgments”, published 2012.',
                      'Сергей Меркуров: «Воспоминания, письма, статьи, заметки, суждения современников», Москва, 2012.'
                    ),
                  })
                }
                className="relative aspect-[3/4] w-full max-w-[200px] mx-auto overflow-hidden rounded-2xl bg-white shadow-md border border-stone-300 cursor-pointer group"
              >
                <Image
                  src={IMG + 'Book.jpg'}
                  alt="Memoirs Cover"
                  fill
                  sizes="200px"
                  className="object-cover group-hover:scale-103 transition-transform duration-300"
                />
              </div>

              <div className="space-y-4">
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-stone-600 block">
                  {tx('Archival Publication', 'Архивная публикация')}
                </span>
                <h3 className="text-2xl sm:text-3xl font-serif text-[#111111]">
                  {tx(
                    'The Sculptor’s Memoirs: Letters, Notes & Contemporary Judgments',
                    'Мемуары скульптора: Воспоминания, письма, суждения современников'
                  )}
                </h3>
                <p className="text-stone-700 text-sm sm:text-base leading-relaxed">
                  {tx(
                    'In April 2012, Anton Merkurov presented the definitive academic collection of Sergey Merkurov’s writings at the Cafesjian Center for the Arts in Yerevan and the Pushkin State Museum of Fine Arts in Moscow. In 2013, the US publication Russian Life drew directly upon this family archive for an extensive profile of the sculptor.',
                    'В апреле 2012 года Антон Меркуров презентовал фундаментальный том личных текстов Сергея Меркурова в Центре Гафесчяна в Ереване и в ГМИИ им. Пушкина в Москве. В 2013 году американский журнал Russian Life подготовил обширный исторический очерк о скульпторе, опираясь на материалы семейного архива.'
                  )}
                </p>

                <div
                  onClick={() =>
                    setLightbox({
                      src: IMG + 'Pushkinsky.jpg',
                      alt: 'Pushkin Museum presentation 2012',
                      caption: tx('Memoirs presentation at the Pushkin State Museum of Fine Arts, Moscow, 28 April 2012.', 'Презентация книги в ГМИИ им. Пушкина, Москва, 28 апреля 2012 года.'),
                    })
                  }
                  className="inline-flex items-center gap-2 pt-2 text-xs font-mono text-stone-800 hover:text-black cursor-pointer group"
                >
                  <Eye className="w-3.5 h-3.5 text-stone-500 group-hover:text-black" />
                  <span className="underline underline-offset-4 decoration-stone-300 group-hover:decoration-black">
                    {tx('View Pushkin Museum presentation archive photo', 'Архивное фото презентации в ГМИИ им. Пушкина')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== SECTION 02: GYUMRI MUSEUM ===================== */}
        <section id="museum" className="scroll-mt-36 space-y-12">
          {/* Section Header */}
          <div className="space-y-3 border-b border-stone-200/90 pb-8">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-stone-600 block font-semibold">
              02 // {tx('Gyumri, Armenia', 'Гюмри, Армения')}
            </span>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-serif text-[#111111] leading-tight">
              {tx('The family estate', 'Семейная усадьба')}{' '}
              <span className="italic font-light text-stone-600">
                {tx('becomes a living museum.', 'становится живым музеем.')}
              </span>
            </h2>
          </div>

          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            {/* Left Column: Founding & Historic Photos */}
            <div className="space-y-8">
              <p className="text-base sm:text-lg text-stone-700 font-serif leading-relaxed">
                {tx(
                  'The Sergey Merkurov House-Museum occupies the 19th-century residence in Gyumri where the sculptor was born and raised. Today, it stands as an architectural monument, a repository of plaster originals, and an active civic hub.',
                  'Дом-музей занимает особняк XIX века в историческом центре Гюмри, где родился и вырос скульптор. Сегодня усадьба — архитектурный памятник, хранилище оригинальных слепков и центр культурной жизни региона.'
                )}
              </p>

              {/* 1869 Foundation Card */}
              <div className="rounded-2xl border border-stone-300/80 bg-white p-6 space-y-2 shadow-2xs">
                <span className="font-mono text-4xl sm:text-5xl font-light text-stone-900 block">
                  1869
                </span>
                <p className="font-mono text-xs uppercase tracking-wider text-stone-600">
                  {tx('Erected by Fyodor Merkurov', 'Построен Фёдором Меркуровым')}
                </p>
                <p className="text-xs text-stone-600 leading-relaxed font-sans">
                  {tx(
                    'Built by the sculptor’s grandfather in traditional black tuff stone, characteristic of Alexandropol vernacular architecture.',
                    'Возведён дедом скульптора из чёрного туфа — образец самобытной городской архитектуры Александрополя.'
                  )}
                </p>
              </div>

              {/* Photo: Museum Exterior */}
              <div
                onClick={() =>
                  setLightbox({
                    src: IMG + 'Museum.jpg',
                    alt: 'Sergey Merkurov House-Museum, Gyumri',
                    caption: tx('Sergey Merkurov House-Museum, Gyumri, Armenia.', 'Дом-музей Сергея Меркурова, Гюмри, Армения.'),
                  })
                }
                className="group relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-stone-200 border border-stone-200/80 cursor-pointer shadow-xs"
              >
                <Image
                  src={IMG + 'Museum.jpg'}
                  alt="Museum exterior"
                  fill
                  sizes="(max-width: 1024px) 100vw, 40vw"
                  className="object-cover group-hover:scale-102 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />
                <div className="absolute bottom-3 left-4 text-white text-xs font-mono uppercase tracking-wider">
                  {tx('House-Museum Exterior', 'Фасад дома-музея')}
                </div>
              </div>

              {/* Photo: Handing archive documents */}
              <div
                onClick={() =>
                  setLightbox({
                    src: IMG + 'Archive.jpg',
                    alt: 'Handing archive documents to the museum',
                    caption: tx(
                      'Anton Merkurov presenting original documents from the sculptor’s archive to the museum, 22 September 2012.',
                      'Антон Меркуров передаёт оригинальные документы из архива скульптора музею, 22 сентября 2012 года.'
                    ),
                  })
                }
                className="group relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-stone-200 border border-stone-200/80 cursor-pointer shadow-xs"
              >
                <Image
                  src={IMG + 'Archive.jpg'}
                  alt="Archive Handover"
                  fill
                  sizes="(max-width: 1024px) 100vw, 40vw"
                  className="object-cover group-hover:scale-102 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />
                <div className="absolute bottom-3 left-4 text-white text-xs font-mono uppercase tracking-wider">
                  {tx('Archive Handover, 2012', 'Передача архива, 2012')}
                </div>
              </div>

              <a
                href={S.museum}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-stone-900 hover:text-stone-600 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="underline underline-offset-4">{tx('Official Museum Portal', 'Официальный сайт музея')}</span>
              </a>
            </div>

            {/* Right Column: Timeline & Gallery */}
            <div className="space-y-10">
              {/* Museum Timeline */}
              <div className="space-y-4">
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-stone-600 block">
                  {tx('Chronicle of the Estate', 'Летопись усадьбы')}
                </span>
                <div className="border-t border-stone-200">
                  {museumRows.map((row) => (
                    <div
                      key={row.d}
                      className="grid grid-cols-[85px_1fr] sm:grid-cols-[100px_1fr] gap-4 py-4 border-b border-stone-200/70 items-baseline"
                    >
                      <span className="font-mono text-xs font-bold text-stone-900 tabular-nums">
                        {row.d}
                      </span>
                      <p className="text-xs sm:text-sm text-stone-700 leading-relaxed font-sans">
                        {t(row.x)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4-Photo Museum Events Grid */}
              <div className="space-y-3">
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-stone-600 block">
                  {tx('Events & Public Life', 'События и общественная жизнь')}
                </span>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  {[
                    {
                      src: 'Museum_Lecture.jpg',
                      label: tx('Lecture: New Technologies, 2012', 'Семинар по технологиям, 2012'),
                    },
                    {
                      src: 'With%20presidentAM.jpg',
                      label: tx('With President Sargsyan, 2013', 'С президентом Саргсяном, 2013'),
                    },
                    {
                      src: 'MuseumEvent.jpg',
                      label: tx('Museum Courtyard Gathering', 'Событие во дворе музея'),
                    },
                    {
                      src: 'Museon.jpg',
                      label: tx('Muzeon Park Exhibition, 2014', 'Выставка в «Музеоне», 2014'),
                    },
                  ].map((item) => (
                    <div
                      key={item.src}
                      onClick={() =>
                        setLightbox({
                          src: IMG + item.src,
                          alt: item.label,
                          caption: item.label,
                        })
                      }
                      className="group relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-stone-100 border border-stone-200/80 cursor-pointer"
                    >
                      <Image
                        src={IMG + item.src}
                        alt={item.label}
                        fill
                        sizes="(max-width: 1024px) 50vw, 25vw"
                        className="object-cover grayscale contrast-105 group-hover:grayscale-0 group-hover:scale-103 transition-all duration-300"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2.5">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-white line-clamp-1">
                          {item.label}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Institutional Partners Ribbon */}
          <div className="pt-8 border-t border-stone-200/90 space-y-6">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone-600 block">
              {tx('Institutional Partners & Endorsements', 'Институции и партнёры')}
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {logos.map(([file, title, subtitle]) => (
                <div
                  key={file}
                  className="rounded-2xl border border-stone-200/80 bg-white/70 p-4 flex flex-col items-center text-center justify-between gap-3 shadow-2xs hover:border-stone-400 transition-colors"
                >
                  <div className="relative h-12 w-full flex items-center justify-center">
                    <Image
                      src={IMG + file}
                      alt={title}
                      width={120}
                      height={48}
                      className="max-h-10 w-auto object-contain grayscale opacity-80 hover:opacity-100 transition-opacity"
                    />
                  </div>
                  <div>
                    <h4 className="font-mono text-[10px] uppercase font-bold tracking-wider text-stone-900 leading-tight">
                      {title}
                    </h4>
                    <p className="font-sans text-[10px] text-stone-600 mt-0.5">
                      {subtitle}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===================== SECTION 03: DYNAMO ===================== */}
        <section id="dynamo" className="scroll-mt-36 space-y-12">
          {/* Section Header */}
          <div className="space-y-3 border-b border-stone-200/90 pb-8">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-stone-600 block font-semibold">
              03 // {tx('Moscow / Public Monuments', 'Москва / Городские монументы')}
            </span>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-serif text-[#111111] leading-tight">
              Dynamo.{' '}
              <span className="italic font-light text-stone-600">
                {tx('The fate of six monumental reliefs.', 'Судьба шести монументальных барельефов.')}
              </span>
            </h2>
          </div>

          <p className="text-base sm:text-lg text-stone-800 font-serif leading-relaxed max-w-4xl">
            {tx(
              'Six monumental sculptural friezes featuring 44 dynamic figures of Soviet athletes adorned the porticos of Moscow’s Dynamo Stadium for decades. Their emergency removal during stadium demolition in 2012 sparked nationwide debate over preservation and public access. Anton Merkurov became a leading independent voice advocating for their rescue and permanent public display.',
              'Шесть монументальных барельефов с 44 атлетами десятилетиями венчали портики Большой арены стадиона «Динамо». Их экстренный демонтаж при реконструкции 2012 года вызвал всероссийскую общественную дискуссию о реставрации и общественном доступе. Антон Меркуров стал заметным независимым голосом в защите этих шедевров.'
            )}
          </p>

          {/* Exhibition Metrics Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                num: '6',
                label: tx('Original Frieze Panels', 'Оригинальных барельефа'),
                sub: tx('Porticos of Dynamo Stadium', 'Портики стадиона «Динамо»'),
              },
              {
                num: '44',
                label: tx('Athletic Figures', 'Фигуры спортсменов'),
                sub: tx('Monumental classical poses', 'Пластика советского спорта'),
              },
              {
                num: '7,000+',
                label: tx('Fragments Conserved', 'Фрагментов спасено'),
                sub: tx('Workshop “Nasledie”', 'Мастерская «Наследие»'),
              },
              {
                num: '2012 → 2023',
                label: tx('Advocacy & Restoration', 'От демонтажа до показа'),
                sub: tx('Now at Arena Plaza', 'Экспонируются в Arena Plaza'),
              },
            ].map((stat) => (
              <div
                key={stat.num}
                className="rounded-2xl border border-stone-200/90 bg-white/80 backdrop-blur-md p-6 text-center space-y-2 shadow-2xs hover:border-stone-900 transition-colors"
              >
                <span className="font-serif text-3xl sm:text-4xl text-stone-900 block font-normal tracking-tight">
                  {stat.num}
                </span>
                <span className="font-mono text-xs uppercase font-bold tracking-wider text-stone-800 block">
                  {stat.label}
                </span>
                <span className="text-[11px] text-stone-600 block font-sans">
                  {stat.sub}
                </span>
              </div>
            ))}
          </div>

          {/* Split: Photo of reliefs + Timeline */}
          <div className="grid gap-8 lg:grid-cols-2 items-start">
            <div className="space-y-4">
              <div
                onClick={() =>
                  setLightbox({
                    src: IMG + 'Basreliefs.jpg',
                    alt: 'Dynamo reliefs and restorers',
                    caption: tx(
                      'Sergey Merkurov’s Dynamo stadium reliefs inside the conservation workshop “Nasledie”.',
                      'Барельефы Сергея Меркурова со стадиона «Динамо» в реставрационной мастерской «Наследие».'
                    ),
                  })
                }
                className="group relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-stone-200 border border-stone-200/90 cursor-pointer shadow-xs"
              >
                <Image
                  src={IMG + 'Basreliefs.jpg'}
                  alt="Dynamo reliefs"
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover grayscale contrast-105 group-hover:scale-102 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />
                <div className="absolute bottom-4 left-4 right-4 text-white">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-white/80 block">
                    {tx('Workshop “Nasledie”', 'Мастерская «Наследие»')}
                  </span>
                  <span className="font-serif text-lg text-white">
                    {tx('Conserving the monumental athletic panels', 'Научная реставрация барельефов')}
                  </span>
                </div>
              </div>

              {/* Attribution & Distinction Note */}
              <div className="rounded-2xl border border-stone-200/80 bg-stone-100/70 p-5 space-y-1.5 text-xs text-stone-600">
                <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-stone-800 block">
                  {tx('Critical Distinction', 'Важное уточнение')}
                </span>
                <p className="leading-relaxed">
                  {tx(
                    'The physical conservation was executed by licensed master restorers (workshop “Nasledie”). Anton Merkurov’s documented role was public advocacy, media transparency, and ensuring public placement at Arena Plaza.',
                    'Научную реставрацию выполнили профильные специалисты мастерской «Наследие». Документированная роль Антона Меркурова — публичная кампания в СМИ и защита права москвичей на открытый доступ к оригиналам в Arena Plaza.'
                  )}
                </p>
              </div>
            </div>

            {/* Dynamo Timeline */}
            <div className="border-t border-stone-200">
              {dynamoRows.map((row) => (
                <div
                  key={row.d}
                  className="grid grid-cols-[85px_1fr] sm:grid-cols-[100px_1fr] gap-4 py-4 border-b border-stone-200/70 items-baseline"
                >
                  <span className="font-mono text-xs font-bold text-stone-900 tabular-nums">
                    {row.d}
                  </span>
                  <p className="text-xs sm:text-sm text-stone-700 leading-relaxed font-sans">
                    {t(row.x)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===================== SECTION 04: MASKS ===================== */}
        <section id="masks" className="scroll-mt-36 space-y-12">
          {/* Section Header */}
          <div className="space-y-3 border-b border-stone-200/90 pb-8">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-stone-600 block font-semibold">
              04 // {tx('Sculpture & Memory', 'Скульптура и память')}
            </span>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-serif text-[#111111] leading-tight">
              {tx('The death mask', 'Посмертная маска')}{' '}
              <span className="italic font-light text-stone-600">
                {tx('as an archive of eternity.', 'как архив вечности.')}
              </span>
            </h2>
          </div>

          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-6">
              <p className="text-base sm:text-lg text-stone-800 font-serif leading-relaxed">
                {tx(
                  'Sergey Merkurov is recognized as the twentieth century’s foremost master of posthumous masks. He cast over 300 impressions of defining cultural and political figures — including Leo Tolstoy, Vladimir Lenin, Vladimir Mayakovsky, Maxim Gorky, Sergei Eisenstein, and Mikhail Bulgakov.',
                  'Сергей Меркуров признан величайшим мастером посмертных масок XX века. Он снял более 300 слепков ключевых фигур эпохи — Льва Толстого, Владимира Ленина, Владимира Маяковского, Максима Горького, Сергея Эйзенштейна, Михаила Булгакова.'
                )}
              </p>

              <div className="rounded-2xl border border-stone-200/90 bg-white p-6 space-y-3 shadow-2xs">
                <span className="font-mono text-[11px] uppercase tracking-wider text-stone-600 block">
                  {tx('Museum Statistics', 'Музейные показатели')}
                </span>
                <p className="text-2xl font-serif text-stone-900">
                  {tx('300+ Masks Cast // 59 Exhibited', 'Более 300 масок // 59 в экспозиции')}
                </p>
                <p className="text-xs text-stone-600 leading-relaxed font-sans">
                  {tx(
                    'The Gyumri House-Museum preserves the world’s most extensive public collection of original plaster impressions, including Lenin’s primary death mask.',
                    'Дом-музей в Гюмри хранит крупнейшую в мире публичную коллекцию гипсовых оригиналов, включая главную посмертную маску Ленина.'
                  )}
                </p>
              </div>

              <a
                href={S.arites}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-stone-900 hover:text-stone-600 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="underline underline-offset-4">
                  {tx('Explore AriTes Mask Collection Registry', 'Реестр коллекции масок на AriTes')}
                </span>
              </a>
            </div>

            {/* Case Studies: 2014 US Auction + 2013 Kyiv Monument */}
            <div className="space-y-6">
              {/* Case 1: 2014 US Auction */}
              <div className="rounded-2xl border border-stone-200/90 bg-white/80 p-6 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase font-bold tracking-widest text-stone-600">
                    2014 // {tx('International Controversy', 'Международный спор')}
                  </span>
                  <span className="font-mono text-[10px] text-stone-600">The Moscow Times</span>
                </div>
                <h3 className="text-xl font-serif text-stone-900">
                  {tx('The Lenin Mask and the US Auction Protest', 'Спор вокруг продажи маски Ленина в США')}
                </h3>
                <p className="text-xs sm:text-sm text-stone-700 leading-relaxed font-sans">
                  {tx(
                    'The Moscow Times reported on a proposed private sale of a Lenin death mask in the United States and Anton Merkurov’s vocal objection against commodifying unique archival heritage.',
                    'The Moscow Times подробно осветила попытку коммерческой продажи посмертной маски Ленина в США и публичный протест Антона Меркурова против приватизации архивного наследия.'
                  )}
                </p>
                <a
                  href={S.mt}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-mono text-stone-900 hover:text-stone-600"
                >
                  <span>{tx('Read in The Moscow Times', 'Читать в The Moscow Times')}</span>
                  <ArrowUpRight className="w-3 h-3 text-stone-400" />
                </a>
              </div>

              {/* Case 2: 2013 Kyiv Monument */}
              <div className="rounded-2xl border border-stone-200/90 bg-white/80 p-6 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase font-bold tracking-widest text-stone-600">
                    2013 // {tx('Monumental Memory', 'Монументальная память')}
                  </span>
                  <span className="font-mono text-[10px] text-stone-600">Московский комсомолец</span>
                </div>
                <h3 className="text-xl font-serif text-stone-900">
                  {tx('The Kyiv Lenin Monument (1946–2013)', 'Киевский памятник Ленину (1946–2013)')}
                </h3>
                <p className="text-xs sm:text-sm text-stone-700 leading-relaxed font-sans">
                  {tx(
                    'Following the toppling of the red quartz monument in Kyiv, Moskovsky Komsomolets conducted an interview with Anton Merkurov regarding the historical weight of public monuments.',
                    'После падения монумента из красного кварцита в Киеве «Московский комсомолец» взял обстоятельное интервью у Антона Меркурова о судьбе монументов и уроках истории.'
                  )}
                </p>
                <div
                  onClick={() =>
                    setLightbox({
                      src: IMG + 'LeninFalls.jpg',
                      alt: 'Toppling of Kyiv monument 2013',
                      caption: tx('Kyiv, December 2013. The toppled monument by Sergey Merkurov.', 'Киев, декабрь 2013 года. Свергнутый памятник работы Сергея Меркурова.'),
                    })
                  }
                  className="inline-flex items-center gap-1.5 text-xs font-mono text-stone-900 hover:text-black cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-stone-500" />
                  <span className="underline underline-offset-4">{tx('View historical press photo', 'Смотреть историческое фото')}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== SECTION 05: DIGITAL ART & WEB3 ===================== */}
        <section id="digital" className="scroll-mt-36 space-y-12">
          {/* Section Header */}
          <div className="space-y-3 border-b border-stone-200/90 pb-8">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-stone-600 block font-semibold">
              05 // {tx('Digitisation & Contemporary Art', 'Оцифровка и современное искусство')}
            </span>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-serif text-[#111111] leading-tight">
              {tx('From historical plaster', 'От исторического гипса')}{' '}
              <span className="italic font-light text-stone-600">
                {tx('to a living digital artwork.', 'к живому цифровому объекту.')}
              </span>
            </h2>
          </div>

          <p className="text-base sm:text-lg text-stone-800 font-serif leading-relaxed max-w-4xl">
            {tx(
              'In 2021, Anton Merkurov spearheaded a breakthrough project bridging historical sculpture and blockchain technology: the 3D laser digitisation of Lenin’s death mask, followed by high-resolution 3D printing and an evocative digital animation distributed as an NFT on Rarible.',
              'В 2021 году Антон Меркуров реализовал проект, соединивший историческую пластику с блокчейн-технологиями: высокоточная 3D-оцифровка посмертной маски Ленина, тактильная печать на 3D-принтере и цифровая анимация, выпущенная как NFT на платформе Rarible.'
            )}
          </p>

          {/* Interactive Web3 Showcase Grid */}
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Left: 3D Mask Object */}
            <div className="rounded-3xl border border-stone-200/90 bg-white/80 p-6 sm:p-8 flex flex-col justify-between shadow-2xs group">
              <div className="space-y-6">
                <div
                  onClick={() =>
                    setLightbox({
                      src: MASK_3D,
                      alt: '3D-printed Lenin mask held in a human palm',
                      caption: tx('Precision 3D-printed Lenin mask resting in a palm.', 'Высокоточная 3D-модель маски Ленина на ладони.'),
                    })
                  }
                  className="relative aspect-square w-full overflow-hidden rounded-2xl bg-stone-100 border border-stone-200 cursor-pointer"
                >
                  <Image
                    src={MASK_3D}
                    alt="3D printed mask"
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-cover group-hover:scale-103 transition-transform duration-500"
                  />
                  <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-stone-900/80 backdrop-blur-md text-white font-mono text-[10px] uppercase tracking-widest">
                    {tx('Physical 3D Artifact', 'Физический 3D-объект')}
                  </div>
                  <div className="absolute bottom-3 right-3 p-2 rounded-full bg-white/90 text-stone-900 shadow-xs opacity-0 group-hover:opacity-100 transition-opacity">
                    <Maximize2 className="w-4 h-4" />
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl font-serif text-stone-900">
                    {tx('Tactile 3D Mesh Replication', 'Тактильная репликация 3D-меша')}
                  </h3>
                  <p className="text-xs sm:text-sm text-stone-600 leading-relaxed font-sans">
                    {tx(
                      'Micro-millimeter surface topography captured from the original cast. An intimate palm-sized sculpture bridging tangible mass and digital code.',
                      'Сверхточная лазерная оцифровка рельефа оригинального слепка. Карманный монумент на стыке физической массы и цифрового кода.'
                    )}
                  </p>
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-stone-200 flex items-center justify-between text-xs font-mono text-stone-600">
                <span>{tx('Status: Private Collection', 'Статус: Частная коллекция')}</span>
                <span>2021 // 3D PRINT</span>
              </div>
            </div>

            {/* Right: NFT & Animation Showcase */}
            <div className="rounded-3xl border border-stone-900 bg-stone-950 text-white p-6 sm:p-8 flex flex-col justify-between shadow-xl">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1 rounded-full bg-white/10 border border-white/20 font-mono text-[10px] uppercase tracking-widest text-emerald-400 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Web3 Tokenized</span>
                  </span>
                  <span className="font-mono text-xs text-stone-400">Rarible Edition</span>
                </div>

                <div className="space-y-4">
                  <h3 className="text-3xl sm:text-4xl font-serif text-white leading-tight font-normal">
                    {tx(
                      '“Lenin opens his eyes and is slowly enveloped by green grass.”',
                      '«Ленин открывает глаза и медленно зарастает зелёной травой»'
                    )}
                  </h3>
                  <p className="text-stone-300 text-xs sm:text-sm leading-relaxed font-sans">
                    {tx(
                      'An evocative loop animation interrogating memory, ideology, and digital rebirth. Featured across international art-market press as an exemplary reinterpretation of historic monuments.',
                      'Цифровая анимация, исследующая метафизику памяти и деконструкцию культа. Освещена ведущими арт-изданиями как образец переосмысления наследия.'
                    )}
                  </p>
                </div>
              </div>

              <div className="pt-8 space-y-4">
                <a
                  href={NFT}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-white text-stone-950 font-mono text-xs uppercase font-bold tracking-widest hover:bg-stone-200 transition-colors shadow-md"
                >
                  <span>{tx('View Token on Rarible', 'Смотреть токен на Rarible')}</span>
                  <ArrowUpRight className="w-4 h-4" />
                </a>

                <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] font-mono text-stone-400">
                  <a href={S.kp} target="_blank" rel="noopener noreferrer" className="hover:text-white underline underline-offset-4">
                    KP Interview ↗
                  </a>
                  <a href={S.tan} target="_blank" rel="noopener noreferrer" className="hover:text-white underline underline-offset-4">
                    The Art Newspaper ↗
                  </a>
                  <a href={S.linkedin} target="_blank" rel="noopener noreferrer" className="hover:text-white underline underline-offset-4">
                    AI Curator Essay ↗
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== SECTION 06: ALPHABET ===================== */}
        <section id="alphabet" className="scroll-mt-36 space-y-12">
          {/* Section Header */}
          <div className="space-y-3 border-b border-stone-200/90 pb-8">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-stone-600 block font-semibold">
              06 // {tx('Print, Attribution & Exhibition', 'Печать, атрибуция и выставка')}
            </span>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-serif text-[#111111] leading-tight">
              {tx('The Erotic Alphabet,', 'Эротическая азбука,')}{' '}
              <span className="italic font-light text-stone-600">1931.</span>
            </h2>
          </div>

          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="space-y-6">
              <p className="text-base sm:text-lg text-stone-800 font-serif leading-relaxed">
                {tx(
                  'A famed series of drawings depicting an erotic alphabet dated 1931 circulates widely online attributed to Sergey Merkurov. A preserved sheet bears the handwritten inscription: “Рисовал С. Д. Меркуров 17-Х-931 г.”',
                  'Широко известная в сети серия рисунков эротической азбуки 1931 года традиционно приписывается Сергею Меркурову. Сохранившийся титульный лист содержит автограф: «Рисовал С. Д. Меркуров 17-Х-931 г.»'
                )}
              </p>

              <div className="rounded-2xl border-l-4 border-amber-600 bg-amber-50/60 p-5 space-y-2">
                <span className="font-mono text-[10px] uppercase font-bold tracking-widest text-amber-900 block">
                  {tx('Scholarly Qualification', 'Научная квалификация')}
                </span>
                <p className="text-xs text-amber-950 leading-relaxed font-sans">
                  {tx(
                    'Authorship remains critically qualified. Anton Merkurov confirmed to fact-checkers that while he has not examined the original sheets in person, the signature stylistically aligns with known family archival documents.',
                    'Атрибуция остаётся предметом научного анализа. Антон Меркуров подтвердил фактчекерам, что оригинала в руках не держал, но почерк подписи визуально согласуется с архивными автографами прадеда.'
                  )}
                </p>
              </div>

              <div className="flex flex-col gap-3 pt-2">
                <a
                  href={S.azbuka}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-stone-900 text-white font-mono text-xs uppercase tracking-wider hover:bg-stone-800 transition-colors w-fit shadow-xs"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>{tx('Explore Project Archive /azbuka/', 'Перейти в архив проекта /azbuka/')}</span>
                </a>
                <a
                  href={S.alphabet}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-xs font-mono text-stone-700 hover:text-black underline underline-offset-4"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{tx('Read Provereno.Media Fact-Check', 'Читать расследование «Проверено.Медиа»')}</span>
                </a>
              </div>
            </div>

            {/* Alphabet Timeline & Exhibitions */}
            <div className="space-y-6">
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-stone-600 block">
                {tx('Project Chronology', 'Хронология проекта')}
              </span>
              <div className="border-t border-stone-200">
                {alphabetRows.map((row) => (
                  <div
                    key={row.d}
                    className="grid grid-cols-[85px_1fr] sm:grid-cols-[100px_1fr] gap-4 py-4 border-b border-stone-200/70 items-baseline"
                  >
                    <span className="font-mono text-xs font-bold text-stone-900 tabular-nums">
                      {row.d}
                    </span>
                    <p className="text-xs sm:text-sm text-stone-700 leading-relaxed font-sans">
                      {t(row.x)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-stone-200/80 bg-white/80 p-5 space-y-2">
                <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-stone-800 block">
                  {tx('Exhibition at Cube Moscow (2020)', 'Выставка в арт-пространстве Cube (2020)')}
                </span>
                <p className="text-xs text-stone-600 leading-relaxed font-sans">
                  {tx(
                    'Anton Merkurov curated an exhibition around the series, presenting serigraph prints and collector postcards reconstructed from scans.',
                    'Антон Меркуров провёл выставку в Cube (Москва), представив тиражные шелкографии и открытки, подготовленные на основе реконструкции сканов.'
                  )}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== SECTION 07: PRESS ===================== */}
        <section id="press" className="scroll-mt-36 space-y-12">
          {/* Section Header */}
          <div className="space-y-4 border-b border-stone-200/90 pb-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="space-y-2">
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-stone-600 block font-semibold">
                  07 // {tx('Press & Documentation', 'Пресса и публикации')}
                </span>
                <h2 className="text-4xl sm:text-5xl lg:text-6xl font-serif text-[#111111] leading-tight">
                  {tx('What was written.', 'Что писали.')}
                </h2>
              </div>

              {/* Filter pills */}
              <div className="flex items-center gap-1.5 p-1 rounded-full bg-stone-100/90 border border-stone-200 w-fit">
                {[
                  { key: 'all', label: tx('All', 'Все') },
                  { key: 'cov', label: tx('Coverage', 'Упоминания') },
                  { key: 'own', label: tx('By Anton', 'Автор — Антон') },
                ].map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setPressFilter(f.key as any)}
                    className={`px-3 py-1 rounded-full text-xs font-mono uppercase tracking-wider transition-all min-h-0 min-w-0 ${
                      pressFilter === f.key
                        ? 'bg-stone-900 text-white shadow-xs'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Press Grid */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPress.map((p) => {
              const card = (
                <article
                  key={p.outlet + p.date + p.title.en}
                  className="rounded-2xl border border-stone-200/90 bg-white/80 p-5 sm:p-6 flex flex-col justify-between hover:border-stone-900 hover:shadow-lg transition-all duration-300 group h-full"
                >
                  <div className="space-y-4">
                    {p.img && (
                      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-stone-100 border border-stone-200/70">
                        <Image
                          src={IMG + p.img}
                          alt={t(p.title)}
                          fill
                          sizes="(max-width: 1024px) 50vw, 33vw"
                          className="object-cover grayscale contrast-105 group-hover:grayscale-0 group-hover:scale-102 transition-all duration-500"
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-stone-600">
                      <span className="font-bold text-stone-800">{p.outlet}</span>
                      <span>{p.date.slice(0, 4)}</span>
                    </div>

                    <h3 className="text-xl sm:text-2xl font-serif text-stone-900 group-hover:text-black leading-snug">
                      {t(p.title)}
                    </h3>
                  </div>

                  <div className="pt-6 mt-6 border-t border-stone-200/70 flex items-center justify-between text-xs font-mono">
                    <span
                      className={`px-2.5 py-1 rounded-full ${
                        p.kind === 'own'
                          ? 'bg-stone-900 text-white font-semibold'
                          : 'bg-stone-100 text-stone-700'
                      }`}
                    >
                      {p.kind === 'own' ? tx('By Anton Merkurov', 'Автор — Антон') : tx('Press Coverage', 'Пресса')}
                    </span>
                    {p.href && (
                      <span className="inline-flex items-center gap-1 text-stone-500 group-hover:text-black group-hover:translate-x-0.5 transition-all">
                        <span>{tx('Read', 'Читать')}</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                </article>
              );

              return p.href ? (
                <a
                  key={p.outlet + p.date + p.title.en}
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block h-full"
                >
                  {card}
                </a>
              ) : (
                <div key={p.outlet + p.date + p.title.en} className="h-full">
                  {card}
                </div>
              );
            })}
          </div>
        </section>

        {/* ===================== SECTION 08: SOURCES ===================== */}
        <section id="sources" className="scroll-mt-36 space-y-12">
          {/* Section Header */}
          <div className="space-y-3 border-b border-stone-200/90 pb-8">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-stone-600 block font-semibold">
              08 // {tx('Verification & Registry', 'Источники и проверка')}
            </span>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-serif text-[#111111] leading-tight">
              {tx('Follow the evidence.', 'Проверяйте по источникам.')}
            </h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {sourceList.map(([title, href, domain], i) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl border border-stone-200/80 bg-white/70 p-4 sm:p-5 flex items-center justify-between gap-4 hover:border-stone-900 hover:shadow-xs transition-all group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <span className="font-mono text-xs text-stone-600 tabular-nums shrink-0">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-serif text-base sm:text-lg text-stone-900 group-hover:text-black truncate">
                      {title}
                    </h3>
                    <p className="font-mono text-[11px] text-stone-600 truncate">
                      {domain}
                    </p>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-stone-400 group-hover:text-black shrink-0 transition-colors" />
              </a>
            ))}
          </div>

          {/* Curatorial Closing Manifesto */}
          <div className="rounded-3xl border border-stone-300/80 bg-stone-100/70 p-6 sm:p-8 space-y-3">
            <span className="font-mono text-[11px] uppercase font-bold tracking-widest text-stone-700 block">
              {tx('Curatorial Transparency Mandate', 'Принцип кураторской прозрачности')}
            </span>
            <p className="text-xs sm:text-sm text-stone-700 leading-relaxed font-sans max-w-4xl">
              {tx(
                'This document represents an active historical archive. Where authorship, provenance, or physical survival cannot be established conclusively by published citations, it is explicitly disclosed. Personal participation is kept rigorously distinct from the work of academic institutions, specialized conservators, and collaborating cultural bodies.',
                'Данная страница является действующим исследовательским архивом. В случаях, когда авторство, провенанс или сохранность не могут быть безусловно подтверждены источниками, это открыто указано. Личное участие строго отделено от работы профильных академических институций, профессиональных реставраторов и партнёров.'
              )}
            </p>
          </div>

          {/* Back to Top */}
          <div className="pt-8 flex justify-end">
            <a
              href="#top"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white border border-stone-200 text-xs font-mono uppercase tracking-wider text-stone-700 hover:text-stone-950 hover:border-stone-900 transition-all shadow-2xs"
            >
              <ArrowUp className="w-3.5 h-3.5" />
              <span>{tx('Back to Top ↑', 'Наверх ↑')}</span>
            </a>
          </div>
        </section>
      </div>

      {/* ===================== FULL-SCREEN LIGHTBOX MODAL ===================== */}
      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col justify-between p-4 sm:p-8 animate-fadeIn"
          onClick={() => setLightbox(null)}
        >
          <div className="flex items-center justify-between text-white/80 max-w-6xl mx-auto w-full">
            <span className="font-mono text-xs uppercase tracking-widest">
              {tx('Heritage Archive Viewer', 'Архивный просмотр')}
            </span>
            <button
              type="button"
              onClick={() => setLightbox(null)}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div
            className="relative w-full max-w-5xl h-[70vh] mx-auto my-auto flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={lightbox.src}
              alt={lightbox.alt}
              fill
              className="object-contain"
              sizes="100vw"
              priority
            />
          </div>

          {lightbox.caption && (
            <div
              className="max-w-2xl mx-auto text-center text-white/90 text-xs sm:text-sm font-serif px-4"
              onClick={(e) => e.stopPropagation()}
            >
              {lightbox.caption}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
