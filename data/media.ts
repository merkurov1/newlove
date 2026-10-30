// Источник правды для /media. Каждая запись открыта и сверена по ссылке (заголовок, дата, упоминание имени).
// Что не удалось подтвердить, лежит в `pending` и на сайт не попадает.
// Supabase-ready: схема плоская, MediaRecord 1:1 ложится на таблицу.

export type PublicMediaQuoteType = 'direct_quote' | 'indirect_quote' | 'mention';

export interface PublicMediaQuote {
  id: string;
  text: string;
  type: PublicMediaQuoteType;
  language: string | null;
  translation?: string | null;
  translationLanguage?: string | null;
}

export interface PublicMediaRelation {
  slug: string;
  title: string;
  outlet: string;
  url: string;
  date: string;
  relationType: string;
  confidence: number;
}

export type Lang = 'EN' | 'RU' | 'DE' | 'PL' | 'BS';
export type Topic = 'Internet & Censorship' | 'AI & Tech' | 'Art & Culture' | 'Fintech & Crypto';
export type Kind =
  | 'quote' // цитата или комментарий в материале издания
  | 'mention' // материал, где он упомянут или использован как источник
  | 'interview'
  | 'radio'
  | 'video'
  | 'column' // авторский текст
  | 'blog'
  | 'profile'; // страница автора, в таймлайн не попадает

export interface MediaRecord {
  slug: string; // для /media/record/<slug>
  title: string;
  outlet: string; // чистое имя издания, по нему считаются издания
  program?: string; // рубрика или передача
  url: string;
  date: string; // YYYY | YYYY-MM | YYYY-MM-DD
  lang: Lang;
  topic: Topic;
  kind: Kind;
  summary: string;
  note?: string; // служебное, на сайте не показывать
  id?: string;
  verifiedQuotes?: PublicMediaQuote[];
  related?: PublicMediaRelation[];
  derivedTopic?: Topic;
  subtopics?: string[];
  textQuality?: string | null;
  quoteCount?: number;
}

const TOPIC = {
  i: 'Internet & Censorship',
  a: 'AI & Tech',
  c: 'Art & Culture',
  f: 'Fintech & Crypto',
} as const satisfies Record<string, Topic>;
type T = keyof typeof TOPIC;

type Draft = Omit<MediaRecord, 'slug'>;

const r = (
  date: string,
  outlet: string,
  title: string,
  url: string,
  lang: Lang,
  t: T,
  kind: Kind,
  summary: string,
  extra: { program?: string; note?: string } = {}
): Draft => ({ date, outlet, title, url, lang, topic: TOPIC[t], kind, summary, ...extra });

// ── Новая газета: колонки ────────────────────────────────────────────────
const col = (date: string, slug: string, title: string, summary: string, t: T): Draft =>
  r(
    date,
    'Новая газета',
    title,
    `https://novayagazeta.ru/articles/${date.replace(/-/g, '/')}/${slug}`,
    'RU',
    t,
    'column',
    summary,
    { program: 'Виртуальный Меркуров' }
  );

