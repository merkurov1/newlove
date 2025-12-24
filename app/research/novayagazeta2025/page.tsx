'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, ArrowRight, Share2, Printer, FileText, Lock, Smartphone, Server } from 'lucide-react';

// --- TYPES ---

type Language = 'ru' | 'en' | 'fr';

interface Section {
  title: string;
  content: React.ReactNode;
}

interface ReportData {
  meta: {
    date: string;
    tag: string;
    readTime: string;
  };
  hero: {
    title: string;
    subtitle: string;
    author: string;
    role: string;
  };
  executiveSummary: {
    title: string;
    points: string[];
  };
  body: Section[];
  footer: {
    quote: string;
    copyright: string;
  };
}

// --- CONTENT DATABASE (FULL REPORT) ---

const CONTENT: Record<Language, ReportData> = {
  // === ENGLISH ===
  en: {
    meta: {
      date: 'DECEMBER 25, 2025',
      tag: 'DEEP RESEARCH REPORT',
      readTime: '15 MIN READ',
    },
    hero: {
      title: 'From Content Censorship to Hardware Hegemony',
      subtitle: 'Analytical Report: The Transformation of Digital Control in the Russian Federation (2025).',
      author: 'Anton Merkurov',
      role: 'Independent Analyst',
    },
    executiveSummary: {
      title: 'EXECUTIVE SUMMARY',
      points: [
        'Paradigm Shift: Transition from soft filtering (IP blocking) to hard infrastructure control (device registries, hardware bans).',
        'Economic Motivation: Digital repression is a vehicle for "administrative rent" (IMEI registries, Data Centers construction).',
        'Digital Serfdom: User status degraded to a tenant of their own device; data and digital assets are revocable state property.',
        'Infrastructure Degradation: The pursuit of isolation leads to the "Iran Scenario" — technical backwardness masked by bureaucratic reporting.'
      ]
    },
    body: [
      {
        title: '1. INTRODUCTION: THE ARCHITECTURE OF CONTROL',
        content: (
          <>
            <p>The year 2025 serves as a chronicle of the final dismantling of the "free Runet" and the construction of a "digital garrison." Unlike previous years, where the focus was on blocking specific opposition resources, 2025 is characterized by a fundamental change in the vector of attack: the state ceased chasing individual packets of information and began to inventory and control the physical devices that transmit them.</p>
            <p>The primary motivation for the introduction of new repressive mechanisms (registries, storage requirements) is identified not as national security, but the monetization of prohibitions. The "security theater" covers up multi-billion ruble markets for the construction of data centers (DPCs), the development of billing systems, and the administration of databases.</p>
          </>
        )
      },
      {
        title: '2. THE NARRATIVE ARC: FAILURE OF THE FIREWALL',
        content: (
          <>
            <p>By the end of 2025, the strategy of "blacklists" (blocking prohibited sites) was recognized as insufficient. The country is plunging into "communication chaos," where access is not guaranteed even to official resources due to the chaotic operation of TSPU (Technical Means of Countering Threats).</p>
            <p>The state began the transition to <strong>"white lists"</strong> — a system where only permitted resources are accessible. This signifies a move from <em>reactive</em> censorship (blocking threats) to <em>proactive</em> isolation (allowing only the loyal). Inclusion in the "allowed" list becomes a business asset, while exclusion destroys companies dependent on connectivity.</p>
          </>
        )
      },
      {
        title: '3. THE HARDWARE SHIFT: IMEI & SMART HOME',
        content: (
          <>
            <h4 className="text-xl font-bold mt-6 mb-2">The All-Russian Census of Phones</h4>
            <p>The culmination of the year was the initiative to create a registry of IMEI codes. This marks the transition to "radio-electronic warfare against citizens." If a device is not in the "white" database (gray import), it can be turned into a "brick" — disconnected from the network by the operator.</p>
            <p>The fight against the "gray market" (estimated at 200 billion rubles) is merely a pretext. The real goal is the creation of a new corruption feeder. The costs are shifted to the consumer, who will pay for the registration of their own surveillance.</p>
            
            <h4 className="text-xl font-bold mt-6 mb-2">Goodbye, Alice</h4>
            <p>The control extends to the domestic environment. Smart home devices have become "Transparent Home" tools. Citizens voluntarily install listening devices (smart speakers) into their kitchens, paying for the electricity and internet connection for the Major to listen in.</p>
          </>
        )
      },
      {
        title: '4. ECONOMICS OF REPRESSION: THE YAROVAYA TAX',
        content: (
          <>
            <p>Repression is an industry. The expansion of the "Yarovaya Package" (storage of all traffic for 3 years) serves the builders of data centers, a market estimated at 200–250 billion rubles.</p>
            <p>The cost is passed to the consumer through increased tariffs. Every time you send a message, the computer heats up, and someone profits from the electricity and rack space. This creates a closed loop where data must remain within domestic DPCs, feeding the state-affiliated market.</p>
          </>
        )
      },
      {
        title: '5. FORECAST 2026: THE ERA OF BRICKS',
        content: (
          <>
            <p>Based on the trajectory identified in 2025, we project the following for 2026:</p>
            <ul className="list-disc pl-5 space-y-2 mt-4">
              <li><strong>The Gadget Market:</strong> A bifurcation into "White" (expensive, spying) and "Gray" (risky) devices. The IMEI registry will impose a "registration tax" on every device.</li>
              <li><strong>Connectivity Costs:</strong> Expect tariff hikes by 20–30%. Operators will pass 100% of compliance costs to subscribers.</li>
              <li><strong>Total Transparency:</strong> The concept of "privacy" will be legally abolished. The digital identity of a citizen will be conditional on loyalty.</li>
              <li><strong>AI Winter:</strong> Despite propaganda, the lack of chips and talent will lead to the stagnation of "Sovereign AI," turning it into a tool solely for police analytics.</li>
            </ul>
          </>
        )
      }
    ],
    footer: {
      quote: "The border of privacy has moved. It used to be the cable in the hallway. Now it is your skin.",
      copyright: "© 2025 Merkurov. Bureaucratic Magic Division."
    }
  },

  // === RUSSIAN ===
  ru: {
    meta: {
      date: '25 ДЕКАБРЯ 2025',
      tag: 'АНАЛИТИЧЕСКИЙ ДОКЛАД',
      readTime: '15 МИН ЧТЕНИЯ',
    },
    hero: {
      title: 'От цензуры контента к гегемонии железа',
      subtitle: 'Стратегический отчет: Трансформация цифрового контроля в РФ (2025).',
      author: 'Антон Меркуров',
      role: 'Независимый аналитик',
    },
    executiveSummary: {
      title: 'КЛЮЧЕВЫЕ ВЫВОДЫ',
      points: [
        'Смена парадигмы: Переход от мягкой фильтрации (блокировка IP) к жесткому инфраструктурному контролю (реестры IMEI, запрет оборудования).',
        'Экономика репрессий: Движущая сила — не безопасность, а извлечение «административной ренты» (строительство ЦОДов, биллинг реестров).',
        'Цифровое крепостничество: Статус пользователя деградировал до арендатора своего устройства; данные и активы являются собственностью государства.',
        'Деградация инфраструктуры: Курс на изоляцию ведет к сценарию «Иран» — технологическая отсталость, скрытая за бюрократическими отчетами.'
      ]
    },
    body: [
      {
        title: '1. ВВЕДЕНИЕ: АРХИТЕКТУРА КОНТРОЛЯ',
        content: (
          <>
            <p>2025 год стал хроникой окончательного демонтажа «свободного Рунета» и строительства «цифрового гарнизона». В отличие от прошлых лет, когда фокус был на блокировке отдельных оппозиционных ресурсов, 2025-й характеризуется фундаментальной сменой вектора атаки: государство перестало гоняться за отдельными пакетами информации и начало инвентаризировать физические устройства, которые их передают.</p>
            <p>Главная мотивация внедрения новых репрессивных механизмов — не нацбезопасность, а монетизация запретов. За «театром безопасности» скрываются многомиллиардные рынки строительства ЦОДов, разработки биллинговых систем и администрирования баз данных.</p>
          </>
        )
      },
      {
        title: '2. СЮЖЕТ ГОДА: ПРОВАЛ ФАЕРВОЛА',
        content: (
          <>
            <p>К концу 2025 года стратегия «черных списков» была признана недостаточной. Страна погружается в «коммуникационный хаос», где доступ не гарантирован даже к официальным ресурсам из-за хаотичной работы ТСПУ.</p>
            <p>Государство начало переход к <strong>«белым спискам»</strong> — системе, где доступно только разрешенное. Это означает переход от <em>реактивной</em> цензуры к <em>проактивной</em> изоляции. Включение в «белый список» становится бизнес-активом, а исключение уничтожает компании, зависящие от связности.</p>
          </>
        )
      },
      {
        title: '3. АППАРАТНЫЙ СДВИГ: IMEI И УМНЫЙ ДОМ',
        content: (
          <>
            <h4 className="text-xl font-bold mt-6 mb-2">Всероссийская перепись телефонов</h4>
            <p>Кульминацией года стала инициатива создания реестра IMEI. Это «радиоэлектронная борьба с гражданами». Если устройства нет в «белой» базе (серый импорт), оно превращается в «кирпич» — оператор просто отключает его от сети.</p>
            <p>Борьба с «серым рынком» (200 млрд руб) — лишь предлог. Реальная цель — создание новой коррупционной кормушки. Расходы перекладываются на потребителя, который будет оплачивать регистрацию собственной слежки.</p>
            
            <h4 className="text-xl font-bold mt-6 mb-2">Прощай, Алиса</h4>
            <p>Контроль распространяется на бытовую среду. Умный дом стал «Прозрачным домом». Граждане добровольно устанавливают подслушивающие устройства (умные колонки) на кухни, оплачивая электричество для того, чтобы Товарищ Майор мог слушать.</p>
          </>
        )
      },
      {
        title: '4. ЭКОНОМИКА «ПАКЕТА ЯРОВОЙ»',
        content: (
          <>
            <p>Репрессии — это индустрия. Расширение «Пакета Яровой» (хранение всего трафика 3 года) обслуживает интересы строителей ЦОДов (рынок 200–250 млрд руб).</p>
            <p>Стоимость перекладывается на абонента через рост тарифов. Каждый раз, когда вы отправляете сообщение, компьютер греется, и кто-то зарабатывает на электричестве и стойко-местах. Данные должны оставаться внутри отечественных ЦОДов, кормя аффилированный рынок.</p>
          </>
        )
      },
      {
        title: '5. ПРОГНОЗ 2026: ЭПОХА КИРПИЧЕЙ',
        content: (
          <>
            <p>Экстраполируя тренды 2025 года, мы прогнозируем на 2026 год:</p>
            <ul className="list-disc pl-5 space-y-2 mt-4">
              <li><strong>Рынок гаджетов:</strong> Раскол на «Белый» (дорогой, следящий) и «Серый» (рискованный) рынки. Реестр IMEI введет «налог на регистрацию».</li>
              <li><strong>Связь:</strong> Рост тарифов на 20–30%. Операторы переложат 100% расходов на абонентов.</li>
              <li><strong>Приватность:</strong> Понятие будет юридически упразднено. Цифровая личность станет условной, зависящей от лояльности.</li>
              <li><strong>Зима ИИ:</strong> Несмотря на пропаганду, дефицит чипов и талантов приведет к стагнации «Суверенного ИИ», превращая его исключительно в инструмент полицейской аналитики.</li>
            </ul>
          </>
        )
      }
    ],
    footer: {
      quote: "Граница приватности сместилась. Раньше она проходила по кабелю в подъезде. Теперь она проходит по вашей коже.",
      copyright: "© 2025 MERKUROV. UNFRAMED ANALYTICS."
    }
  },

  // === FRENCH ===
  fr: {
    meta: {
      date: '25 DÉCEMBRE 2025',
      tag: 'RAPPORT ANALYTIQUE',
      readTime: '15 MIN DE LECTURE',
    },
    hero: {
      title: 'De la censure du contenu à l\'hégémonie du matériel',
      subtitle: 'Rapport Stratégique : La transformation du contrôle numérique en Russie (2025).',
      author: 'Anton Merkurov',
      role: 'Analyste Indépendant',
    },
    executiveSummary: {
      title: 'RÉSUMÉ EXÉCUTIF',
      points: [
        'Changement de paradigme : Transition du filtrage souple (blocage IP) au contrôle strict des infrastructures (registres IMEI, interdictions matérielles).',
        'Motivation économique : La répression numérique est un véhicule de "rente administrative" (registres IMEI, construction de Data Centers).',
        'Servage numérique : Le statut de l\'utilisateur dégradé à celui de locataire de son appareil ; les données sont propriété de l\'État.',
        'Dégradation des infrastructures : La poursuite de l\'isolement mène au scénario "Iran" — un retard technique masqué par des rapports bureaucratiques.'
      ]
    },
    body: [
      {
        title: '1. INTRODUCTION : L\'ARCHITECTURE DU CONTRÔLE',
        content: (
          <>
            <p>L'année 2025 marque le démantèlement final du "Runet libre" et la construction d'une "garnison numérique". Contrairement aux années précédentes, l'État a cessé de chasser les paquets d'information individuels pour commencer à inventorier les appareils physiques qui les transmettent.</p>
            <p>La motivation principale n'est pas la sécurité nationale, mais la monétisation des interdictions. Le "théâtre de sécurité" dissimule des marchés de plusieurs milliards de roubles pour la construction de centres de données et l'administration de bases de données.</p>
          </>
        )
      },
      {
        title: '2. L\'ARC NARRATIF : L\'ÉCHEC DU PARE-FEU',
        content: (
          <>
            <p>Fin 2025, la stratégie des "listes noires" a été reconnue comme insuffisante. Le pays plonge dans un "chaos communicationnel".</p>
            <p>L'État a entamé la transition vers les <strong>"listes blanches"</strong> — un système où seul ce qui est autorisé est accessible. Cela signifie passer d'une censure <em>réactive</em> à une isolation <em>proactive</em>. L'inclusion dans la liste devient un actif commercial.</p>
          </>
        )
      },
      {
        title: '3. LE VIRAGE MATÉRIEL : IMEI ET MAISON INTELLIGENTE',
        content: (
          <>
            <h4 className="text-xl font-bold mt-6 mb-2">Le recensement panrusse des téléphones</h4>
            <p>Le point culminant a été l'initiative du registre IMEI. Si un appareil n'est pas dans la base "blanche", il devient une "brique" — déconnecté du réseau par l'opérateur.</p>
            <p>La lutte contre le "marché gris" est un prétexte pour créer une nouvelle manne de corruption. Les coûts sont transférés au consommateur.</p>
            
            <h4 className="text-xl font-bold mt-6 mb-2">Adieu, Alice</h4>
            <p>Le contrôle s'étend à l'environnement domestique. La maison intelligente est devenue une "Maison Transparente". Les citoyens installent volontairement des mouchards (enceintes connectées) dans leurs cuisines.</p>
          </>
        )
      },
      {
        title: '4. ÉCONOMIE DE LA RÉPRESSION : LA TAXE YAROVAYA',
        content: (
          <>
            <p>La répression est une industrie. L'extension du "Paquet Yarovaya" sert les constructeurs de centres de données (marché de 200–250 milliards de roubles).</p>
            <p>Le coût est répercuté sur l'abonné. Chaque message envoyé génère du profit pour ceux qui possèdent l'électricité et l'espace de stockage.</p>
          </>
        )
      },
      {
        title: '5. PRÉVISIONS 2026 : L\'ÈRE DE LA BRIQUE',
        content: (
          <>
            <p>En extrapolant les tendances de 2025, nous prévoyons pour 2026 :</p>
            <ul className="list-disc pl-5 space-y-2 mt-4">
              <li><strong>Marché des gadgets :</strong> Bifurcation entre le "Blanc" (cher, espion) et le "Gris" (risqué). Le registre IMEI imposera une taxe.</li>
              <li><strong>Coûts de connectivité :</strong> Hausse des tarifs de 20 à 30 %.</li>
              <li><strong>Vie privée :</strong> Le concept sera légalement aboli. L'identité numérique dépendra de la loyauté.</li>
              <li><strong>Hiver de l'IA :</strong> Stagnation de l'"IA Souveraine" faute de puces et de talents.</li>
            </ul>
          </>
        )
      }
    ],
    footer: {
      quote: "La frontière de la vie privée s'est déplacée. C'était le câble dans le couloir. Maintenant, c'est votre peau.",
      copyright: "© 2025 MERKUROV. UNFRAMED ANALYTICS."
    }
  },
};

