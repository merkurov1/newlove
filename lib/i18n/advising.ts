import type { Language } from './config';

export type AdvisingLanguage = Extract<Language, 'en' | 'ru' | 'de' | 'fr' | 'ar'>;

export type AdvisingCopy = {
  meta: {
    title: string;
    description: string;
    structuredName: string;
    serviceType: string[];
    breadcrumbs: { home: string; section: string };
  };
  hero: {
    title: string;
    subtitle: string;
    imageAlt: string;
  };
  manifesto: {
    lead: string;
    body: string;
  };
  capability: {
    title: string;
    subtitle: string;
    pillars: { number: string; title: string; body: string }[];
  };
  environments: {
    title: string;
    items: { title: string; body: string }[];
  };
  principles: {
    title: string;
    items: { number: string; title: string; body: string }[];
  };
  formats: {
    title: string;
    items: { kicker: string; title: string; body: string }[];
  };
  footer: {
    title: string;
    body: string;
    cta: string;
  };
};

export const ADVISING_COPY: Record<AdvisingLanguage, AdvisingCopy> = {
  en: {
    meta: {
      title: 'Advising & High-Stakes Counsel | Anton Merkurov',
      description:
        'Direct peer-to-peer counsel for founders, collectors and institutions at the intersection of technology, culture and capital.',
      structuredName: 'Anton Merkurov — Advising & High-Stakes Counsel',
      serviceType: [
        'Digital strategy',
        'Art market advisory',
        'Heritage and archive strategy',
        'Cultural communications',
      ],
      breadcrumbs: { home: 'Home', section: 'Advising' },
    },
    hero: {
      title: 'At the Intersection of Technology, Culture, and Capital.',
      subtitle:
        'Direct peer-to-peer counsel for high-stakes environments. No slide decks, no institutional bias, zero corporate fluff.',
      imageAlt: 'Anton Merkurov',
    },
    manifesto: {
      lead: "Most experts live in silos: corporate lawyers don't grasp fine art, gallery directors fear AI regulation, and venture funds drown in hype.",
      body: 'I operate at the convergence. I bring a helicopter view to complex, unconventional challenges where law, emerging tech, media, and cultural capital collide.',
    },
    capability: {
      title: 'Cross-Domain Capability',
      subtitle: 'Anticipating structural shifts before they reach boardroom consensus.',
      pillars: [
        {
          number: '01',
          title: 'Horizon Navigation',
          body: 'Tech waves come and go — from early crypto to AI policy. I focus on the structural aftermath: how emerging tech breaks current frameworks, alters media, and reshapes institutional rules.',
        },
        {
          number: '02',
          title: 'Cultural Capital',
          body: 'Navigating the unwritten mechanics of the art market, historical heritage, and institutional valuation. Independent perspective on acquiring, preserving, and structuring cultural assets.',
        },
        {
          number: '03',
          title: 'High-Stakes Board',
          body: 'Serving as a confidential sounding board for decision-makers. Validating high-risk hypotheses, finding blind spots, and delivering unfiltered clarity in sensitive environments.',
        },
      ],
    },
    environments: {
      title: 'Designed for High-Consequence Environments',
      items: [
        {
          title: 'UHNW & Family Offices',
          body: 'Confidential advisory on non-standard assets, legacy structuring, and navigating rapid cultural shifts.',
        },
        {
          title: 'Think Tanks & Labs',
          body: 'Strategic perspective on the legal, ethical, and societal consequences of emerging technologies.',
        },
        {
          title: 'Cultural Foundations',
          body: 'Advisory at the crossroads of classical heritage preservation, digital archives, and auction mechanics.',
        },
      ],
    },
    principles: {
      title: 'Operating Principles',
      items: [
        {
          number: '01',
          title: 'Unfiltered Reality',
          body: 'You pay for what is actually happening, not for comforting slides. If an initiative is flawed or dead on arrival, I state it immediately with zero corporate politeness.',
        },
        {
          number: '02',
          title: 'Peer-to-Peer Alignment',
          body: 'Complete cultural fluency with principal-level environments. Direct dialogue on equal footing — free of subservience, posturing, or sanitized consultant speech.',
        },
        {
          number: '03',
          title: 'Uncompromising Personal Trust & Discretion',
          body: 'High-stakes counsel relies on absolute personal integrity. The kind of trust where assets, sensitive context, and non-public strategy can be left in my hands without a second thought.',
        },
      ],
    },
    formats: {
      title: 'Engagement Formats',
      items: [
        {
          kicker: 'Retainer',
          title: 'Board & Advisory',
          body: 'Ongoing strategic presence, horizon scanning, and periodic sanity-checks for funds, labs, and private offices.',
        },
        {
          kicker: 'Targeted',
          title: 'Special Projects',
          body: 'Direct steering of cross-disciplinary initiatives involving law, art infrastructure, media, and tech.',
        },
        {
          kicker: 'Confidential',
          title: 'Private Strategy Sessions',
          body: 'Confidential deep-dives for principals facing unique, high-consequence decisions.',
        },
      ],
    },
    footer: {
      title: 'Direct & Confidential.',
      body: "If you are facing a problem that doesn't fit standard consulting boxes, let's talk.",
      cta: 'Start a Conversation',
    },
  },
  ru: {
    meta: {
      title: 'Консультирование и решения с высокой ставкой | Антон Меркуров',
      description:
        'Прямое сопровождение основателей, коллекционеров и институций на пересечении технологий, культуры и капитала.',
      structuredName: 'Антон Меркуров — консультирование и решения с высокой ставкой',
      serviceType: [
        'Цифровая стратегия',
        'Консультирование по арт-рынку',
        'Стратегия наследия и архивов',
        'Культурные коммуникации',
      ],
      breadcrumbs: { home: 'Главная', section: 'Консультирование' },
    },
    hero: {
      title: 'На пересечении технологий, культуры и капитала.',
      subtitle:
        'Прямое сопровождение один на один для решений с высокой ценой ошибки. Без презентаций, институциональных пристрастий и корпоративной шелухи.',
      imageAlt: 'Антон Меркуров',
    },
    manifesto: {
      lead: 'Большинство экспертов работают в изолированных нишах: корпоративные юристы не разбираются в изящном искусстве, галерейные директора опасаются регулирования ИИ, а венчурные фонды тонут в хайпе.',
      body: 'Я работаю на стыке этих миров. Даю широкий обзор сложных, нестандартных задач, где сталкиваются право, новые технологии, медиа и культурный капитал.',
    },
    capability: {
      title: 'Кросс-дисциплинарная экспертиза',
      subtitle:
        'Способность видеть структурные сдвиги раньше, чем они становятся консенсусом в советах директоров.',
      pillars: [
        {
          number: '01',
          title: 'Навигация по горизонту',
          body: 'Технологические волны приходят и уходят — от раннего крипто до политики ИИ. Я сосредоточен на структурных последствиях: как новые технологии ломают действующие рамки, меняют медиа и перестраивают институциональные правила.',
        },
        {
          number: '02',
          title: 'Культурный капитал',
          body: 'Понимание неформальных механизмов арт-рынка, исторического наследия и институциональной оценки. Независимый взгляд на приобретение, сохранение и структурирование культурных активов.',
        },
        {
          number: '03',
          title: 'Совет для решений с высокой ставкой',
          body: 'Роль конфиденциального собеседника для тех, кто принимает решения. Проверка рискованных гипотез, поиск слепых зон и честная ясность в чувствительных ситуациях.',
        },
      ],
    },
    environments: {
      title: 'Для сред с высокой ценой ошибки',
      items: [
        {
          title: 'UHNW и семейные офисы',
          body: 'Конфиденциальные консультации по нестандартным активам, структурированию наследия и ориентации в быстрых культурных сдвигах.',
        },
        {
          title: 'Аналитические центры и лаборатории',
          body: 'Стратегический взгляд на правовые, этические и общественные последствия новых технологий.',
        },
        {
          title: 'Культурные фонды',
          body: 'Консультирование на пересечении сохранения классического наследия, цифровых архивов и аукционных механизмов.',
        },
      ],
    },
    principles: {
      title: 'Принципы работы',
      items: [
        {
          number: '01',
          title: 'Неприкрашенная реальность',
          body: 'Вы платите за понимание того, что происходит на самом деле, а не за успокаивающие слайды. Если инициатива ошибочна или мертва на старте, я говорю об этом сразу, без корпоративной вежливости.',
        },
        {
          number: '02',
          title: 'Равенство позиций',
          body: 'Полное культурное понимание среды людей, принимающих решения. Прямой диалог на равных — без угодливости, позёрства и обезличенного консультантского языка.',
        },
        {
          number: '03',
          title: 'Бескомпромиссное личное доверие и конфиденциальность',
          body: 'Консультирование в ситуациях высокой ставки держится на абсолютной личной порядочности. На доверии, при котором активы, чувствительный контекст и непубличная стратегия могут оставаться в моих руках без второго вопроса.',
        },
      ],
    },
    formats: {
      title: 'Форматы сотрудничества',
      items: [
        {
          kicker: 'Абонемент',
          title: 'Совет и сопровождение',
          body: 'Постоянное стратегическое присутствие, сканирование горизонтов и регулярные проверки для фондов, лабораторий и частных офисов.',
        },
        {
          kicker: 'Точечно',
          title: 'Специальные проекты',
          body: 'Прямое управление междисциплинарными инициативами на стыке права, арт-инфраструктуры, медиа и технологий.',
        },
        {
          kicker: 'Конфиденциально',
          title: 'Частные стратегические сессии',
          body: 'Конфиденциальные глубокие разборы для принципалов, принимающих уникальные решения с высокой ценой ошибки.',
        },
      ],
    },
    footer: {
      title: 'Прямо и конфиденциально.',
      body: 'Если задача не помещается в стандартные консалтинговые рамки — давайте поговорим.',
      cta: 'Начать разговор',
    },
  },
  de: {
    meta: {
      title: 'Beratung & Entscheidungen mit hohem Einsatz | Anton Merkurov',
      description:
        'Direkte Beratung für Gründer, Sammler und Institutionen an der Schnittstelle von Technologie, Kultur und Kapital.',
      structuredName: 'Anton Merkurov — Beratung & Entscheidungen mit hohem Einsatz',
      serviceType: [
        'Digitale Strategie',
        'Beratung zum Kunstmarkt',
        'Heritage- und Archivstrategie',
        'Kulturelle Kommunikation',
      ],
      breadcrumbs: { home: 'Startseite', section: 'Beratung' },
    },
    hero: {
      title: 'An der Schnittstelle von Technologie, Kultur und Kapital.',
      subtitle:
        'Direkte Beratung auf Augenhöhe für Entscheidungen mit hohem Einsatz. Keine Slide-Decks, keine institutionellen Vorurteile, kein Corporate-Sprech.',
      imageAlt: 'Anton Merkurov',
    },
    manifesto: {
      lead: 'Die meisten Experten arbeiten in Silos: Wirtschaftsanwälte verstehen die feine Kunst nicht, Galeriedirektoren fürchten die KI-Regulierung, und Wagniskapitalfonds verlieren sich im Hype.',
      body: 'Ich arbeite an der Schnittstelle. Ich bringe den Überblick in komplexe, unkonventionelle Herausforderungen, in denen Recht, aufkommende Technologien, Medien und kulturelles Kapital aufeinandertreffen.',
    },
    capability: {
      title: 'Disziplinenübergreifende Kompetenz',
      subtitle: 'Strukturelle Verschiebungen erkennen, bevor sie im Vorstand Konsens werden.',
      pillars: [
        {
          number: '01',
          title: 'Horizont-Navigation',
          body: 'Technologiewellen kommen und gehen – vom frühen Krypto bis zur KI-Politik. Mein Fokus liegt auf den strukturellen Folgen: wie neue Technologien bestehende Rahmen sprengen, Medien verändern und institutionelle Regeln neu formen.',
        },
        {
          number: '02',
          title: 'Kulturelles Kapital',
          body: 'Sicherer Umgang mit den ungeschriebenen Mechanismen des Kunstmarkts, des historischen Erbes und der institutionellen Bewertung. Eine unabhängige Perspektive auf Erwerb, Erhalt und Strukturierung kultureller Vermögenswerte.',
        },
        {
          number: '03',
          title: 'Beirat für Entscheidungen mit hohem Einsatz',
          body: 'Als vertraulicher Sparringspartner für Entscheider. Prüfung riskanter Annahmen, Aufdecken blinder Flecken und ungefilterte Klarheit in sensiblen Umfeldern.',
        },
      ],
    },
    environments: {
      title: 'Für Umfelder mit hohen Konsequenzen',
      items: [
        {
          title: 'UHNW & Family Offices',
          body: 'Vertrauliche Beratung zu ungewöhnlichen Vermögenswerten, Nachlassstrukturierung und der Orientierung in schnellen kulturellen Veränderungen.',
        },
        {
          title: 'Think Tanks & Labs',
          body: 'Strategische Perspektive auf die rechtlichen, ethischen und gesellschaftlichen Folgen neuer Technologien.',
        },
        {
          title: 'Kulturelle Stiftungen',
          body: 'Beratung an der Schnittstelle von klassischer Denkmalpflege, digitalen Archiven und Auktionsmechanismen.',
        },
      ],
    },
    principles: {
      title: 'Arbeitsprinzipien',
      items: [
        {
          number: '01',
          title: 'Ungefilterte Wirklichkeit',
          body: 'Sie zahlen für das, was tatsächlich geschieht, nicht für beruhigende Folien. Wenn ein Vorhaben fehlerhaft oder von Anfang an zum Scheitern verurteilt ist, sage ich es sofort – ohne Corporate-Höflichkeit.',
        },
        {
          number: '02',
          title: 'Augenhöhe',
          body: 'Volles kulturelles Verständnis für Umfelder auf Entscheiderebene. Direkter Dialog auf Augenhöhe – ohne Unterwürfigkeit, Gehabe oder weichgespülte Beratersprache.',
        },
        {
          number: '03',
          title: 'Kompromissloses persönliches Vertrauen und Diskretion',
          body: 'Beratung mit hohem Einsatz beruht auf absoluter persönlicher Integrität. Auf ein Vertrauen, bei dem Vermögenswerte, sensibler Kontext und nichtöffentliche Strategie ohne Zögern in meinen Händen bleiben können.',
        },
      ],
    },
    formats: {
      title: 'Formate der Zusammenarbeit',
      items: [
        {
          kicker: 'Dauerbegleitung',
          title: 'Beirat & Beratung',
          body: 'Laufende strategische Begleitung, Horizon-Scanning und regelmäßige Plausibilitätsprüfungen für Fonds, Labs und private Büros.',
        },
        {
          kicker: 'Gezielt',
          title: 'Sonderprojekte',
          body: 'Direkte Steuerung interdisziplinärer Vorhaben an der Schnittstelle von Recht, Kunstinfrastruktur, Medien und Technologie.',
        },
        {
          kicker: 'Vertraulich',
          title: 'Private Strategiesitzungen',
          body: 'Vertrauliche Deep Dives für Prinzipale, die vor einzigartigen Entscheidungen mit hohen Folgen stehen.',
        },
      ],
    },
    footer: {
      title: 'Direkt und vertraulich.',
      body: 'Wenn ein Problem nicht in die üblichen Beratungsschubladen passt, sprechen wir darüber.',
      cta: 'Gespräch beginnen',
    },
  },
  fr: {
    meta: {
      title: 'Conseil & décisions à forts enjeux | Anton Merkurov',
      description:
        'Un conseil direct pour fondateurs, collectionneurs et institutions à l’intersection de la technologie, de la culture et du capital.',
      structuredName: 'Anton Merkurov — conseil et décisions à forts enjeux',
      serviceType: [
        'Stratégie numérique',
        'Conseil sur le marché de l’art',
        'Stratégie patrimoniale et archivistique',
        'Communication culturelle',
      ],
      breadcrumbs: { home: 'Accueil', section: 'Conseil' },
    },
    hero: {
      title: 'À l’intersection de la technologie, de la culture et du capital.',
      subtitle:
        'Un conseil direct, entre pairs, pour les environnements à forts enjeux. Sans slides, sans parti pris institutionnel, sans jargon d’entreprise.',
      imageAlt: 'Anton Merkurov',
    },
    manifesto: {
      lead: 'La plupart des experts travaillent en silo : les avocats d’entreprise ne comprennent pas l’art, les directeurs de galerie redoutent la régulation de l’IA, et les fonds de capital-risque se noient dans le battage.',
      body: 'J’opère à leur point de convergence. J’apporte une vue d’ensemble à des défis complexes et non conventionnels, là où le droit, les technologies émergentes, les médias et le capital culturel se rencontrent.',
    },
    capability: {
      title: 'Une compétence transdisciplinaire',
      subtitle:
        'Anticiper les mutations structurelles avant qu’elles ne fassent consensus au conseil d’administration.',
      pillars: [
        {
          number: '01',
          title: 'Navigation à l’horizon',
          body: 'Les vagues technologiques vont et viennent — des débuts de la crypto à la politique de l’IA. Je m’intéresse aux conséquences structurelles : comment les technologies émergentes brisent les cadres existants, transforment les médias et redessinent les règles institutionnelles.',
        },
        {
          number: '02',
          title: 'Capital culturel',
          body: 'Comprendre les mécanismes informels du marché de l’art, du patrimoine historique et de l’évaluation institutionnelle. Un regard indépendant sur l’acquisition, la préservation et la structuration des actifs culturels.',
        },
        {
          number: '03',
          title: 'Conseil pour décisions à forts enjeux',
          body: 'Un rôle de confident pour les décideurs. Valider les hypothèses à haut risque, repérer les angles morts et apporter une clarté sans filtre dans des environnements sensibles.',
        },
      ],
    },
    environments: {
      title: 'Conçu pour les environnements à fortes conséquences',
      items: [
        {
          title: 'UHNW et family offices',
          body: 'Conseil confidentiel sur des actifs non standard, la structuration patrimoniale et l’anticipation des mutations culturelles rapides.',
        },
        {
          title: 'Think tanks et laboratoires',
          body: 'Regard stratégique sur les conséquences juridiques, éthiques et sociétales des technologies émergentes.',
        },
        {
          title: 'Fondations culturelles',
          body: 'Conseil à la croisée de la préservation du patrimoine classique, des archives numériques et des mécanismes d’enchères.',
        },
      ],
    },
    principles: {
      title: 'Principes de travail',
      items: [
        {
          number: '01',
          title: 'Réalité sans filtre',
          body: 'Vous payez pour ce qui se passe réellement, pas pour des slides rassurantes. Si une initiative est boiteuse ou vouée à l’échec, je le dis immédiatement, sans politesse d’entreprise.',
        },
        {
          number: '02',
          title: 'Alignement entre pairs',
          body: 'Une parfaite aisance culturelle dans les environnements de direction. Un dialogue direct d’égal à égal, sans servilité, sans posture et sans langue de bois.',
        },
        {
          number: '03',
          title: 'Confiance personnelle et discrétion absolues',
          body: 'Un conseil à forts enjeux repose sur une intégrité personnelle absolue. Ce degré de confiance où des actifs, un contexte sensible et une stratégie non publique peuvent rester entre mes mains sans hésitation.',
        },
      ],
    },
    formats: {
      title: 'Formats de collaboration',
      items: [
        {
          kicker: 'Récurrent',
          title: 'Conseil & accompagnement',
          body: 'Présence stratégique continue, veille prospective et points de contrôle réguliers pour fonds, laboratoires et bureaux privés.',
        },
        {
          kicker: 'Ciblé',
          title: 'Projets spéciaux',
          body: 'Pilotage direct d’initiatives transdisciplinaires mêlant droit, infrastructures artistiques, médias et technologie.',
        },
        {
          kicker: 'Confidentiel',
          title: 'Sessions stratégiques privées',
          body: 'Analyses approfondies et confidentielles pour des dirigeants confrontés à des décisions uniques à fortes conséquences.',
        },
      ],
    },
    footer: {
      title: 'Direct et confidentiel.',
      body: 'Si votre problème ne rentre dans aucune case du conseil classique, parlons-en.',
      cta: 'Engager la conversation',
    },
  },
  ar: {
    meta: {
      title: 'الاستشارات والقرارات عالية المخاطر | أنطون ميركوروف',
      description:
        'استشارة مباشرة وندّية للمؤسسين وجامعي الأعمال الفنية والمؤسسات الثقافية عند تقاطع التكنولوجيا والثقافة ورأس المال.',
      structuredName: 'أنطون ميركوروف — الاستشارات والقرارات عالية المخاطر',
      serviceType: [
        'الاستراتيجية الرقمية',
        'استشارات سوق الفن',
        'استراتيجية التراث والأرشيف',
        'الاتصال الثقافي',
      ],
      breadcrumbs: { home: 'الرئيسية', section: 'الاستشارات' },
    },
    hero: {
      title: 'عند تقاطع التكنولوجيا والثقافة ورأس المال.',
      subtitle:
        'استشارة مباشرة وندّية للبيئات عالية المخاطر. بلا عروض تقديمية، وبلا انحياز مؤسسي، وبلا خطاب مؤسسي أجوف.',
      imageAlt: 'أنطون ميركوروف',
    },
    manifesto: {
      lead: 'يعمل معظم الخبراء في جزر منفصلة: محامو الشركات لا يفهمون الفنون الجميلة، ومديرو صالات العرض يخشون تنظيم الذكاء الاصطناعي، وصناديق الاستثمار الجريء تغرق في الضجيج.',
      body: 'أعمل عند نقطة الالتقاء. أقدّم نظرة شاملة للتحديات المعقّدة وغير التقليدية حيث يتصادم القانون والتقنيات الناشئة والإعلام ورأس المال الثقافي.',
    },
    capability: {
      title: 'قدرة عابرة للتخصصات',
      subtitle: 'استشراف التحولات الهيكلية قبل أن تتحول إلى توافق في مجالس الإدارة.',
      pillars: [
        {
          number: '01',
          title: 'الملاحة الاستباقية',
          body: 'موجات التقنية تأتي وتذهب، من بدايات العملات المشفرة إلى سياسات الذكاء الاصطناعي. أركز على التبعات الهيكلية: كيف تكسر التقنيات الناشئة الأطر القائمة، وتغيّر الإعلام، وتعيد تشكيل القواعد المؤسسية.',
        },
        {
          number: '02',
          title: 'رأس المال الثقافي',
          body: 'فهم الآليات غير المكتوبة لسوق الفن والتراث التاريخي والتقييم المؤسسي. منظور مستقل في اقتناء الأصول الثقافية وحفظها وهيكلتها.',
        },
        {
          number: '03',
          title: 'مجلس للقرارات عالية المخاطر',
          body: 'دور المستشار السري لصنّاع القرار. اختبار الفرضيات عالية المخاطر، وكشف النقاط العمياء، وتقديم وضوح بلا تجميل في البيئات الحساسة.',
        },
      ],
    },
    environments: {
      title: 'مصمّم للبيئات عالية العواقب',
      items: [
        {
          title: 'كبار الثروات والمكاتب العائلية',
          body: 'استشارة سرية بشأن الأصول غير التقليدية، وهيكلة الإرث، والتعامل مع التحولات الثقافية السريعة.',
        },
        {
          title: 'مراكز الفكر والمختبرات',
          body: 'منظور استراتيجي في العواقب القانونية والأخلاقية والمجتمعية للتقنيات الناشئة.',
        },
        {
          title: 'المؤسسات الثقافية',
          body: 'استشارة عند تقاطع حفظ التراث الكلاسيكي والأرشيفات الرقمية وآليات المزادات.',
        },
      ],
    },
    principles: {
      title: 'مبادئ العمل',
      items: [
        {
          number: '01',
          title: 'واقع بلا تجميل',
          body: 'أنت تدفع مقابل ما يحدث فعلًا، لا مقابل عروض مطمئنة. إذا كانت المبادرة معيبة أو محكومة بالفشل منذ البداية، أقول ذلك فورًا وبلا مجاملة مؤسسية.',
        },
        {
          number: '02',
          title: 'ندّية في التعامل',
          body: 'إلمام ثقافي كامل ببيئات صنّاع القرار. حوار مباشر على قدم المساواة، بلا تبعية أو استعراض أو لغة استشارية منزوعة الملامح.',
        },
        {
          number: '03',
          title: 'ثقة شخصية وتحفّظ لا يساومان',
          body: 'تقوم الاستشارة في المواقف عالية المخاطر على نزاهة شخصية مطلقة. ثقة تسمح بترك الأصول والسياق الحساس والاستراتيجية غير المعلنة بين يديّ دون تردد.',
        },
      ],
    },
    formats: {
      title: 'صيغ التعاون',
      items: [
        {
          kicker: 'اشتراك شهري',
          title: 'مجلس واستشارة',
          body: 'حضور استراتيجي مستمر، ورصد للآفاق، ومراجعات دورية للصناديق والمختبرات والمكاتب الخاصة.',
        },
        {
          kicker: 'محدّد',
          title: 'مشاريع خاصة',
          body: 'قيادة مباشرة لمبادرات متعددة التخصصات تشمل القانون والبنية الفنية والإعلام والتقنية.',
        },
        {
          kicker: 'سرّي',
          title: 'جلسات استراتيجية خاصة',
          body: 'تحليلات معمّقة وسرية لأصحاب القرار الذين يواجهون قرارات فريدة عالية العواقب.',
        },
      ],
    },
    footer: {
      title: 'مباشرة وسرّية.',
      body: 'إذا كانت مشكلتك لا تناسب القوالب الاستشارية المعتادة، فلنتحدث.',
      cta: 'لنبدأ حوارًا',
    },
  },
};