const columns: Draft[] = [
  col(
    '2026-09-19',
    'pribyl-za-ispug',
    'Прибыль за испуг',
    'Почему владельцы крупнейших ИИ-компаний предлагают притормозить разработку передовых моделей.',
    'a'
  ),
  col(
    '2026-09-14',
    'natsionalnyi-ne-znachit-suverennyi',
    'Национальный — не значит суверенный?',
    'Новые инициативы регулирования ИИ от правительства РФ.',
    'a'
  ),
  col(
    '2026-09-08',
    'alisa-aifon-u-tebia',
    '«Алиса», айфон у тебя?',
    'Минцифры предлагает предустанавливать ИИ-помощник от «Яндекса» на все ввозимые устройства.',
    'a'
  ),
  col(
    '2026-09-05',
    'u-tekhnoguru-est-tolko-put',
    'У техногуру есть только путь',
    'О Тиме Куке, который оставил пост гендиректора Apple.',
    'a'
  ),
  col(
    '2026-09-03',
    'i-nemedlenno-zablokirovat',
    'И немедленно заблокировать!',
    'Частоты под 5G в стране, где связь работает по праздникам и по белым спискам.',
    'i'
  ),
  col(
    '2026-08-05',
    'chto-budet-s-bankovskimi-prilozheniiami',
    'Что будет с банковскими приложениями',
    'TLS-паника и вопрос, зачем снова так грубо вмешиваться.',
    'f'
  ),
  col(
    '2026-08-04',
    'iskusstvennyi-alarmizm',
    'Искусственный алармизм',
    'ИИ-агенты и «восстание машин».',
    'a'
  ),
  col(
    '2026-08-01',
    'ii-propishet-v-uk-drugoi-ii',
    'ИИ пропишет в УК другой ИИ',
    'Искусственный интеллект в юриспруденции и инициативы Бастрыкина.',
    'a'
  ),
  col(
    '2026-07-27',
    'pobeg-iz-pesochnitsy',
    'Побег из песочницы',
    'ИИ-агент OpenAI устроил переполох в другой компании.',
    'a'
  ),
  col(
    '2026-07-20',
    'app-vse',
    'App — всё',
    'Приложения российских компаний пропадают из App Store и Google Play.',
    'i'
  ),
  col(
    '2026-07-18',
    'igry-eto-vam-ne-igrushki',
    'Игры — это вам не игрушки!',
    'Стипендии за успехи в виртуальных соревнованиях в Силиконовой долине.',
    'a'
  ),
  col(
    '2026-07-17',
    'tochka-v-khatu',
    '«Точка» в хату',
    'У заключенных будет свой мессенджер, и это не «Макс».',
    'i'
  ),
  col(
    '2026-07-14',
    'otkliuchenie-evropy',
    'Отключение Европы',
    'Регулирование соцсетей в Европе и отставание от США в IT-гонке.',
    'i'
  ),
  col('2026-07-06', 'cd-dvd-uvy', 'CD, DVD — увы…', 'Sony прекращает выпуск игр на дисках.', 'a'),
  col(
    '2026-06-26',
    'ukus-iabloka',
    'Укус «яблока»',
    'Apple удалила из магазина все приложения VK.',
    'i'
  ),
  col(
    '2026-06-25',
    'regulirovanie-kazhdogo-utiuga',
    'Регулирование каждого утюга',
    'Что еще ограничат под предлогом борьбы с мошенниками.',
    'i'
  ),
  col(
    '2026-06-17',
    'zapretnyi-kod',
    'Запретный код',
    'Попытки не пускать детей в интернет и межпоколенческий конфликт.',
    'i'
  ),
  col(
    '2026-06-11',
    'sami-sebia-razblokiruite',
    'Сами себя разблокируйте!',
    'Парадоксы идеи «государственного VPN».',
    'i'
  ),
  col(
    '2026-06-10',
    'ne-bylo-u-baby-zabot-ogranichila-porosiu-registratsiiu',
    'Не было у бабы забот, ограничила поросю регистрацию',
    'Зачем государству ограничивать идентификацию через иностранные сервисы.',
    'i'
  ),
  col(
    '2026-06-05',
    'zadacha-s-neizvestnymi',
    'Задача с Неизвестными',
    'Подделки скульптора в Третьяковке как эпизод арт-рынка.',
    'c'
  ),
  col('2026-06-04', '5-i-zh', '5 и Ж', 'Самый быстрый заблокированный интернет в мире.', 'i'),
  col(
    '2026-05-27',
    'kak-budet-irtysh-po-kitaiski',
    'Как будет «Иртыш» по-китайски?',
    'Будни импортозамещения в IT.',
    'a'
  ),
  col(
    '2026-05-25',
    'kakogo-leshego',
    'Какого лешего?',
    'Ростелеком регистрирует новую систему.',
    'i'
  ),
  col(
    '2026-05-15',
    'ne-govori-git',
    'Не говори Git',
    'Интернет в России ломается и без прямых усилий Роскомнадзора.',
    'a'
  ),
  col(
    '2026-05-13',
    'ne-zabudte-vykliuchit-v-aeroportu-svet',
    'Не забудьте выключить в аэропорту свет',
    'Релокации российских IT-компаний.',
    'a'
  ),
  col(
    '2026-04-28',
    'a-rubilnik-ne-zaklinit',
    'А рубильник не заклинит?',
    'Интернет для государства как зыбучие пески.',
    'i'
  ),
  col(
    '2026-04-22',
    'delo-dzhobsa-kuka-zhivet',
    'Дело Джобса-Кука живет',
    'Смена руководства в Apple.',
    'a'
  ),
  col(
    '2026-04-17',
    'natianut-set-na-globus',
    'Натянуть Сеть на глобус',
    'Приказ о полной суверенизации неисполним, но бизнес проявляет рвение.',
    'i'
  ),
  col(
    '2026-04-15',
    'kripto-v-khatu',
    'Крипто в хату',
    'Проект уголовной ответственности за оборот криптовалют.',
    'f'
  ),
  col(
    '2026-04-14',
    'vengriia-protiv-budapeshta',
    'Венгрия против Будапешта',
    'Обещаем все, но ничего не выполним.',
    'c'
  ),
  col(
    '2026-04-06',
    'internet-budet-rabotat-khot-i-cherez-tri-bukvy',
    'Интернет будет работать. Хоть и через три буквы',
    'Нельзя запретить средства обхода блокировок.',
    'i'
  ),
  col(
    '2026-04-02',
    'app-uidi',
    'App-уйди',
    'Минцифры запрещает операторам финансовые транзакции в адрес Apple.',
    'i'
  ),
  col(
    '2026-03-30',
    'vo-vsem-vinovat-internet',
    'Во всем виноват интернет',
    'Иски к соцсетям за «залипание».',
    'i'
  ),
  col(
    '2026-03-28',
    'roboty-v-laptiakh',
    'Роботы в лаптях',
    'Нет своего интеллекта — искусственный не поможет.',
    'a'
  ),
  col(
    '2026-03-25',
    'takoi-ii-nam-ne-nuzhen',
    'Такой ИИ нам не нужен',
    'Минцифры и запрет иностранного ИИ.',
    'a'
  ),
  col(
    '2026-03-18',
    'vy-tam-nuzhny-za-27-milliardov',
    'Вы там нужны за $27 миллиардов',
    'Nebius Аркадия Воложа и инвестиции Meta.',
    'a'
  ),
  col(
    '2026-03-12',
    'v-leto-bez-interneta',
    'В лето — без интернета',
    'Отключения мобильного интернета вместе с отоплением.',
    'i'
  ),
  col(
    '2026-03-09',
    'vosstanie-mashin-prodlitsia-vechno',
    'Восстание машин продлится вечно',
    'ИИ изменит мир, но не скоро и не весь.',
    'a'
  ),
  col(
    '2026-03-03',
    'gliukgpt',
    'ГлюкGPT',
    'В России померещился искусственно-государственный интеллект.',
    'a'
  ),
  col(
    '2026-02-28',
    'telegram-ostanetsia-bez-durakov',
    'Телеграм останется, без дураков',
    'Слухи об «окончательной блокировке» 1 апреля.',
    'i'
  ),
  col(
    '2026-02-20',
    'a-telega-i-nyne-tam',
    'А Телега и ныне там',
    'Ограничение Telegram обернулось информационным и технологическим хаосом.',
    'i'
  ),
  col(
    '2026-02-14',
    'nu-i-dns-c-nim',
    'Ну и DNS c ним',
    'Роскомнадзор решил отнять у ресурсов имя.',
    'i'
  ),
  col(
    '2026-02-11',
    'vot-vam-telegram',
    'Вот вам, Telegram',
    'Даже талибы не стали трогать «телегу».',
    'i'
  ),
  col(
    '2026-02-07',
    'tirana-bez-tirana',
    'Тирана без тирана',
    'Заметки об Албании, где у власти художник.',
    'c'
  ),
  col(
    '2026-01-27',
    'podtverdi-chto-zhiv',
    'Подтверди, что жив',
    'Китайское приложение для одиноких домохозяйств.',
    'a'
  ),
  col(
    '2026-01-23',
    'irankomnadzor',
    'ИранКомНадзор',
    'Возможны ли иранские блокировки в России.',
    'i'
  ),
  col(
    '2026-01-19',
    'naidet-opishet-i-prodast',
    'Найдет, опишет и продаст',
    'ИИ выходит на арт-рынок.',
    'c'
  ),
  col(
    '2026-01-10',
    'ne-tolko-makh',
    'Не только MAX',
    'Национальные мессенджеры в разных странах.',
    'i'
  ),
  col(
    '2025-12-23',
    'vserossiiskaia-perepis-telefonov',
    'Всероссийская перепись телефонов',
    'Зачем государство вводит новый реестр.',
    'i'
  ),
];

