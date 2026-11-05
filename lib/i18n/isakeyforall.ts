import type { Language } from './config';

export type IsakeyforallLanguage = Extract<Language, 'en' | 'ru' | 'de'>;

export type IsakeyforallCopy = {
  meta: {
    title: string;
    description: string;
    structuredName: string;
    breadcrumbs: { home: string; section: string };
  };
  hero: {
    line1: string;
    line2: string;
    subtitle: string;
  };
  narrative: {
    origin: string;
    career: string;
    heritage: string;
  };
  quote: string;
  heart: {
    origin: string;
    mission: string;
    values: { title: string; body: string }[];
  };
  secondQuote: string;
  closing: string;
  featured: {
    label: string;
    memoirBadge: string;
    memoirTitle: string;
    memoirSubtitle: string;
    researchBadge: string;
    researchTitle: string;
    researchSubtitle: string;
  };
};

export const ISAKEYFORALL_COPY: Record<IsakeyforallLanguage, IsakeyforallCopy> = {
  en: {
    meta: {
      title: 'Love Is a Key for All — About Anton Merkurov',
      description:
        'Anton Merkurov: artist, digital architect and art dealer. The great-grandson of sculptor Sergey Merkurov, working between legacy and the future.',
      structuredName: 'Love Is a Key for All — Anton Merkurov',
      breadcrumbs: { home: 'Home', section: 'About' },
    },
    hero: {
      line1: 'Love is a',
      line2: 'key for all.',
      subtitle: 'Artist. Digital Architect. Humanist.',
    },
    narrative: {
      origin:
        'Anton Merkurov is a media expert, publicist, artist, and art dealer. As the great-grandson of the monumental sculptor Sergey Merkurov, he grew up in Moscow during the late Soviet era and the 1990s, later dividing his life between London and Moscow.',
      career:
        'While immersed in the artistic community from childhood, Merkurov initially chose a path in technology and new media. Over two decades, he established himself as one of the most prominent digital consultants and internet experts in Russia — co-founding early IT companies in the late 90s, working as a photographer through the transition from film to digital, advising corporations, lecturing at universities, and advocating for policy change.',
      heritage:
        'Alongside his career in communications, Merkurov has continuously engaged with his family’s profound cultural heritage — developing the Sergey Merkurov Museum in Gyumri, Armenia, publishing family letters and memoirs, and organizing exhibitions featuring archival works, including an NFT drop of the historic mask of Lenin sculpted by his great-grandfather.',
    },
    quote:
      '“Love is life and the key to everything. Love is necessary. And love is the one thing there is never enough of.”',
    heart: {
      origin:
        'In 2015, at the age of 33, this philosophy crystallized into his ongoing multidisciplinary art project, Heart & Angel, beginning with simple hearts drawn in a naive art technique. Over the years, Merkurov has refined this vision into a distinct artistic statement spanning physical paintings, digital art, and dynamic web components.',
      mission:
        'I want to multiply love as a social profit to provide tangible benefits around the world.',
      values: [
        {
          title: 'Everything starts with a symbol.',
          body: 'A heart is the universal symbol of love that everyone understands, transcending social burdens and uniting us across borders.',
        },
        {
          title: 'Every piece is unique',
          body: '— by type, size, medium, or material — bridging both offline and online worlds.',
        },
      ],
    },
    secondQuote:
      '“I have spent more than 20 years in media, running new media and promoting new technology. But why do you need this if you don’t have love?”',
    closing:
      'Today, while continuing to work with decentralized communications, Merkurov has fully embraced the opportunity to create as an artist — telling the world that love and humanity are the most important things in existence.',
    featured: {
      label: 'Featured Work',
      memoirBadge: 'Memoir',
      memoirTitle: 'UNFRAMED — Memoir by Anton Merkurov',
      memoirSubtitle:
        'A nonlinear recollection of art, exile, and the small violences of modern life.',
      researchBadge: 'Research',
      researchTitle: 'The Digital Decay: A Chronicle of Voluntary Submission.',
      researchSubtitle: 'Long-form research, essays and archival notes by Anton Merkurov.',
    },
  },
  ru: {
    meta: {
      title: 'Любовь — ключ для всех — об Антоне Меркурове',
      description:
        'Антон Меркуров: художник, цифровой архитектор и арт-дилер. Правнук скульптора Сергея Меркурова, работающий между наследием и будущим.',
      structuredName: 'Любовь — ключ для всех — Антон Меркуров',
      breadcrumbs: { home: 'Главная', section: 'Обо мне' },
    },
    hero: {
      line1: 'Любовь —',
      line2: 'ключ для всех.',
      subtitle: 'Художник. Цифровой архитектор. Гуманист.',
    },
    narrative: {
      origin:
        'Антон Меркуров — медиаэксперт, публицист, художник и арт-дилер. Правнук монументального скульптора Сергея Меркурова, он вырос в Москве в позднесоветскую эпоху и в 1990-е, а позже делил жизнь между Лондоном и Москвой.',
      career:
        'С детства находясь в художественной среде, Меркуров поначалу выбрал путь в технологиях и новых медиа. За два десятилетия он стал одним из самых заметных цифровых консультантов и интернет-экспертов в России: соучредил первые IT-компании в конце 1990-х, работал фотографом в период перехода от плёнки к цифре, консультировал корпорации, читал лекции в университетах и выступал за изменения в регулировании.',
      heritage:
        'Наряду с карьерой в коммуникациях Меркуров постоянно работал с глубоким культурным наследием семьи: развивал Музей Сергея Меркурова в Гюмри (Армения), публиковал семейные письма и мемуары, организовывал выставки с архивными работами, включая NFT-дроп исторической маски Ленина, созданной его прадедом.',
    },
    quote:
      '«Любовь — это жизнь и ключ ко всему. Любовь необходима. И любовь — единственное, чего никогда не бывает слишком много.»',
    heart: {
      origin:
        'В 2015 году, в возрасте 33 лет, эта философия оформилась в его продолжающийся междисциплинарный художественный проект Heart & Angel, начавшийся с простых сердец, нарисованных в наивной манере. Со временем Меркуров превратил это видение в самостоятельное художественное высказывание, охватывающее живопись, цифровое искусство и динамичные веб-компоненты.',
      mission:
        'Я хочу приумножать любовь как общественное благо, чтобы приносить ощутимую пользу людям по всему миру.',
      values: [
        {
          title: 'Всё начинается с символа.',
          body: 'Сердце — универсальный символ любви, понятный каждому, преодолевающий социальные барьеры и объединяющий нас поверх границ.',
        },
        {
          title: 'Каждая работа уникальна',
          body: '— по типу, размеру, технике или материалу — соединяя офлайн- и онлайн-миры.',
        },
      ],
    },
    secondQuote:
      '«Я более 20 лет работаю в медиа, развиваю новые медиа и продвигаю новые технологии. Но зачем всё это, если в этом нет любви?»',
    closing:
      'Сегодня, продолжая работать с децентрализованными коммуникациями, Меркуров полностью принял возможность творить как художник — говоря миру, что любовь и человечность — самое важное в существовании.',
    featured: {
      label: 'Избранные работы',
      memoirBadge: 'Мемуары',
      memoirTitle: 'UNFRAMED — мемуары Антона Меркурова',
      memoirSubtitle:
        'Нелинейное воспоминание об искусстве, изгнании и мелких насилиях современной жизни.',
      researchBadge: 'Исследование',
      researchTitle: 'Цифровое увядание: хроника добровольного подчинения.',
      researchSubtitle: 'Долгие исследования, эссе и архивные заметки Антона Меркурова.',
    },
  },
  de: {
    meta: {
      title: 'Liebe ist ein Schlüssel für alle — Über Anton Merkurov',
      description:
        'Anton Merkurov: Künstler, digitaler Architekt und Kunsthändler. Urenkel des Bildhauers Sergey Merkurov, zwischen Erbe und Zukunft.',
      structuredName: 'Liebe ist ein Schlüssel für alle — Anton Merkurov',
      breadcrumbs: { home: 'Startseite', section: 'Über' },
    },
    hero: {
      line1: 'Liebe ist ein',
      line2: 'Schlüssel für alle.',
      subtitle: 'Künstler. Digitaler Architekt. Humanist.',
    },
    narrative: {
      origin:
        'Anton Merkurov ist Medienexperte, Publizist, Künstler und Kunsthändler. Als Urenkel des monumentalen Bildhauers Sergey Merkurov wuchs er in Moskau in der späten Sowjetzeit und den 1990er-Jahren auf und lebte später zwischen London und Moskau.',
      career:
        'Schon als Kind in die Kunstszene eingebunden, wählte Merkurov zunächst einen Weg in Technologie und neue Medien. Über zwei Jahrzehnte etablierte er sich als einer der profiliertesten Digitalberater und Internetexperten Russlands: Er gründete Ende der 1990er-Jahre erste IT-Unternehmen mit, arbeitete als Fotograf im Übergang von Film zu Digital, beriet Unternehmen, lehrte an Universitäten und setzte sich für regulatorische Veränderungen ein.',
      heritage:
        'Neben seiner Laufbahn in der Kommunikation beschäftigte sich Merkurov kontinuierlich mit dem kulturellen Erbe seiner Familie: Er entwickelte das Sergey-Merkurov-Museum in Gjumri, Armenien, veröffentlichte Familienbriefe und Memoiren und organisierte Ausstellungen mit Archivarbeiten, darunter ein NFT-Drop der historischen Lenin-Maske, die sein Urgroßvater geschaffen hatte.',
    },
    quote:
      '„Liebe ist Leben und der Schlüssel zu allem. Liebe ist notwendig. Und Liebe ist das Einzige, von dem es nie genug gibt.“',
    heart: {
      origin:
        '2015, im Alter von 33 Jahren, kristallisierte sich diese Haltung in seinem fortlaufenden interdisziplinären Kunstprojekt Heart & Angel heraus, das mit einfachen, in naiver Technik gezeichneten Herzen begann. Über die Jahre hat Merkurov diese Vision zu einer eigenständigen künstlerischen Aussage verdichtet, die Malerei, digitale Kunst und dynamische Webkomponenten umfasst.',
      mission:
        'Ich möchte Liebe als gesellschaftlichen Mehrwert vervielfachen, um weltweit konkreten Nutzen zu schaffen.',
      values: [
        {
          title: 'Alles beginnt mit einem Symbol.',
          body: 'Das Herz ist das universelle Symbol der Liebe, das jeder versteht, soziale Lasten überwindet und uns über Grenzen hinweg verbindet.',
        },
        {
          title: 'Jedes Werk ist einzigartig',
          body: '— nach Typ, Größe, Medium oder Material — und verbindet die analoge und die digitale Welt.',
        },
      ],
    },
    secondQuote:
      '„Ich bin seit mehr als 20 Jahren in den Medien tätig, führe neue Medien und fördere neue Technologie. Aber wozu braucht man das alles, wenn man keine Liebe hat?“',
    closing:
      'Heute, während er weiter mit dezentralen Kommunikationsformen arbeitet, hat Merkurov die Möglichkeit zu schaffen als Künstler voll angenommen – und sagt der Welt, dass Liebe und Menschlichkeit das Wichtigste sind, was es gibt.',
    featured: {
      label: 'Ausgewählte Arbeiten',
      memoirBadge: 'Memoiren',
      memoirTitle: 'UNFRAMED — Memoiren von Anton Merkurov',
      memoirSubtitle:
        'Eine nichtlineare Erinnerung an Kunst, Exil und die kleinen Gewalten des modernen Lebens.',
      researchBadge: 'Forschung',
      researchTitle: 'The Digital Decay: Eine Chronik der freiwilligen Unterwerfung.',
      researchSubtitle: 'Langform-Forschung, Essays und Archivanmerkungen von Anton Merkurov.',
    },
  },
};
