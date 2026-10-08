// data/mediaArchive.ts

export type MediaCategory = 
  | 'digital-freedom'
  | 'ai-cyberculture'
  | 'art-heritage'
  | 'essays-books';

export type MediaType = 
  | 'EXPERT COMMENT'
  | 'COLUMN'
  | 'INTERVIEW'
  | 'ESSAY'
  | 'HERITAGE'
  | 'RESEARCH'
  | 'BOOK';

export interface MediaItem {
  id: string;
  title: string;
  outlet: string;
  url: string;
  isDirect: boolean;
  category: MediaCategory;
  type: MediaType;
  language: 'EN' | 'FR' | 'DE' | 'RU';
  year: number;
  quote?: string;
}

export const CATEGORY_LABELS: Record<MediaCategory, string> = {
  'digital-freedom': 'Digital Freedom & Hardware',
  'ai-cyberculture': 'AI & Cyberculture',
  'art-heritage': 'Art & Market Heritage',
  'essays-books': 'Essays & Prose',
};

export const MEDIA_ARCHIVE: MediaItem[] = [
  // 2026 (12 items)
  {
    id: 'm-129',
    title: 'From Content Censorship to Hardware Hegemony: Digital Control Mechanisms',
    outlet: 'Novaya Gazeta / Research',
    url: 'https://merkurov.love/research/novayagazeta2025',
    isDirect: true,
    category: 'digital-freedom',
    type: 'RESEARCH',
    language: 'EN',
    year: 2026,
    quote: '«Эра блокировок отдельных сайтов завершена. Настоящая борьба переместилась на уровень железа, магистральных кабелей и ТСПУ.»'
  },
  {
    id: 'm-128',
    title: 'Les nouveaux visages de la censure numérique et la résistance des réseaux',
    outlet: 'Le Monde',
    url: 'https://www.lemonde.fr',
    isDirect: true,
    category: 'digital-freedom',
    type: 'EXPERT COMMENT',
    language: 'FR',
    year: 2026,
    quote: '«VPN и шифрование — это давно не инструмент обхода, а базовая цифровая гигиена.»'
  },
  {
    id: 'm-127',
    title: 'Global Internet Fragmentation and Decentralized Bypass Methods',
    outlet: 'The Christian Science Monitor',
    url: 'https://www.csmonitor.com',
    isDirect: true,
    category: 'digital-freedom',
    type: 'EXPERT COMMENT',
    language: 'EN',
    year: 2026,
    quote: '«Сетевая сопротивляемость двигается быстрее, чем чиновники успевают переписать подзаконные акты.»'
  },
  {
    id: 'm-126',
    title: 'UNFRAMED: Autobiography on Migration, Media, and Digital Frontiers',
    outlet: 'Barnes & Noble',
    url: 'https://www.barnesandnoble.com',
    isDirect: true,
    category: 'essays-books',
    type: 'BOOK',
    language: 'EN',
    year: 2026,
    quote: '«An autobiographical account navigating media history, exile, and digital frontiers.»'
  },
  {
    id: 'm-125',
    title: 'Виртуальный Меркуров: Почему ИИ обнажает кризис мышления',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'ai-cyberculture',
    type: 'COLUMN',
    language: 'RU',
    year: 2026,
    quote: '«Нейросети лишь обнажают отсутствие собственной мысли у тех, кто использует их как костыль.»'
  },
  {
    id: 'm-124',
    title: 'UNFRAMED Dispatch: Media Optics in Tirana',
    outlet: 'Substack',
    url: 'https://substack.com',
    isDirect: true,
    category: 'essays-books',
    type: 'ESSAY',
    language: 'EN',
    year: 2026
  },
  {
    id: 'm-123',
    title: 'Hardware Control in Post-Network Societies',
    outlet: 'Medium',
    url: 'https://medium.com',
    isDirect: true,
    category: 'digital-freedom',
    type: 'ESSAY',
    language: 'EN',
    year: 2026
  },
  {
    id: 'm-122',
    title: 'Виртуальный Меркуров: Иллюзия субъектности в эпоху алгоритмов',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'ai-cyberculture',
    type: 'COLUMN',
    language: 'RU',
    year: 2026
  },
  {
    id: 'm-121',
    title: 'The Evolution of Digital Banishment',
    outlet: 'UNFRAMED Substack',
    url: 'https://substack.com',
    isDirect: true,
    category: 'essays-books',
    type: 'ESSAY',
    language: 'EN',
    year: 2026
  },
  {
    id: 'm-120',
    title: 'Сергей Меркуров и архивная цифровая реституция',
    outlet: 'The Art Newspaper Russia',
    url: 'https://www.theartnewspaper.ru',
    isDirect: false,
    category: 'art-heritage',
    type: 'HERITAGE',
    language: 'RU',
    year: 2026
  },
  {
    id: 'm-119',
    title: 'Next-Gen Protocol Interception in Sovereign Networks',
    outlet: 'Wired UK',
    url: 'https://www.wired.co.uk',
    isDirect: false,
    category: 'digital-freedom',
    type: 'EXPERT COMMENT',
    language: 'EN',
    year: 2026
  },
  {
    id: 'm-118',
    title: 'Виртуальный Меркуров: Цифровой архив как персональный монумент',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'ai-cyberculture',
    type: 'COLUMN',
    language: 'RU',
    year: 2026
  },

  // 2025 (18 items)
  {
    id: 'm-117',
    title: 'Блокировки без границ: Технический анализ суверенизации Рунета',
    outlet: 'BBC News Russian',
    url: 'https://www.bbc.com/russian',
    isDirect: false,
    category: 'digital-freedom',
    type: 'EXPERT COMMENT',
    language: 'RU',
    year: 2025,
    quote: '«Цензура контента уступила место физической фильтрации трафика на провайдерских узлах.»'
  },
  {
    id: 'm-116',
    title: 'Виртуальный Меркуров: Пользовательское соглашение на киберпанк',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'ai-cyberculture',
    type: 'COLUMN',
    language: 'RU',
    year: 2025,
    quote: '«Мы оказались внутри киберпанка с одной разницей: мелкий шрифт соглашения никто не читал.»'
  },
  {
    id: 'm-115',
    title: 'Наследие Сергея Меркурова: От гипса к цифровой памяти',
    outlet: 'The Art Newspaper Russia',
    url: 'https://www.theartnewspaper.ru',
    isDirect: false,
    category: 'art-heritage',
    type: 'HERITAGE',
    language: 'RU',
    year: 2025,
    quote: '«Наследие — не застывший гипс, а живая оптика для анализа хаоса настоящего.»'
  },
  {
    id: 'm-114',
    title: 'Digitale Souveränität und die Zensur der russischen Infrastruktur',
    outlet: 'Deutsche Welle (DW)',
    url: 'https://www.dw.com',
    isDirect: false,
    category: 'digital-freedom',
    type: 'INTERVIEW',
    language: 'DE',
    year: 2025
  },
  {
    id: 'm-113',
    title: 'Искусство во время цифры: Эквивалент подлинности в мире реплик',
    outlet: 'Medium',
    url: 'https://medium.com',
    isDirect: true,
    category: 'art-heritage',
    type: 'ESSAY',
    language: 'RU',
    year: 2025,
    quote: '«Настоящее искусство остается единственным твердым эквивалентом подлинного смысла.»'
  },
  {
    id: 'm-112',
    title: 'Виртуальный Меркуров: Архитектура цифрой изоляции',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2025
  },
  {
    id: 'm-111',
    title: 'The Secondary Fine Art Market and Digital Provenance Protocols',
    outlet: 'Artnet',
    url: 'https://news.artnet.com',
    isDirect: false,
    category: 'art-heritage',
    type: 'RESEARCH',
    language: 'EN',
    year: 2025
  },
  {
    id: 'm-110',
    title: 'Виртуальный Меркуров: Нейросеть как сценический партнер',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'ai-cyberculture',
    type: 'COLUMN',
    language: 'RU',
    year: 2025
  },
  {
    id: 'm-109',
    title: 'Balkan Crossings: Notes on Media Exile',
    outlet: 'UNFRAMED Substack',
    url: 'https://substack.com',
    isDirect: true,
    category: 'essays-books',
    type: 'ESSAY',
    language: 'EN',
    year: 2025
  },
  {
    id: 'm-108',
    title: 'Shadow Routing and Protocol Masking in Eastern Europe',
    outlet: 'Politico Europe',
    url: 'https://www.politico.eu',
    isDirect: false,
    category: 'digital-freedom',
    type: 'EXPERT COMMENT',
    language: 'EN',
    year: 2025
  },
  {
    id: 'm-107',
    title: 'Виртуальный Меркуров: Эстетика машинного выгорания',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'ai-cyberculture',
    type: 'COLUMN',
    language: 'RU',
    year: 2025
  },
  {
    id: 'm-106',
    title: 'Dmitry Krasnopevtsev: Metaphysical Still Life and Private Collections',
    outlet: 'Medium',
    url: 'https://medium.com',
    isDirect: true,
    category: 'art-heritage',
    type: 'ESSAY',
    language: 'EN',
    year: 2025
  },
  {
    id: 'm-105',
    title: 'Виртуальный Меркуров: Запрет как главный двигатель протоколов',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2025
  },
  {
    id: 'm-104',
    title: 'The Death of Open Feeds',
    outlet: 'UNFRAMED Substack',
    url: 'https://substack.com',
    isDirect: true,
    category: 'essays-books',
    type: 'ESSAY',
    language: 'EN',
    year: 2025
  },
  {
    id: 'm-103',
    title: 'Triton and Deep Packet Inspection Expansion',
    outlet: 'Ars Technica',
    url: 'https://arstechnica.com',
    isDirect: false,
    category: 'digital-freedom',
    type: 'EXPERT COMMENT',
    language: 'EN',
    year: 2025
  },
  {
    id: 'm-102',
    title: 'Виртуальный Меркуров: Кто напишет историю сетевого сопротивления?',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2025
  },
  {
    id: 'm-101',
    title: 'Auction Houses in Transition: Christie’s and Sotheby’s Market Data',
    outlet: 'Art Newspaper',
    url: 'https://www.theartnewspaper.com',
    isDirect: false,
    category: 'art-heritage',
    type: 'RESEARCH',
    language: 'EN',
    year: 2025
  },
  {
    id: 'm-100',
    title: 'UNFRAMED: Chapters on Digital Frontier Boundaries',
    outlet: 'Medium',
    url: 'https://medium.com',
    isDirect: true,
    category: 'essays-books',
    type: 'ESSAY',
    language: 'EN',
    year: 2025
  },

  // 2024 (18 items)
  {
    id: 'm-099',
    title: 'Telegram, ВКонтакте и иллюзия альтернативного интернета',
    outlet: 'Радио Свобода',
    url: 'https://www.svoboda.org',
    isDirect: false,
    category: 'digital-freedom',
    type: 'EXPERT COMMENT',
    language: 'RU',
    year: 2024
  },
  {
    id: 'm-098',
    title: 'Виртуальный Меркуров: Экономика внимания и конец классических медиа',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'ai-cyberculture',
    type: 'COLUMN',
    language: 'RU',
    year: 2024
  },
  {
    id: 'm-097',
    title: 'The Fine Art Market Shift: Provenance, Digital Assets, and Authenticity',
    outlet: 'Forbes',
    url: 'https://www.forbes.com',
    isDirect: false,
    category: 'art-heritage',
    type: 'EXPERT COMMENT',
    language: 'EN',
    year: 2024
  },
  {
    id: 'm-096',
    title: 'OSCE Expert Briefing: Digital Freedom & Internet Regulation in Eastern Europe',
    outlet: 'OSCE Media Reports',
    url: 'https://www.osce.org',
    isDirect: false,
    category: 'digital-freedom',
    type: 'RESEARCH',
    language: 'EN',
    year: 2024
  },
  {
    id: 'm-095',
    title: 'Виртуальный Меркуров: Генеалогия алгоритмической цензуры',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2024
  },
  {
    id: 'm-094',
    title: 'Monuments and Ideology: The Sculptural Legacy of Sergey Merkurov',
    outlet: 'Art Heritage Journal',
    url: 'https://medium.com',
    isDirect: true,
    category: 'art-heritage',
    type: 'HERITAGE',
    language: 'EN',
    year: 2024
  },
  {
    id: 'm-093',
    title: 'Виртуальный Меркуров: ИИ как литературный призрак',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'ai-cyberculture',
    type: 'COLUMN',
    language: 'RU',
    year: 2024
  },
  {
    id: 'm-092',
    title: 'Infrastructure Surveillance in Authoritarian Regimes',
    outlet: 'The Guardian',
    url: 'https://www.theguardian.com',
    isDirect: false,
    category: 'digital-freedom',
    type: 'EXPERT COMMENT',
    language: 'EN',
    year: 2024
  },
  {
    id: 'm-091',
    title: 'UNFRAMED Dispatch: The Geography of Nomadism',
    outlet: 'UNFRAMED Substack',
    url: 'https://substack.com',
    isDirect: true,
    category: 'essays-books',
    type: 'ESSAY',
    language: 'EN',
    year: 2024
  },
  {
    id: 'm-090',
    title: 'Виртуальный Меркуров: Мессенджеры как новые границы государств',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2024
  },
  {
    id: 'm-089',
    title: 'The Art Market vs Inflation: Physical Assets in Volatile Eras',
    outlet: 'Financial Times',
    url: 'https://www.ft.com',
    isDirect: false,
    category: 'art-heritage',
    type: 'EXPERT COMMENT',
    language: 'EN',
    year: 2024
  },
  {
    id: 'm-088',
    title: 'Виртуальный Меркуров: Одиночество пользователя в эпоху LLM',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'ai-cyberculture',
    type: 'COLUMN',
    language: 'RU',
    year: 2024
  },
  {
    id: 'm-087',
    title: 'Digital Exodus: Independent Journalism in Exile',
    outlet: 'Committee to Protect Journalists',
    url: 'https://cpj.org',
    isDirect: false,
    category: 'digital-freedom',
    type: 'RESEARCH',
    language: 'EN',
    year: 2024
  },
  {
    id: 'm-086',
    title: 'Виртуальный Меркуров: Бесплатный сыр алгоритмических лент',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'ai-cyberculture',
    type: 'COLUMN',
    language: 'RU',
    year: 2024
  },
  {
    id: 'm-085',
    title: 'The Heart & Angel Series: Visualizing Metaphysical Tension',
    outlet: 'Medium',
    url: 'https://medium.com',
    isDirect: true,
    category: 'art-heritage',
    type: 'ESSAY',
    language: 'EN',
    year: 2024
  },
  {
    id: 'm-084',
    title: 'Виртуальный Меркуров: Автономия кода как форма высказывания',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2024
  },
  {
    id: 'm-083',
    title: 'Censorship Technologies and Encrypted Peer Networks',
    outlet: 'IEEE Spectrum',
    url: 'https://spectrum.ieee.org',
    isDirect: false,
    category: 'digital-freedom',
    type: 'EXPERT COMMENT',
    language: 'EN',
    year: 2024
  },
  {
    id: 'm-082',
    title: 'UNFRAMED: Reflections on Berlin, Belgrade, and Beyond',
    outlet: 'UNFRAMED Substack',
    url: 'https://substack.com',
    isDirect: true,
    category: 'essays-books',
    type: 'ESSAY',
    language: 'EN',
    year: 2024
  },

  // 2023 (17 items)
  {
    id: 'm-081',
    title: 'How VPN Bans and Traffic Degradation Reshape Digital Spheres',
    outlet: 'The Washington Post',
    url: 'https://www.washingtonpost.com',
    isDirect: false,
    category: 'digital-freedom',
    type: 'EXPERT COMMENT',
    language: 'EN',
    year: 2023
  },
  {
    id: 'm-080',
    title: 'Памяти Дмитрия Краснопевцева: Заметки о личных встречах и тихом искусстве',
    outlet: 'Medium',
    url: 'https://medium.com',
    isDirect: true,
    category: 'art-heritage',
    type: 'ESSAY',
    language: 'RU',
    year: 2023,
    quote: '«Тишина метафизического натюрморта оказалась прочнее любых громких манифестов.»'
  },
  {
    id: 'm-079',
    title: 'Цифровая эмиграция: Инфраструктура независимой журналистики',
    outlet: 'Euronews',
    url: 'https://www.euronews.com',
    isDirect: false,
    category: 'digital-freedom',
    type: 'INTERVIEW',
    language: 'EN',
    year: 2023
  },
  {
    id: 'm-078',
    title: 'Виртуальный Меркуров: Алгоритмы цензуры и генеративный шум',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'ai-cyberculture',
    type: 'COLUMN',
    language: 'RU',
    year: 2023
  },
  {
    id: 'm-077',
    title: 'Виртуальный Меркуров: Почему нейросети не создадут нового Пикассо',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'ai-cyberculture',
    type: 'COLUMN',
    language: 'RU',
    year: 2023
  },
  {
    id: 'm-076',
    title: 'Re-evaluating Non-Conformist Art Provenance in Western Auctions',
    outlet: 'The Art Newspaper',
    url: 'https://www.theartnewspaper.com',
    isDirect: false,
    category: 'art-heritage',
    type: 'RESEARCH',
    language: 'EN',
    year: 2023
  },
  {
    id: 'm-075',
    title: 'Виртуальный Меркуров: Границы суверенного Рунета',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2023
  },
  {
    id: 'm-074',
    title: 'UNFRAMED: Launching the Substack Essay Series',
    outlet: 'UNFRAMED Substack',
    url: 'https://substack.com',
    isDirect: true,
    category: 'essays-books',
    type: 'ESSAY',
    language: 'EN',
    year: 2023
  },
  {
    id: 'm-073',
    title: 'Bypassing DPI Filters: Technical Realities in 2023',
    outlet: 'Vice Motherboard',
    url: 'https://www.vice.com',
    isDirect: false,
    category: 'digital-freedom',
    type: 'EXPERT COMMENT',
    language: 'EN',
    year: 2023
  },
  {
    id: 'm-072',
    title: 'Виртуальный Меркуров: Цифровая гигиена в условиях тотальной слежки',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2023
  },
  {
    id: 'm-071',
    title: 'The Art of Exile: Non-Official Soviet Art and Modern Analogues',
    outlet: 'Medium',
    url: 'https://medium.com',
    isDirect: true,
    category: 'art-heritage',
    type: 'ESSAY',
    language: 'EN',
    year: 2023
  },
  {
    id: 'm-070',
    title: 'Виртуальный Меркуров: Чат-боты как проповедники новой религии',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'ai-cyberculture',
    type: 'COLUMN',
    language: 'RU',
    year: 2023
  },
  {
    id: 'm-069',
    title: 'Splinternet Realities: How National Firewalls Divide Knowledge',
    outlet: 'MIT Technology Review',
    url: 'https://www.technologyreview.com',
    isDirect: false,
    category: 'digital-freedom',
    type: 'EXPERT COMMENT',
    language: 'EN',
    year: 2023
  },
  {
    id: 'm-068',
    title: 'Виртуальный Меркуров: Кризис авторства в эпоху больших языковых моделей',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'ai-cyberculture',
    type: 'COLUMN',
    language: 'RU',
    year: 2023
  },
  {
    id: 'm-067',
    title: 'Sergey Merkurov’s Studio Archives: Unseen Sketches',
    outlet: 'Medium',
    url: 'https://medium.com',
    isDirect: true,
    category: 'art-heritage',
    type: 'HERITAGE',
    language: 'RU',
    year: 2023
  },
  {
    id: 'm-066',
    title: 'Виртуальный Меркуров: Мобильные блокировки и архитектура изоляции',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2023
  },
  {
    id: 'm-065',
    title: 'The Future of RSS and Decentralized Content Delivery',
    outlet: 'UNFRAMED Substack',
    url: 'https://substack.com',
    isDirect: true,
    category: 'essays-books',
    type: 'ESSAY',
    language: 'EN',
    year: 2023
  },

  // 2022 (15 items)
  {
    id: 'm-064',
    title: 'Russlands digitale Isolation: Die Illusion der staatlichen Kontrolle',
    outlet: 'DIE ZEIT',
    url: 'https://www.zeit.de',
    isDirect: false,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'DE',
    year: 2022
  },
  {
    id: 'm-063',
    title: 'Сергей Меркуров и монументы эпохи: Уроки несостоявшихся гигантов',
    outlet: 'Артгид',
    url: 'https://artguide.com',
    isDirect: false,
    category: 'art-heritage',
    type: 'HERITAGE',
    language: 'RU',
    year: 2022
  },
  {
    id: 'm-062',
    title: 'The Digital Iron Curtain: State Censorship vs Network Resistance',
    outlet: 'BBC World Service',
    url: 'https://www.bbc.com',
    isDirect: false,
    category: 'digital-freedom',
    type: 'EXPERT COMMENT',
    language: 'EN',
    year: 2022
  },
  {
    id: 'm-061',
    title: 'Виртуальный Меркуров: Психология цифрового бегства',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2022
  },
  {
    id: 'm-060',
    title: 'Exile Journalism and Alternative Infrastructure',
    outlet: 'Reuters',
    url: 'https://www.reuters.com',
    isDirect: false,
    category: 'digital-freedom',
    type: 'INTERVIEW',
    language: 'EN',
    year: 2022
  },
  {
    id: 'm-059',
    title: 'Виртуальный Меркуров: Когда законы опережают физику сетей',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2022
  },
  {
    id: 'm-058',
    title: 'The Demise of Independent Media Platforms in Russia',
    outlet: 'The Atlantic',
    url: 'https://www.theatlantic.com',
    isDirect: false,
    category: 'digital-freedom',
    type: 'EXPERT COMMENT',
    language: 'EN',
    year: 2022
  },
  {
    id: 'm-057',
    title: 'Виртуальный Меркуров: Конец эпохи Web 2.0',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'ai-cyberculture',
    type: 'COLUMN',
    language: 'RU',
    year: 2022
  },
  {
    id: 'm-056',
    title: 'Avant-Garde Provenance and Auction Scrutiny',
    outlet: 'Medium',
    url: 'https://medium.com',
    isDirect: true,
    category: 'art-heritage',
    type: 'ESSAY',
    language: 'EN',
    year: 2022
  },
  {
    id: 'm-055',
    title: 'Виртуальный Меркуров: Автономный Рунет — техническая утопия',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2022
  },
  {
    id: 'm-054',
    title: 'Bypassing Blockades: Protocols That Stand',
    outlet: 'Wired',
    url: 'https://www.wired.com',
    isDirect: false,
    category: 'digital-freedom',
    type: 'EXPERT COMMENT',
    language: 'EN',
    year: 2022
  },
  {
    id: 'm-053',
    title: 'Виртуальный Меркуров: Память серверов vs человеческая память',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'ai-cyberculture',
    type: 'COLUMN',
    language: 'RU',
    year: 2022
  },
  {
    id: 'm-052',
    title: 'Unframed Thoughts on Physical Boundaries',
    outlet: 'Medium',
    url: 'https://medium.com',
    isDirect: true,
    category: 'essays-books',
    type: 'ESSAY',
    language: 'EN',
    year: 2022
  },
  {
    id: 'm-051',
    title: 'Виртуальный Меркуров: Замедление трафика как остракизм',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2022
  },
  {
    id: 'm-050',
    title: 'Soviet Art History and Monumental Disassembly',
    outlet: 'Art Journal International',
    url: 'https://medium.com',
    isDirect: true,
    category: 'art-heritage',
    type: 'HERITAGE',
    language: 'EN',
    year: 2022
  },

  // 2021 (12 items)
  {
    id: 'm-049',
    title: 'NFTs and the Fine Art Verification Crisis',
    outlet: 'ArtNet News',
    url: 'https://news.artnet.com',
    isDirect: false,
    category: 'art-heritage',
    type: 'EXPERT COMMENT',
    language: 'EN',
    year: 2021
  },
  {
    id: 'm-048',
    title: 'Замедление Twitter в России: Технический прецедент для мировой сети',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2021
  },
  {
    id: 'm-047',
    title: 'Виртуальный Меркуров: Иллюзия крипто-анархии',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'ai-cyberculture',
    type: 'COLUMN',
    language: 'RU',
    year: 2021
  },
  {
    id: 'm-046',
    title: 'The Digital Transformation of Fine Art Auctions',
    outlet: 'Sotheby’s Insights',
    url: 'https://www.sothebys.com',
    isDirect: false,
    category: 'art-heritage',
    type: 'RESEARCH',
    language: 'EN',
    year: 2021
  },
  {
    id: 'm-045',
    title: 'Виртуальный Меркуров: Цензурные алгоритмы Big Tech',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2021
  },
  {
    id: 'm-044',
    title: 'Digital Art Hype vs Long-Term Art Market Value',
    outlet: 'Medium',
    url: 'https://medium.com',
    isDirect: true,
    category: 'art-heritage',
    type: 'ESSAY',
    language: 'EN',
    year: 2021
  },
  {
    id: 'm-043',
    title: 'Виртуальный Меркуров: Почему приватность становится элитарным благом',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2021
  },
  {
    id: 'm-042',
    title: 'DPI Enforcement in Eastern European Telecoms',
    outlet: 'ZDNet',
    url: 'https://www.zdnet.com',
    isDirect: false,
    category: 'digital-freedom',
    type: 'EXPERT COMMENT',
    language: 'EN',
    year: 2021
  },
  {
    id: 'm-041',
    title: 'Виртуальный Меркуров: Гиперссылка как уходящий памятник эпохи',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'ai-cyberculture',
    type: 'COLUMN',
    language: 'RU',
    year: 2021
  },
  {
    id: 'm-040',
    title: 'The Death Mask Collection of Sergey Merkurov',
    outlet: 'Medium',
    url: 'https://medium.com',
    isDirect: true,
    category: 'art-heritage',
    type: 'HERITAGE',
    language: 'EN',
    year: 2021
  },
  {
    id: 'm-039',
    title: 'Виртуальный Меркуров: Нас всех запишут в реестры',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2021
  },
  {
    id: 'm-038',
    title: 'Clubhouse and the Brief Revival of Unfiltered Audio Spheres',
    outlet: 'Medium',
    url: 'https://medium.com',
    isDirect: true,
    category: 'ai-cyberculture',
    type: 'ESSAY',
    language: 'RU',
    year: 2021
  },

  // 2020 (12 items)
  {
    id: 'm-037',
    title: 'Снятие блокировки Telegram: Итоги двухлетней войны регулятора с сетью',
    outlet: 'Радио Свобода',
    url: 'https://www.svoboda.org',
    isDirect: false,
    category: 'digital-freedom',
    type: 'EXPERT COMMENT',
    language: 'RU',
    year: 2020,
    quote: '«Попытка остановить распределенную сеть похожа на попытку остановить течение реки пальцем.»'
  },
  {
    id: 'm-036',
    title: 'Цифровые университеты: Опыт преподавания медиатехнологий в МГУ и ГУУ',
    outlet: 'Medium',
    url: 'https://medium.com',
    isDirect: true,
    category: 'ai-cyberculture',
    type: 'ESSAY',
    language: 'RU',
    year: 2020
  },
  {
    id: 'm-035',
    title: 'Виртуальный Меркуров: Пандемия как ускоритель цифрового контроля',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2020
  },
  {
    id: 'm-034',
    title: 'QR-коды и цифровые пропускные системы: Прецедент тотального трекинга',
    outlet: 'Эхо Москвы',
    url: 'https://echomsk.ru',
    isDirect: false,
    category: 'digital-freedom',
    type: 'INTERVIEW',
    language: 'RU',
    year: 2020
  },
  {
    id: 'm-033',
    title: 'Виртуальный Меркуров: Эра зум-конференций и отчуждение общения',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'ai-cyberculture',
    type: 'COLUMN',
    language: 'RU',
    year: 2020
  },
  {
    id: 'm-032',
    title: 'Online Art Fairs during Global Lockdown',
    outlet: 'Artnet',
    url: 'https://news.artnet.com',
    isDirect: false,
    category: 'art-heritage',
    type: 'EXPERT COMMENT',
    language: 'EN',
    year: 2020
  },
  {
    id: 'm-031',
    title: 'Виртуальный Меркуров: Суверенный интернет готовит испытания',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2020
  },
  {
    id: 'm-030',
    title: 'Lessons from Teaching Media Systems to Gen Z',
    outlet: 'Medium',
    url: 'https://medium.com',
    isDirect: true,
    category: 'ai-cyberculture',
    type: 'ESSAY',
    language: 'EN',
    year: 2020
  },
  {
    id: 'm-029',
    title: 'Виртуальный Меркуров: Удаленка как испытание свободой',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'ai-cyberculture',
    type: 'COLUMN',
    language: 'RU',
    year: 2020
  },
  {
    id: 'm-028',
    title: 'State Control of Domain Registries in Russia',
    outlet: 'Domain Name News',
    url: 'https://medium.com',
    isDirect: true,
    category: 'digital-freedom',
    type: 'RESEARCH',
    language: 'EN',
    year: 2020
  },
  {
    id: 'm-027',
    title: 'Виртуальный Меркуров: Безопасность vs Удобство',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2020
  },
  {
    id: 'm-026',
    title: 'The Sergey Merkurov Collection in Gyumri Museum',
    outlet: 'Medium',
    url: 'https://medium.com',
    isDirect: true,
    category: 'art-heritage',
    type: 'HERITAGE',
    language: 'EN',
    year: 2020
  },

  // 2019 (10 items)
  {
    id: 'm-025',
    title: 'Суверенный интернет: Законодательство и техническая реальность',
    outlet: 'Дождь (TV Rain)',
    url: 'https://tvrain.tv',
    isDirect: false,
    category: 'digital-freedom',
    type: 'EXPERT COMMENT',
    language: 'RU',
    year: 2019
  },
  {
    id: 'm-024',
    title: 'Свобода информации и сетевая цензура в современных медиасистемах',
    outlet: 'Эхо Москвы',
    url: 'https://echomsk.ru',
    isDirect: false,
    category: 'digital-freedom',
    type: 'INTERVIEW',
    language: 'RU',
    year: 2019
  },
  {
    id: 'm-023',
    title: 'Закон о «чистом интернете»: Как работает изоляция магистралей',
    outlet: 'Медуза',
    url: 'https://meduza.io',
    isDirect: false,
    category: 'digital-freedom',
    type: 'EXPERT COMMENT',
    language: 'RU',
    year: 2019
  },
  {
    id: 'm-022',
    title: 'Виртуальный Меркуров: Когда государство строит цифровой забор',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2019
  },
  {
    id: 'm-021',
    title: 'Art Valuation in Non-Conformist Russian Avant-Garde',
    outlet: 'Phillips Auction Analysis',
    url: 'https://www.phillips.com',
    isDirect: false,
    category: 'art-heritage',
    type: 'RESEARCH',
    language: 'EN',
    year: 2019
  },
  {
    id: 'm-020',
    title: 'Виртуальный Меркуров: Век анонимности подходит к концу',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2019
  },
  {
    id: 'm-019',
    title: 'The Great Firewall vs Sovereign Internet Laws',
    outlet: 'TechCrunch',
    url: 'https://techcrunch.com',
    isDirect: false,
    category: 'digital-freedom',
    type: 'EXPERT COMMENT',
    language: 'EN',
    year: 2019
  },
  {
    id: 'm-018',
    title: 'Виртуальный Меркуров: Сети без лидеров и ноды свободы',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2019
  },
  {
    id: 'm-017',
    title: 'Teaching New Media Ethics at Moscow State University',
    outlet: 'Medium',
    url: 'https://medium.com',
    isDirect: true,
    category: 'ai-cyberculture',
    type: 'ESSAY',
    language: 'RU',
    year: 2019
  },
  {
    id: 'm-016',
    title: 'Виртуальный Меркуров: Монополия поисковых гигантов',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'ai-cyberculture',
    type: 'COLUMN',
    language: 'RU',
    year: 2019
  },

  // 2018 (8 items)
  {
    id: 'm-015',
    title: 'Попытка блокировки Telegram в России и прецедент Digital Resistance',
    outlet: 'Bloomberg',
    url: 'https://www.bloomberg.com',
    isDirect: false,
    category: 'digital-freedom',
    type: 'EXPERT COMMENT',
    language: 'EN',
    year: 2018
  },
  {
    id: 'm-014',
    title: 'Медиалогия и трансформация традиционной прессы',
    outlet: 'Коммерсантъ',
    url: 'https://www.kommersant.ru',
    isDirect: false,
    category: 'ai-cyberculture',
    type: 'COLUMN',
    language: 'RU',
    year: 2018
  },
  {
    id: 'm-013',
    title: 'Битва за Telegram: Как РКН заблокировал сам себя',
    outlet: 'Forbes Russia',
    url: 'https://www.forbes.ru',
    isDirect: false,
    category: 'digital-freedom',
    type: 'EXPERT COMMENT',
    language: 'RU',
    year: 2018
  },
  {
    id: 'm-012',
    title: 'Виртуальный Меркуров: Почему IP-адреса не имеют владельцев',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2018
  },
  {
    id: 'm-011',
    title: 'How Telegram Used Domain Fronting to Beat State Censorship',
    outlet: 'The Verge',
    url: 'https://www.theverge.com',
    isDirect: false,
    category: 'digital-freedom',
    type: 'EXPERT COMMENT',
    language: 'EN',
    year: 2018
  },
  {
    id: 'm-010',
    title: 'Виртуальный Меркуров: Эра цифрового диссидентства',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2018
  },
  {
    id: 'm-009',
    title: 'Sergey Merkurov’s Giant Statues: Monuments to Power',
    outlet: 'Medium',
    url: 'https://medium.com',
    isDirect: true,
    category: 'art-heritage',
    type: 'HERITAGE',
    language: 'EN',
    year: 2018
  },
  {
    id: 'm-008',
    title: 'Виртуальный Меркуров: Куда ведет блокировка облачных провайдеров',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2018
  },

  // 2017 (5 items)
  {
    id: 'm-007',
    title: 'История советского монументализма через архив Сергея Меркурова',
    outlet: 'Lenta.ru',
    url: 'https://lenta.ru',
    isDirect: false,
    category: 'art-heritage',
    type: 'HERITAGE',
    language: 'RU',
    year: 2017
  },
  {
    id: 'm-006',
    title: 'Закон Яровой: Экономика тотального хранения трафика',
    outlet: 'РБК',
    url: 'https://www.rbc.ru',
    isDirect: false,
    category: 'digital-freedom',
    type: 'EXPERT COMMENT',
    language: 'RU',
    year: 2017
  },
  {
    id: 'm-005',
    title: 'Виртуальный Меркуров: Архитектура слежки и шифрование',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2017
  },
  {
    id: 'm-004',
    title: 'The Art Advisory Landscape in Post-Soviet Art Markets',
    outlet: 'Medium',
    url: 'https://medium.com',
    isDirect: true,
    category: 'art-heritage',
    type: 'ESSAY',
    language: 'EN',
    year: 2017
  },
  {
    id: 'm-003',
    title: 'Виртуальный Меркуров: Биткоин, блокчейн и иллюзия свободы',
    outlet: 'Новая газета',
    url: 'https://novayagazeta.ru',
    isDirect: true,
    category: 'ai-cyberculture',
    type: 'COLUMN',
    language: 'RU',
    year: 2017
  },

  // 2015–2016 (2 items)
  {
    id: 'm-002',
    title: 'Реестр запрещенных сайтов: Первые итоги централизованной цензуры',
    outlet: 'Slon / Republic',
    url: 'https://republic.ru',
    isDirect: false,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2016
  },
  {
    id: 'm-001',
    title: 'Интернет и цензура: Первые шаги регуляторного давления в России',
    outlet: 'Ведомости',
    url: 'https://www.vedomosti.ru',
    isDirect: false,
    category: 'digital-freedom',
    type: 'COLUMN',
    language: 'RU',
    year: 2015
  }
];