// ── Всё остальное (интегрировано и дополнено) ────────────────────────────
const items: Draft[] = [
  // 2026
  r(
    '2026-05-31',
    'Le Monde',
    "Putin's war fuels the growing role of Russia's FSB",
    'https://www.lemonde.fr/en/international/article/2026/05/31/putin-s-war-fuels-the-growing-role-of-russia-s-fsb-intelligence-agency_6753983_4.html',
    'EN',
    'i',
    'quote',
    'Экспертный комментарий для ведущей французской газеты о трансформации цифрового контроля и сетевой инфраструктуры.'
  ),
  r(
    '2026-03-25',
    'The Christian Science Monitor',
    'Is Russia set to oust Telegram and WhatsApp from its internet?',
    'https://www.csmonitor.com/World/Europe/2026/0325/russia-max-telegram-whatsapp-internet-disruption',
    'EN',
    'i',
    'quote',
    'Анализ устойчивости мессенджеров и приватных каналов связи при ужесточении регуляторных блокировок.'
  ),
  r(
    '2026-03-13',
    'eurotopics',
    'Mobile Internet switched off in Moscow',
    'https://www.eurotopics.net/en/354527/mobile-internet-switched-off-in-moscow',
    'EN',
    'i',
    'quote',
    'Европейский обзор прессы цитирует его текст об отключениях мобильного интернета в Москве и принудительном переходе на Max.',
    { note: 'Оригинал, вероятно, колонка от 12.03.2026 («В лето — без интернета»); сверить.' }
  ),

  // 2025
  r(
    '2025-10-21',
    'Новая газета',
    'Операция ИИ',
    'https://novayagazeta.ru/articles/2025/10/21/operatsiia-ii',
    'RU',
    'a',
    'column',
    'Колонка о новом этапе столкновения идеологии запретов и современных технологий.',
    { program: 'Виртуальный Меркуров' }
  ),
  r(
    '2025-09-29',
    'Новая газета',
    'Вечный зов',
    'https://novayagazeta.ru/articles/2025/09/29/vechnyi-zov',
    'RU',
    'a',
    'column',
    'Виртуальный Меркуров — колонка об искусственном интеллекте и сетевой реальности.'
  ),
  r(
    '2025-07-07',
    'Новая газета',
    'Зачем властям создавать еще один мессенджер?',
    'https://novayagazeta.ru/articles/2025/07/07/zachem-vlastiam-sozdavat-eshche-odin-messendzher',
    'RU',
    'i',
    'video',
    'Видеоразбор с Антоном Орехом и Сергеем Соколовым: Telegram, мессенджер-клон и отключения интернета в регионах.',
    { program: 'Виртуальный Меркуров' }
  ),
  r(
    '2025-04-10',
    'Новая газета',
    'Знаете, что такое киберпанк? Так вот он — начинается',
    'https://novayagazeta.ru/articles/2025/04/10/znaete-chto-takoe-kiberpank-tak-vot-on-nachinaetsia',
    'RU',
    'i',
    'column',
    'Авторская колонка в цикле «Виртуальный Меркуров» о наступлении эры цифрового контроля и ИИ.',
    { program: 'Виртуальный Меркуров' }
  ),

  // 2024
  r(
    '2024-07-19',
    'Новая газета',
    'Легло в библейском масштабе',
    'https://novayagazeta.ru/articles/2024/07/19/leglo-v-bibleiskom-masshtabe',
    'RU',
    'a',
    'column',
    'Колонка о массовом сбое Windows и о том, кому он выгоден.'
  ),
  r(
    '2024-01-31',
    'Радио Свобода',
    'Помощник? Конкурент? Убийца?',
    'https://www.svoboda.org/a/pomoschnik-konkurent-ubiytsa-efir-v-18-05-/32796986.html',
    'RU',
    'a',
    'interview',
    'Разговор с Сергеем Медведевым и Михаилом Гуревичем об искусственном интеллекте. Антон Меркуров обсуждает личность художника, генеративное искусство, арт-рынок и роль ИИ как помощника.',
    {
      note: 'На странице есть полная текстовая расшифровка; Меркуров представлен как художник и арт-дилер.',
    }
  ),

  // 2023
  r(
    '2023-01-12',
    'The Art Newspaper Russia',
    'Барельефы Сергея Меркурова остались на «Динамо»',
    'https://www.theartnewspaper.ru/posts/20230112-vrlc/',
    'RU',
    'c',
    'quote',
    'Итог одиннадцатилетней истории с барельефами Сергея Меркурова: подлинники, распавшиеся при демонтаже более чем на 7 000 фрагментов, отреставрированы и размещены в арт-пространстве ВТБ Арены. Антон Меркуров доволен реставрацией, но не схемой демонтажа.',
    { note: 'Прямой комментарий правнука скульптора о завершении проекта.' }
  ),

  // 2022
  r(
    '2022-01-01',
    'Новая газета',
    'Антон Меркуров — авторская страница',
    'https://novayagazeta.ru/authors/401536',
    'RU',
    'c',
    'profile',
    'Авторский архив из 48 колонки в Новой газете.'
  ),

  // 2021
  r(
    '2021-04-04',
    'Радио Свобода',
    'Замедление Рунета',
    'https://www.svoboda.org/a/31167840.html',
    'RU',
    'i',
    'interview',
    'Интервью Сергею Медведеву о замедлении Twitter, суверенном интернете, DPI и VPN. Второй гость — Михаил Гуревич.',
    { program: 'Археология. Будущее' }
  ),
  r(
    '2021-03-19',
    'The Art Newspaper',
    'Pussy Riot’s weekly NFT drop and digital modes of selling',
    'https://www.theartnewspaper.com/2021/03/19/pussy-riots-weekly-nft-drop-is-just-one-instance-of-russian-and-ukrainian-artists-embracing-new-modes-of-online-selling',
    'EN',
    'c',
    'mention',
    'Московский интернет-стратег и арт-дилер прокомментировал цифровые аукционы и новые формы продаж.'
  ),
  r(
    '2021-03-15',
    'Current Time',
    'Russia’s Campaign Against Twitter Faces Mixed Chances of Success',
    'https://www.currenttime.tv/a/russia-s-campaign-against-twitter-faces-mixed-chances-of-success-it-experts-say/31160273.html',
    'EN',
    'i',
    'quote',
    'Оценка технических ограничений и замедления работы зарубежных соцсетей.'
  ),
  r(
    '2021-03-11',
    'Rzeczpospolita',
    'Zajadła wojna Rosji z internetem. To próba generalna',
    'https://www.rp.pl/swiat/art232761-zajadla-wojna-rosji-z-internetem-to-proba-generalna',
    'PL',
    'i',
    'quote',
    'Комментарий о замедлении Twitter: вместе с ним «упали» сайты Кремля, правительства и СК.',
    { note: 'Автор Andrzej Łomanowski. Paywall, открыт только анонс. По-польски: Anton Mierkurow.' }
  ),

  // 2019
  r(
    '2019-08-15',
    'Deutsche Welle (Bosnian)',
    'Rusija i Google',
    'https://www.dw.com/bs/rusija-i-google/a-50023551',
    'BS',
    'i',
    'mention',
    'Разбор конфликтов поисковых гигантов и IT-корпораций с регуляторами.',
    { note: 'Боснийская служба DW; в исходных данных стояло DE.' }
  ),
  r(
    '2019-04-29',
    'Караван Ярмарка (Тверь)',
    'Интернет-эксперт Антон Меркуров в Твери прокомментировал закон о суверенном Рунете',
    'https://karavantver.ru/gazeta-16783/',
    'RU',
    'i',
    'interview',
    'Интервью после лекции для подростков в проекте «Большое будущее»: закон о суверенном Рунете и его цена.',
    { note: 'Дата номера 29.04.2019; лекция 23.04.2019, «Живое слово».' }
  ),

  // 2018
  r(
    '2018-08-28',
    'BBC News Русская служба',
    'В России появится система слежения за криптовалютами',
    'https://www.bbc.com/russian/news-45324695',
    'RU',
    'f',
    'quote',
    'Комментарий о системе отслеживания криптовалютных операций Росфинмониторинга и риске обратного эффекта: усиление контроля может стимулировать появление менее прозрачных инструментов.',
    {
      note: 'Автор — Андрей Сошников. Меркуров представлен как интернет-эксперт и главный редактор Satoshi.fm.',
    }
  ),
  r(
    '2018-08-27',
    'iHodl',
    'Revolut: A Rapid Rise of a Financial Unicorn',
    'https://ihodl.com/opinion/2018-08-27/revolut-rapid-rise-financial-unicorn/',
    'EN',
    'f',
    'column',
    'Авторская колонка о взлете необанков и трансформации финансовых институтов.'
  ),
  r(
    '2018-07-01',
    'Сноб',
    'Грузия будет дуть',
    'https://snob.ru/news/155330/',
    'RU',
    'c',
    'column',
    'Авторский материал и размышления о культурных трендах.'
  ),
  r(
    '2018-04-19',
    'The Washington Post',
    'The Russian government just managed to hack itself',
    'https://www.washingtonpost.com/news/democracy-post/wp/2018/04/19/the-russian-government-just-managed-to-hack-self/',
    'EN',
    'i',
    'quote',
    'Комментарий о веерных блокировках IP-адресов во время попыток ограничения Telegram.'
  ),
  r(
    '2018-04-17',
    'Euronews',
    'Catch me if you can: Russia internet chaos as Telegram ban backfires',
    'https://www.euronews.com/2018/04/17/catch-me-if-you-can-russia-internet-chaos-as-telegram-ban-backfires',
    'EN',
    'i',
    'mention',
    'Разбор хаоса в сетевой инфраструктуре и безуспешных попыток блокировок.'
  ),
  r(
    '2018-04-15',
    'Coda Story',
    'Why did Russia just attack its own internet?',
    'https://www.codastory.com/disinformation/why-did-russia-just-attack-its-own-internet/',
    'EN',
    'i',
    'mention',
    'Аналитика системных сбоев инфраструктуры при регуляторном вмешательстве.'
  ),
  r(
    '2018-02-17',
    'The New York Times',
    'Russian Trolls Were Sloppy, but Indictment Still Points at Kremlin',
    'https://www.nytimes.com/2018/02/17/world/europe/russia-indictment-trolls-putin.html',
    'EN',
    'i',
    'quote',
    'Комментарий для NYT в качестве эксперта по сетевым коммуникациям.'
  ),
  r(
    '2018-01-29',
    'Огонёк',
    'Неча на сети пенять',
    'https://www.kommersant.ru/doc/3527213',
    'RU',
    'i',
    'quote',
    'Комментарии о попытках связать школьное насилие с интернетом, технических ограничениях контроля переписки и росте интереса к контенту вследствие запретов.',
    { note: 'Материал «Огонька» на сайте «Коммерсанта».' }
  ),

  // 2017
  r(
    '2017-11-15',
    'Теплица социальных технологий',
    'Антон Меркуров: Как российский фонд «Подари жизнь» начал принимать пожертвования в криптовалюте',
    'https://te-st.org/2017/11/15/interviw-with-anton-merkurov-bitcoin/',
    'RU',
    'f',
    'interview',
    'Интервью о том, как возник проект криптопожертвований для «Подари жизнь»: консультации фонда, выбор юридической схемы через Podari.Life и Coinbase.',
    { note: 'Интервью Натальи Барановой.' }
  ),
  r(
    '2017-11-13',
    'Подари жизнь',
    'Помощь без границ',
    'https://podari-zhizn.ru/ru/publications/30272',
    'RU',
    'f',
    'quote',
    'Материал о запуске приёма криптопожертвований через американский партнёрский фонд Podari.Life. Антон Меркуров объясняет возможности криптофандрайзинга.'
  ),
  r(
    '2017-07-09',
    'Ведомости',
    '«Антон доказал, что один человек способен кардинально изменить картину современных медиа»',
    'https://www.vedomosti.ru/technology/articles/2017/07/09/716820-est-za-chto-skazat-emu-spasibo',
    'RU',
    'i',
    'quote',
    'Памятная цитата об Антоне Носике в материале о его роли в истории рунета и современных медиа.'
  ),
  r(
    '2017-07-01',
    'DIE ZEIT',
    'Telegram: Kritiker des Gesetzes fürchten Missbrauch',
    'https://www.zeit.de/politik/2017-07/telegram-messenger-russland-sperrung/seite-2',
    'DE',
    'i',
    'quote',
    'Экспертная оценка рисков цифровой цензуры для немецкого издания.'
  ),
  r(
    '2017-06-27',
    'Current Time',
    'Почему блокировка Telegram ничего не изменит — отвечают эксперты',
    'https://www.currenttime.tv/a/28580862.html',
    'RU',
    'i',
    'quote',
    'Комментарий о том, что заблокировать Telegram на практике не получится, на фоне требований Роскомнадзора к Дурову.'
  ),
  r(
    '2017-06-22',
    'The Moscow Times',
    'Russia’s Big Brother Is Trying to Watch You',
    'https://www.themoscowtimes.com/2017/06/22/russias-big-brother-is-trying-to-watch-you-but-is-annoyed-you-wont-let-him-a58248',
    'EN',
    'i',
    'mention',
    'Аналитический разбор законопроектов об ограничении анонимности.'
  ),
  r(
    '2017-05-16',
    'The Moscow Times',
    'The City of Moscow Has Its Own Propaganda Empire',
    'https://www.themoscowtimes.com/2017/05/16/the-city-of-moscow-has-its-own-propaganda-empire-a58005',
    'EN',
    'i',
    'quote',
    'Комментарий о городской астротурфинг-машине Москвы и логике пропаганды «для начальства».'
  ),
  r(
    '2017-05-10',
    'Deutschlandfunk',
    'Internetzensur in Russland: Enger Spielraum für Blogger',
    'https://www.deutschlandfunk.de/internetzensur-in-russland-enger-spielraum-fuer-blogger-und-100.html',
    'DE',
    'i',
    'quote',
    'Оценка сужения свободы слова и практик судейской цензуры.'
  ),
  r(
    '2017-05-05',
    'Deutschlandfunk Kultur',
    'Russisches Internet: Nicht alles unter Kontrolle',
    'https://www.deutschlandfunkkultur.de/russisches-internet-102.html',
    'DE',
    'i',
    'quote',
    'Комментарий о децентрализованной природе глобальной сети.'
  ),
  r(
    '2017-04-28',
    'СТК РГГУ',
    'К ЧЕМУ ИДУТ МЕДИА? Встреча с Антоном Меркуровым',
    'https://www.youtube.com/watch?v=rdGwjIUivZk',
    'RU',
    'c',
    'video',
    'Видеоинтервью о будущем редакционных медиа, роли дистрибуции, профессиональном образовании и сочетании технического и гуманитарного мышления.',
    { program: 'К чему идут медиа?' }
  ),
  r(
    '2017-04-16',
    'Эхо Москвы',
    'Какие сервисы следующими попадут под запрет?',
    'https://echo.msk.ru/programs/tochka/1963350-echo/',
    'RU',
    'i',
    'radio',
    'Эфир об очередной волне блокировок. Гости: Игорь Королёв (CNews), Юрий Синодов (Roem.ru).',
    { program: 'Точка' }
  ),
  r(
    '2017-03-26',
    'ABC News',
    'Thousands march through Moscow for internet freedom',
    'https://abcnews.go.com/International/thousands-march-moscow-internet-freedom-russia-cracks-election/story?id=46693748',
    'EN',
    'i',
    'quote',
    'Комментарии о публичных акциях за цифровую свободу.'
  ),
  r(
    '2017-02-12',
    'Regional Post',
    'Anton Merkurov: Regional Post Interview',
    'https://regionalpost.org/en/articles/anton-merkurov.html',
    'EN',
    'c',
    'interview',
    'Интервью об урбанистике, технологиях и развитии современной городской среды.'
  ),

  // 2016
  r(
    '2016-07-06',
    'OSCE',
    '13th South Caucasus Media Conference - Presentation by Anton Merkurov',
    'https://www.osce.org/fom/252301',
    'EN',
    'i',
    'mention',
    'Презентация в Тбилиси в качестве вице-президента Ассоциации интернет-издателей.'
  ),

  // 2015
  r(
    '2015-11-10',
    'Эхо Москвы',
    'О том, почему блокировка RuTracker не имеет для вас никакого значения',
    'https://echo.msk.ru/blog/yopolisnews/1655746-echo/',
    'RU',
    'i',
    'blog',
    'Авторский текст о бессмысленности блокировки торрент-трекера и о том, что такое VPN. Оригинал опубликован на «Йоде».',
    { program: 'Блоги' }
  ),
  r(
    '2015-10-14',
    'Russia Beyond (DE)',
    'Die Gefahr der Instant Messenger',
    'https://de.rbth.com/meinung/2015/10/14/die-gefahr-der-instant-mesenger_482887',
    'DE',
    'i',
    'column',
    'Авторская колонка о мессенджерах, спецслужбах и государственном регулировании. Подпись: интернет-эксперт, спикер Open Garden (FireChat).',
    { note: 'Републикация из «Российской газеты».' }
  ),
  r(
    '2015-09-22',
    'РБК',
    'Skype не ответил',
    'https://www.rbc.ru/newspaper/2015/09/22/56bc9b0d9a7947299f72bb1c',
    'RU',
    'a',
    'quote',
    'Комментарий о глобальном сбое Skype: серверная уязвимость централизованных мессенджеров, возможный отток аудитории и распределённая архитектура FireChat.',
    { note: 'Представлен как представитель Open Garden в России.' }
  ),
  r(
    '2015-09-16',
    'Ведомости',
    'Google проиграл суд о поисковых роботах',
    'https://www.vedomosti.ru/newspaper/articles/2015/09/16/609041-google-otvetit-za-robotov',
    'RU',
    'i',
    'quote',
    'Комментарий о контекстном поиске, автоматической обработке переписки, профилировании пользователей и вероятной реакции Google на судебное решение.',
    { note: 'Представлен как вице-президент Ассоциации интернет-издателей.' }
  ),
  r(
    '2015-08-27',
    'Bankier.pl',
    'W Rosji tworzą Ripedię — konkurencję dla Wikipedii',
    'https://www.bankier.pl/wiadomosc/W-Rosji-tworza-Ripedie-konkurecje-dla-Wikipedii-3399377.html',
    'PL',
    'i',
    'quote',
    'Комментарий о «Рипедии», российском аналоге Википедии: независимый эксперт сомневается, что проект станет конкурентом.',
    { note: 'IAR, автор Włodzimierz Pac.' }
  ),
  r(
    '2015-05-26',
    'Ведомости',
    'Технологии 5G отчасти можно протестировать уже сегодня',
    'https://www.vedomosti.ru/technology/articles/2015/05/26/593573-tehnologii-5g-otchasti-mozhno-protestirovat-uzhe-segodnya',
    'RU',
    'a',
    'quote',
    'Развёрнутый комментарий о FireChat и mesh-сетях: прямая связь между устройствами, работа без сотовой инфраструктуры, приватность и перспективы технологии.',
    { note: 'Представлен как представитель Open Garden.' }
  ),
  r(
    '2015-05-26',
    'Коммерсантъ',
    'В погоне за кадром',
    'https://www.kommersant.ru/doc/2729047',
    'RU',
    'a',
    'quote',
    'Комментарии о подготовке специалистов для высокотехнологичной промышленности, кибербезопасности, открытой публикации научных работ и отъезде российских ИТ-кадров.',
    { note: 'Представлен как эксперт Institute for State Ideologies.' }
  ),

  // 2014
  r(
    '2014-09-09',
    'Ведомости',
    'Смартфоны дали второе рождение сервисам знакомств',
    'https://www.vedomosti.ru/technology/articles/2014/09/09/dohodnye-znakomstva',
    'RU',
    'c',
    'quote',
    'Комментарий о миграции сервисов знакомств в мобильные приложения, геймификации и новых моделях общения.',
    { note: 'Эксперт по интернету и медиа компании INSTID.' }
  ),
  r(
    '2014-08-10',
    'Радио Свобода',
    'Интернет под надзором',
    'https://www.svoboda.org/a/25476945.html',
    'RU',
    'i',
    'interview',
    'Интервью о регулировании и контроле персональных данных в сети.'
  ),
  r(
    '2014-06-16',
    'The Moscow Times',
    'Controversial Lenin Death Mask for Sale in U.S.',
    'https://www.themoscowtimes.com/2014/06/16/controversial-lenin-death-mask-for-sale-in-us-a36443',
    'EN',
    'c',
    'quote',
    'Как правнук скульптора Сергея Меркурова требует отменить аукцион маски Ленина в США.'
  ),

  // 2013
  r(
    '2013-11-20',
    'Радио Свобода',
    'Не думайте о ее национальности',
    'https://www.svoboda.org/a/25173585.html',
    'RU',
    'c',
    'mention',
    'Обсуждение социокультурных вопросов и публичных дискуссий.'
  ),
  r(
    '2013-09-01',
    'Russian Life',
    'The Death Artist',
    'https://www.russianlife.com/magazine/sep-oct-2013/the-death-artist/',
    'EN',
    'c',
    'mention',
    'Историко-культурный материал о наследии скульптора С. Д. Меркурова.'
  ),

  // 2012
  r(
    '2012-11-13',
    'Коммерсантъ',
    '«Луркоморье» вернулось в сеть',
    'https://www.kommersant.ru/doc/2066032',
    'RU',
    'i',
    'quote',
    'Материал об исключении «Луркоморье» из реестра запрещённых ресурсов; содержит комментарий Антона Меркурова из эфира «Коммерсантъ FM» о неэффективности блокировок.'
  ),
  r(
    '2012-11-09',
    'Republic (Слон.ру)',
    'Антон Меркуров — авторская страница',
    'https://slon.ru/authors/29191/',
    'RU',
    'c',
    'column',
    'Авторские колонки и материалы на Republic.'
  ),
  r(
    '2012-05-01',
    'BBC News',
    'LiveJournal: Russia’s unlikely internet giant',
    'https://www.bbc.com/news/magazine-17177053',
    'EN',
    'i',
    'quote',
    'Экспертный разбор феномена блогосферы LiveJournal.'
  ),
  r(
    '2012-03-01',
    'BBC News Русская служба',
    'Борьба за барельефы Меркурова на стадионе «Динамо»',
    'https://www.bbc.com/russian/sport/2012/03/120109_dynamo_stadium_reconstruction',
    'RU',
    'c',
    'quote',
    'Как правнук скульптора Сергея Меркурова Антон Меркуров добивается прозрачности реставрации шести барельефов на стадионе «Динамо» и возвращения подлинников.'
  ),

  // 2011
  r(
    '2011-03-01',
    'Forbes.ru',
    'Антон Меркуров — профиль автора',
    'https://www.forbes.ru/person/52577-merkurov-anton',
    'RU',
    'a',
    'profile',
    'Авторская страница и экспертный профиль на Forbes.ru.'
  ),

  // 2010
  r(
    '2010-04-12',
    'Коммерсантъ-Деньги',
    'Эксперимент российского масштаба. Переход на лица',
    'https://www.kommersant.ru/doc/1353039',
    'RU',
    'a',
    'quote',
    'Развёрнутые комментарии о продвижении бизнеса и СМИ в Facebook: коммуникация с клиентами, трафик и выбор социальных платформ.',
    { note: 'Совладелец агентства Socialight.' }
  ),
  r(
    '2010-03-08',
    'Коммерсантъ-Деньги',
    'Эксперимент российского масштаба. Показательный замер',
    'https://www.kommersant.ru/doc/1327572',
    'RU',
    'a',
    'quote',
    'Комментарии об измеримости маркетинга в социальных медиа, постановке бизнес-целей и распространении отзывов.'
  ),
  r(
    '2010-02-25',
    'Chaskor',
    'Самая глупая покупка',
    'https://detector.media/withoutsection/article/51326/',
    'RU',
    'i',
    'column',
    'Колонка о тенденциях и технологиях интернет-среды.'
  ),
];