// --- COMPONENT ---

export default function DeepResearchPage() {
  const [lang, setLang] = useState<Language>('ru');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-[#F9F9F7] text-[#111111] font-sans selection:bg-[#CC0000] selection:text-white pb-20">
      
      {/* --- NAVIGATION --- */}
      <nav className="fixed top-0 left-0 w-full bg-[#F9F9F7]/95 backdrop-blur-md z-50 border-b border-black/10 shadow-sm transition-all duration-300">
        <div className="max-w-5xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 group cursor-pointer">
            <div className="w-8 h-8 bg-[#CC0000] text-white flex items-center justify-center font-serif font-bold text-lg group-hover:rotate-12 transition-transform">
              M
            </div>
            <span className="hidden md:block font-bold tracking-widest text-xs uppercase">
              Merkurov.Report
            </span>
          </div>

          <div className="flex gap-6 text-sm font-serif font-medium">
            {(['en', 'ru', 'fr'] as Language[]).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`uppercase transition-all duration-300 relative px-1 ${
                  lang === l 
                    ? 'text-[#CC0000]' 
                    : 'text-gray-400 hover:text-black'
                }`}
              >
                {l}
                {lang === l && (
                  <motion.div 
                    layoutId="underline" 
                    className="absolute left-0 bottom-[-4px] w-full h-[2px] bg-[#CC0000]"
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="pt-32 px-4 md:px-8 max-w-5xl mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={lang}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4 }}
          >
            {/* --- HEADER --- */}
            <header className="mb-16 border-b-2 border-black pb-10">
              <div className="flex items-center gap-3 text-xs font-bold tracking-widest text-[#CC0000] mb-6 uppercase">
                <FileText className="w-4 h-4" />
                {CONTENT[lang].meta.tag}
                <span className="text-black/30">|</span>
                <span className="text-black">{CONTENT[lang].meta.date}</span>
              </div>

              <h1 className="text-4xl md:text-7xl font-serif font-bold leading-[1.05] mb-8 tracking-tight text-black">
                {CONTENT[lang].hero.title}
              </h1>

              <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                <p className="text-xl md:text-2xl font-serif italic text-gray-600 max-w-2xl leading-relaxed">
                  {CONTENT[lang].hero.subtitle}
                </p>
                
                <div className="flex items-center gap-4 min-w-max">
                  <div className="text-right">
                    <div className="font-bold text-sm uppercase tracking-wider">{CONTENT[lang].hero.author}</div>
                    <div className="text-xs text-gray-500 font-serif italic">{CONTENT[lang].hero.role}</div>
                  </div>
                  <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center text-white font-serif italic border-2 border-transparent hover:border-[#CC0000] transition-colors cursor-pointer">
                    AM
                  </div>
                </div>
              </div>
            </header>

            {/* --- EXECUTIVE SUMMARY --- */}
            <section className="bg-white border border-black p-8 md:p-10 mb-16 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
              <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                <Lock className="w-5 h-5 text-[#CC0000]" />
                <h3 className="font-bold text-sm tracking-widest uppercase">
                  {CONTENT[lang].executiveSummary.title}
                </h3>
              </div>
              <ul className="grid md:grid-cols-2 gap-x-12 gap-y-6">
                {CONTENT[lang].executiveSummary.points.map((point, i) => (
                  <li key={i} className="flex gap-4 items-start text-base md:text-lg leading-relaxed font-serif text-gray-800">
                    <span className="text-[#CC0000] font-bold mt-1">●</span>
                    {point}
                  </li>
                ))}
              </ul>
            </section>

            {/* --- BODY --- */}
            <div className="grid md:grid-cols-[1fr_300px] gap-16">
              {/* Main Text */}
              <article className="prose prose-lg md:prose-xl prose-headings:font-serif prose-headings:font-bold prose-p:text-gray-900 prose-p:leading-8 prose-li:text-gray-900 max-w-none">
                {CONTENT[lang].body.map((section, i) => (
                  <div key={i} className="mb-14">
                    <h2 className="text-2xl uppercase tracking-tighter border-l-4 border-[#CC0000] pl-4 mb-6">
                      {section.title}
                    </h2>
                    <div className="font-serif">
                      {section.content}
                    </div>
                  </div>
                ))}
              </article>

              {/* Sidebar (Context) */}
              <aside className="hidden md:block space-y-12">
                <div className="sticky top-32">
                  <div className="border-t-4 border-black pt-4 mb-8">
                    <h4 className="font-bold text-xs uppercase tracking-widest mb-4">Context</h4>
                    <p className="text-sm text-gray-500 mb-4">
                      This report aggregates analysis from 2025 columns published in <em>Novaya Gazeta</em>.
                    </p>
                    <div className="flex gap-2">
                      <Smartphone className="w-8 h-8 text-gray-300" />
                      <Server className="w-8 h-8 text-gray-300" />
                    </div>
                  </div>

                  <div className="bg-[#1a1a1a] text-white p-6 rounded-sm">
                    <h4 className="font-serif italic text-lg mb-4">
                      "{CONTENT[lang].footer.quote}"
                    </h4>
                    <div className="w-10 h-1 bg-[#CC0000]" />
                  </div>
                </div>
              </aside>
            </div>

            {/* --- FOOTER --- */}
            <footer className="mt-24 pt-12 border-t border-black flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="text-xs font-bold tracking-widest uppercase">
                {CONTENT[lang].footer.copyright}
              </div>
              <div className="flex gap-4">
                <button className="flex items-center gap-2 px-6 py-3 border border-black hover:bg-black hover:text-white transition-all uppercase text-xs font-bold tracking-widest">
                  <Share2 className="w-4 h-4" /> Share Report
                </button>
                <button className="flex items-center gap-2 px-6 py-3 bg-[#CC0000] text-white hover:bg-red-700 transition-all uppercase text-xs font-bold tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]">
                  Download PDF <Printer className="w-4 h-4" />
                </button>
              </div>
            </footer>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}