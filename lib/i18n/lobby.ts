import type { Language } from './config';

export type LobbyLanguage = Extract<Language, 'en' | 'ru' | 'de'>;

export type LobbyCopy = {
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
    cta: string;
  };
  proof: {
    yearsValue: string;
    yearsLabel: string;
    heritageValue: string;
    heritageLabel: string;
    publicistValue: string;
    publicistLabel: string;
    artValue: string;
    artLabel: string;
  };
  track: {
    ariaLabel: string;
    title: string;
    body: string;
    lecturesLabel: string;
    lecturesValue: string;
    expertLabel: string;
    expertValue: string;
    timeline: { period: string; title: string; body: string; current?: boolean }[];
  };
  press: {
    eyebrow: string;
    title: string;
    body: string;
    archiveCta: string;
    quotes: { outlet: string; quote: string; label: string }[];
    archiveNote: string;
    browseCta: string;
  };
  roots: {
    granite: { eyebrow: string; body: string; name: string; cta: string };
    ether: { eyebrow: string; body: string; name: string; cta: string };
  };
  unframed: {
    ariaLabel: string;
    eyebrow: string;
    title: string;
    body: string;
    cta: string;
  };
};

export const LOBBY_COPY: Record<LobbyLanguage, LobbyCopy> = {
  en: {
    meta: {
      title: 'Private Office & Access | Anton Merkurov',
      description:
        'The private office of Anton Merkurov: heritage architecture, art-market counsel and access to selected cultural projects.',
      structuredName: 'Private Office & Access — Anton Merkurov',
      breadcrumbs: { home: 'Home', section: 'Private Office' },
    },
    hero: {
      line1: 'I architect',
      line2: 'context.',
      subtitle:
        'Two decades at the intersection of media, decentralized protocols, fine art, and monumental family heritage.',
      cta: 'Enter The Office',
    },
    proof: {
      yearsValue: '20+ Years',
      yearsLabel: 'Media & Communications',
      heritageValue: 'Heritage',
      heritageLabel: 'S. Merkurov Museum & Archives',
      publicistValue: 'Publicist',
      publicistLabel: 'Novaya Gazeta & Forbes',
      artValue: 'Art Dealer',
      artLabel: 'Private Collections & Curation',
    },
    track: {
      ariaLabel: 'Explore research and analysis',
      title: 'Structural shifts before they manifest.',
      body: 'Media analysis, decentralized communication protocols, cultural archives, and private art advisory for institutional and international clients.',
      lecturesLabel: 'Lectures & Talks:',
      lecturesValue: 'Moscow State University, OSCE, Goethe Institute, Polytechnic.',
      expertLabel: 'Expert Status:',
      expertValue: 'State Duma Information Committee, Federation Council Commission.',
      timeline: [
        {
          period: '2006 — 2018 / Public & Media',
          title: 'Social Network Integration & Splinternet Forecasts',
          body: 'RBC media integration, Vice-President of Online Publishers Association, advising on decentralized messaging protocols (Open Garden / FireChat).',
        },
        {
          period: '2018 — 2022 / Protocols & Cinema',
          title: 'Digital Emigration & Cultural Production',
          body: 'Media producer for Pelevin’s Empire V, communications lead for Clostra / NewNode p2p protocol, tokenization of Lenin’s death mask archive.',
        },
        {
          period: '2026 / Present',
          title: 'Cultural Infrastructure & Private Advisory',
          body: 'Management of Sergey Merkurov House-Museum archive in Gyumri, private art dealing, regular dispatches, and publishing UNFRAMED.',
          current: true,
        },
      ],
    },
    press: {
      eyebrow: 'International Press & Commentary',
      title: 'A public record, across disciplines.',
      body: 'Published commentary on internet freedom, state control, and the preservation of cultural heritage.',
      archiveCta: 'Explore the media archive',
      quotes: [
        {
          outlet: 'The Washington Post',
          quote:
            '“The result will be millions of digital émigrés, people who will simply turn their backs on the state... acutely aware that it is willing to ignore their interests.”',
          label: 'Digital society / Network policy',
        },
        {
          outlet: 'Le Monde',
          quote:
            '“The legal framework is ready, and the FSB will be able to enforce it. Its agencies are trying every possible means. But they won’t succeed. Because in practice, it’s impossible.”',
          label: 'Internet freedom / State control',
        },
        {
          outlet: 'The Art Newspaper Russia',
          quote:
            '“I have long been involved in preserving and studying Sergey Merkurov’s legacy, and I have never before encountered such careful, even reverent, treatment of my great-grandfather’s work. There is hope that this outstanding monument of Soviet sculpture will be preserved in proper condition.”',
          label: 'Sculpture / Restoration / Family legacy',
        },
      ],
      archiveNote:
        'Interviews, expert commentary, author columns, and documented appearances are collected in the chronological archive.',
      browseCta: 'Browse all publications',
    },
    roots: {
      granite: {
        eyebrow: 'Granite (Heritage & Physical)',
        body: 'My great-grandfather carved the Soviet monumental era in granite. Heavy. Immovable. Permanent.',
        name: 'Sergey Merkurov (1881–1952)',
        cta: 'Heritage Archive',
      },
      ether: {
        eyebrow: 'Ether (Signal, Art & Media)',
        body: 'I operate across decentralized protocols, fine art curation, public commentary, and the Heart & Angel project.',
        name: 'Anton Merkurov',
        cta: 'Heart & Angel',
      },
    },
    unframed: {
      ariaLabel: 'Discover UNFRAMED, a memoir by Anton Merkurov',
      eyebrow: 'A Memoir by Anton Merkurov',
      title: 'UNFRAMED',
      body: 'The story of closing the loop. Returning to the only thing that matters: the line.',
      cta: 'Explore the book',
    },
  },
  ru: {
    meta: {
      title: 'Частный офис и доступ | Антон Меркуров',
      description:
        'Частный офис Антона Меркурова: архитектура наследия, консультации по арт-рынку и доступ к избранным культурным проектам.',
      structuredName: 'Частный офис и доступ — Антон Меркуров',
      breadcrumbs: { home: 'Главная', section: 'Частный офис' },
    },
    hero: {
      line1: 'Я создаю',
      line2: 'контекст.',
      subtitle:
        'Два десятилетия на пересечении медиа, децентрализованных протоколов, изящного искусства и монументального семейного наследия.',
      cta: 'Войти в офис',
    },
    proof: {
      yearsValue: '20+ лет',
      yearsLabel: 'Медиа и коммуникации',
      heritageValue: 'Наследие',
      heritageLabel: 'Музей С. Меркурова и архивы',
      publicistValue: 'Публицист',
      publicistLabel: 'Новая газета и Forbes',
      artValue: 'Арт-дилер',
      artLabel: 'Частные коллекции и кураторство',
    },
    track: {
      ariaLabel: 'Исследования и аналитика',
      title: 'Структурные сдвиги — до того, как они проявятся.',
      body: 'Медиаанализ, протоколы децентрализованных коммуникаций, культурные архивы и частное арт-консультирование для институциональных и международных клиентов.',
      lecturesLabel: 'Лекции и выступления:',
      lecturesValue: 'МГУ, ОБСЕ, Институт Гёте, Политех.',
      expertLabel: 'Экспертный статус:',
      expertValue: 'Комитет Госдумы по информационной политике, комиссия Совета Федерации.',
      timeline: [
        {
          period: '2006 — 2018 / Публичная сфера и медиа',
          title: 'Интеграция соцсетей и прогнозы сплинтернета',
          body: 'Интеграция медиа РБК, вице-президент Ассоциации онлайн-издателей, консультирование по децентрализованным протоколам связи (Open Garden / FireChat).',
        },
        {
          period: '2018 — 2022 / Протоколы и кино',
          title: 'Цифровая эмиграция и культурное производство',
          body: 'Медиапродюсер фильма «Empire V» по Пелевину, руководитель коммуникаций p2p-протокола Clostra / NewNode, токенизация архива посмертной маски Ленина.',
        },
        {
          period: '2026 / Настоящее',
          title: 'Культурная инфраструктура и частное консультирование',
          body: 'Управление архивом Дома-музея Сергея Меркурова в Гюмри, частный арт-дилинг, регулярные публикации и издание UNFRAMED.',
          current: true,
        },
      ],
    },
    press: {
      eyebrow: 'Международная пресса и комментарии',
      title: 'Публичная летопись — поверх дисциплин.',
      body: 'Опубликованные комментарии о свободе интернета, государственном контроле и сохранении культурного наследия.',
      archiveCta: 'Открыть медиаархив',
      quotes: [
        {
          outlet: 'The Washington Post',
          quote:
            '«В результате появятся миллионы цифровых эмигрантов — людей, которые просто отвернутся от государства... остро осознавая, что оно готово игнорировать их интересы.»',
          label: 'Цифровое общество / Сетевая политика',
        },
        {
          outlet: 'Le Monde',
          quote:
            '«Правовая база готова, и ФСБ сможет применять её. Его ведомства пробуют все возможные средства. Но у них ничего не выйдет. Потому что на практике это невозможно.»',
          label: 'Свобода интернета / Государственный контроль',
        },
        {
          outlet: 'The Art Newspaper Russia',
          quote:
            '«Я давно занимаюсь сохранением и изучением наследия Сергея Меркурова и никогда прежде не встречал такого бережного, почти благоговейного отношения к работе моего прадеда. Есть надежда, что этот выдающийся памятник советской скульптуры будет сохранён в надлежащем состоянии.»',
          label: 'Скульптура / Реставрация / Семейное наследие',
        },
      ],
      archiveNote:
        'Интервью, экспертные комментарии, авторские колонки и документально подтверждённые выступления собраны в хронологическом архиве.',
      browseCta: 'Смотреть все публикации',
    },
    roots: {
      granite: {
        eyebrow: 'Гранит (наследие и материя)',
        body: 'Мой прадед высекал советскую монументальную эпоху в граните. Тяжёлом. Неподвижном. Вечном.',
        name: 'Сергей Меркуров (1881–1952)',
        cta: 'Архив наследия',
      },
      ether: {
        eyebrow: 'Эфир (сигнал, искусство и медиа)',
        body: 'Я работаю с децентрализованными протоколами, кураторством изящного искусства, публичными комментариями и проектом Heart & Angel.',
        name: 'Антон Меркуров',
        cta: 'Heart & Angel',
      },
    },
    unframed: {
      ariaLabel: 'Открыть UNFRAMED — мемуары Антона Меркурова',
      eyebrow: 'Мемуары Антона Меркурова',
      title: 'UNFRAMED',
      body: 'История о том, как замкнуть круг. Возвращение к единственному, что имеет значение: линии.',
      cta: 'Открыть книгу',
    },
  },
  de: {
    meta: {
      title: 'Privates Büro & Zugang | Anton Merkurov',
      description:
        'Das private Büro von Anton Merkurov: Heritage-Architektur, Beratung zum Kunstmarkt und Zugang zu ausgewählten Kulturprojekten.',
      structuredName: 'Privates Büro & Zugang — Anton Merkurov',
      breadcrumbs: { home: 'Startseite', section: 'Privates Büro' },
    },
    hero: {
      line1: 'Ich entwerfe',
      line2: 'Kontext.',
      subtitle:
        'Zwei Jahrzehnte an der Schnittstelle von Medien, dezentralen Protokollen, bildender Kunst und monumentalem familiärem Erbe.',
      cta: 'Das Büro betreten',
    },
    proof: {
      yearsValue: '20+ Jahre',
      yearsLabel: 'Medien & Kommunikation',
      heritageValue: 'Heritage',
      heritageLabel: 'S.-Merkurov-Museum & Archive',
      publicistValue: 'Publizist',
      publicistLabel: 'Novaya Gazeta & Forbes',
      artValue: 'Kunsthändler',
      artLabel: 'Privatsammlungen & Kuratierung',
    },
    track: {
      ariaLabel: 'Forschung und Analyse entdecken',
      title: 'Strukturelle Verschiebungen, bevor sie sichtbar werden.',
      body: 'Medienanalyse, dezentrale Kommunikationsprotokolle, Kulturarchive und private Kunstberatung für institutionelle und internationale Klienten.',
      lecturesLabel: 'Vorträge & Gespräche:',
      lecturesValue:
        'Lomonossow-Universität Moskau, OSZE, Goethe-Institut, Polytechnisches Museum.',
      expertLabel: 'Expertenstatus:',
      expertValue: 'Informationsausschuss der Staatsduma, Kommission des Föderationsrats.',
      timeline: [
        {
          period: '2006 — 2018 / Öffentlichkeit & Medien',
          title: 'Social-Network-Integration & Splinternet-Prognosen',
          body: 'RBC-Medienintegration, Vizepräsident der Vereinigung der Online-Verleger, Beratung zu dezentralen Messaging-Protokollen (Open Garden / FireChat).',
        },
        {
          period: '2018 — 2022 / Protokolle & Kino',
          title: 'Digitale Emigration & kulturelle Produktion',
          body: 'Medienproduzent für Pelewins Empire V, Kommunikationsleitung für das Clostra-/NewNode-P2P-Protokoll, Tokenisierung des Archivs von Lenins Totenmaske.',
        },
        {
          period: '2026 / Gegenwart',
          title: 'Kulturelle Infrastruktur & private Beratung',
          body: 'Betreuung des Archivs des Sergey-Merkurov-Hausmuseums in Gjumri, privater Kunsthandel, regelmäßige Publikationen und die Veröffentlichung von UNFRAMED.',
          current: true,
        },
      ],
    },
    press: {
      eyebrow: 'Internationale Presse & Kommentar',
      title: 'Eine öffentliche Chronik über Disziplinen hinweg.',
      body: 'Veröffentlichte Kommentare zu Internetfreiheit, staatlicher Kontrolle und der Bewahrung des kulturellen Erbes.',
      archiveCta: 'Das Medienarchiv öffnen',
      quotes: [
        {
          outlet: 'The Washington Post',
          quote:
            '„Das Ergebnis werden Millionen digitaler Emigranten sein – Menschen, die dem Staat einfach den Rücken kehren... und sich sehr bewusst sind, dass er bereit ist, ihre Interessen zu ignorieren.“',
          label: 'Digitale Gesellschaft / Netzpolitik',
        },
        {
          outlet: 'Le Monde',
          quote:
            '„Der rechtliche Rahmen steht, und der FSB wird ihn durchsetzen können. Seine Behörden versuchen jedes Mittel. Aber sie werden keinen Erfolg haben. Denn in der Praxis ist es unmöglich.“',
          label: 'Internetfreiheit / Staatliche Kontrolle',
        },
        {
          outlet: 'The Art Newspaper Russia',
          quote:
            '„Ich beschäftige mich seit Langem mit der Bewahrung und Erforschung von Sergey Merkurovs Erbe, und ich habe noch nie eine so sorgfältige, ja ehrfürchtige Behandlung der Arbeit meines Urgroßvaters erlebt. Es besteht Hoffnung, dass dieses herausragende Denkmal der sowjetischen Bildhauerei in angemessenem Zustand erhalten bleibt.“',
          label: 'Skulptur / Restaurierung / Familienerbe',
        },
      ],
      archiveNote:
        'Interviews, Expertenkommentare, Autorenkolumnen und dokumentierte Auftritte sind im chronologischen Archiv gesammelt.',
      browseCta: 'Alle Veröffentlichungen ansehen',
    },
    roots: {
      granite: {
        eyebrow: 'Granit (Erbe & Materie)',
        body: 'Mein Urgroßvater meißelte die sowjetische Monumentalepoche in Granit. Schwer. Unbeweglich. Dauerhaft.',
        name: 'Sergey Merkurov (1881–1952)',
        cta: 'Heritage-Archiv',
      },
      ether: {
        eyebrow: 'Äther (Signal, Kunst & Medien)',
        body: 'Ich arbeite mit dezentralen Protokollen, Kuratierung bildender Kunst, öffentlichem Kommentar und dem Projekt Heart & Angel.',
        name: 'Anton Merkurov',
        cta: 'Heart & Angel',
      },
    },
    unframed: {
      ariaLabel: 'UNFRAMED entdecken – Memoiren von Anton Merkurov',
      eyebrow: 'Memoiren von Anton Merkurov',
      title: 'UNFRAMED',
      body: 'Die Geschichte eines geschlossenen Kreises. Die Rückkehr zu dem Einzigen, das zählt: der Linie.',
      cta: 'Das Buch entdecken',
    },
  },
};