// ── Сборка ───────────────────────────────────────────────────────────────
const RU_CHARS = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя';
const LAT_CHARS = [
  'a',
  'b',
  'v',
  'g',
  'd',
  'e',
  'e',
  'zh',
  'z',
  'i',
  'y',
  'k',
  'l',
  'm',
  'n',
  'o',
  'p',
  'r',
  's',
  't',
  'u',
  'f',
  'kh',
  'ts',
  'ch',
  'sh',
  'sch',
  '',
  'y',
  '',
  'e',
  'yu',
  'ya',
];
const slugify = (s: string) =>
  s
    .toLowerCase()
    .split('')
    .map((c) => {
      const i = RU_CHARS.indexOf(c);
      return i >= 0 ? LAT_CHARS[i] : c;
    })
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function build(drafts: Draft[]): MediaRecord[] {
  const seen = new Map<string, number>();
  return drafts
    .map((d) => {
      const base = `${d.date}-${slugify(d.outlet)}-${slugify(d.title).split('-').slice(0, 5).join('-')}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      return { ...d, slug: n > 1 ? `${base}-${n}` : base };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export const records: MediaRecord[] = build([...items, ...columns]);

// Страницы автора. Показываются отдельной строкой, в таймлайн и статистику не входят.
export const archives = [
  { outlet: 'Новая газета', url: 'https://novayagazeta.ru/authors/401536' },
  { outlet: 'Эхо', url: 'https://echofm.online/author/anton-merkurov' },
];

// Найдено, но дата или ссылка не подтверждены. НЕ выводить на сайт, пока не проверены.
export const pending: { outlet: string; title: string; url: string; why: string }[] = [
  {
    outlet: 'Коммерсантъ',
    title: 'Telegram пошел в наступление',
    url: 'https://www.kommersant.ru/doc/4663868',
    why: 'Цитата про импорт чатов из WhatsApp; дата не открыта',
  },
  {
    outlet: 'Коммерсантъ FM',
    title:
      'Из-за того, что блокируют эти сайты, у молодежи возникает только дополнительный интерес',
    url: 'https://www.kommersant.ru/doc/2066118',
    why: 'Эфир про «Луркоморье»; дата не открыта',
  },
  {
    outlet: 'Радио Свобода',
    title: 'Суверенный российский интернет: бояться или смеяться?',
    url: 'https://www.svoboda.org/a/29772298.html',
    why: 'Гость эфира с Исавниным; дата не открыта',
  },
  {
    outlet: 'Радио Свобода',
    title: '«Чебурнет», пытки и политзаключенные',
    url: 'https://www.svoboda.org/a/30258454.html',
    why: 'Интервью; дата не открыта',
  },
  {
    outlet: 'Эхо Москвы',
    title:
      'Действия Роскомнадзора по блокировке и разблокировке IP-адресов Telegram не влияют на его работоспособность',
    url: 'https://echo.msk.ru/news/2201788-echo.html',
    why: 'Эфирная цитата, вероятно апрель 2018; дата не открыта',
  },
  {
    outlet: 'Эхо Москвы',
    title: 'В телеграм-каналах есть стоп-листы',
    url: 'https://echo.msk.ru/news/2323599-echo.html',
    why: 'Цитата по расследованию «Проекта»; дата не открыта',
  },
  {
    outlet: 'Эхо Москвы',
    title: 'Интернет-эксперт Меркуров: «Никакого рубильника…»',
    url: 'https://echo.msk.ru/news/2159740-echo.html',
    why: 'Ссылка вернула 404',
  },
  {
    outlet: 'Infox.ru',
    title: 'Эксперт объяснил, почему вместо замедления Twitter отключились правительственные сайты',
    url: 'https://www.infox.ru/news/283/252776-ekspert-obasnil-pocemu-vmesto-zamedlenia-twitter-otklucilis-pravitelstvennye-sajty',
    why: 'Сюжет март 2021; точная дата не открыта',
  },
  {
    outlet: '360.ru',
    title: 'Telegram может заблокировать авторов крупных каналов без объяснений',
    url: 'https://360.ru/tekst/obschestvo/telegram-mozhet-zablokirovat/',
    why: 'Дата не открыта',
  },
  {
    outlet: 'Medium',
    title: 'Russia Is Cutting Off the World',
    url: 'https://merkurov.medium.com/russia-is-cutting-off-the-world-7b9e42be7031',
    why: 'Свой текст; дата не открыта',
  },
  {
    outlet: 'Medium',
    title: 'The Internet Is Closing: Next Stop, Iran',
    url: 'https://merkurov.medium.com/the-internet-is-closing-next-stop-iran-7a55084fd82a',
    why: 'Свой текст; дата не открыта',
  },
  {
    outlet: 'Medium',
    title: 'Truth Inside the Matryoshka',
    url: 'https://merkurov.medium.com/truth-inside-the-matryoshka-how-russias-propaganda-network-floods-the-internet-8d176fd7801f',
    why: 'Свой текст; дата не открыта',
  },
  {
    outlet: 'Medium',
    title: 'Russia Can’t Catch Up with AI',
    url: 'https://merkurov.medium.com/russia-cant-catch-up-with-ai-539b458951e4',
    why: 'Свой текст; дата не открыта',
  },
];
