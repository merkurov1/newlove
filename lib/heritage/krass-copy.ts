import type { KrassItem, KrassLang } from './krass-types';

type Copy = {
  meta: { title: string; description: string; ogAlt: string };
  hero: {
    eyebrow: string;
    titleTop: string;
    titleBottom: string;
    subtitle: string;
    intro: string;
    cta: string;
    imageCaption: string;
  };
  labels: {
    collection: string;
    collectionCount: string;
    view: string;
    viewHint: string;
    close: string;
    prev: string;
    next: string;
    zoomIn: string;
    zoomOut: string;
    zoomReset: string;
    zoomHint: string;
    swipeHint: string;
    artist: string;
    filmYear: string;
    posterYear: string;
    director: string;
    publisher: string;
    technique: string;
    dimensions: string;
    edition: string;
    source: string;
    note: string;
    unknownArtist: string;
    probableArtist: string;
    verified: string;
    probable: string;
    unknown: string;
    typePoster: string;
    typeBooklet: string;
    typeLeaflet: string;
    typeBookSpread: string;
    typeAlbumCover: string;
    notRecorded: string;
    notEstablished: string;
    backToHeritage: string;
    sourcesNote: string;
    archival: string;
    film: string;
    poster: string;
    loading: string;
  };
  curatorial: { eyebrow: string; title: string; paragraphs: string[] };
  gallery: { eyebrow: string; title: string; intro: string; note: string };
  context: {
    eyebrow: string;
    title: string;
    intro: string;
    krasnopevtsev: { title: string; paragraphs: string[] };
    fedorov: { title: string; paragraphs: string[] };
    reklamafilm: { title: string; paragraphs: string[] };
    timeline: { year: string; text: string }[];
  };
  collection: { eyebrow: string; title: string; paragraphs: string[] };
  sources: {
    eyebrow: string;
    title: string;
    intro: string;
    links: { label: string; href: string; note: string }[];
  };
  footer: { note: string; credit: string };
};

export const KRASS_COPY: Record<KrassLang, Copy> = {
  ru: {
    meta: {
      title: 'Краснопевцев / Фёдоров — Киноплакаты. Рекламфильм. 1953–1972',
      description:
        '44 листа из частного собрания: киноплакаты «Рекламфильма» 1953–1972, другие художники и архивные документы. Атрибуции и источники.',
      ogAlt: 'Киноплакат «Последний дюйм», художник Дмитрий Краснопевцев, 1959',
    },
    hero: {
      eyebrow: 'Цифровая выставка · частное собрание',
      titleTop: 'КРАСНОПЕВЦЕВ',
      titleBottom: 'ФЁДОРОВ',
      subtitle: 'Киноплакаты. Рекламфильм. 1953–1972.',
      intro:
        'Сорок четыре листа из частного собрания: киноплакаты «Рекламфильма», архивные документы и несколько работ других авторов. Без ретуши и стилизации — только бумага, печать и время.',
      cta: 'Смотреть коллекцию',
      imageCaption:
        'Дмитрий Краснопевцев. «Последний дюйм». 1959. Бумага, хромолитография. «Рекламфильм».',
    },
    labels: {
      collection: 'Коллекция',
      collectionCount: '44 листа',
      view: 'Рассмотреть',
      viewHint: 'Открыть изображение и подпись',
      close: 'Закрыть',
      prev: 'Предыдущая',
      next: 'Следующая',
      zoomIn: 'Увеличить',
      zoomOut: 'Уменьшить',
      zoomReset: 'Сбросить масштаб',
      zoomHint: 'Нажмите на изображение, чтобы увеличить',
      swipeHint: 'Стрелки или свайп',
      artist: 'Художник',
      filmYear: 'Год фильма',
      posterYear: 'Год плаката',
      director: 'Режиссёр',
      publisher: 'Издатель',
      technique: 'Техника',
      dimensions: 'Размер',
      edition: 'Тираж',
      source: 'Источник атрибуции',
      note: 'Примечание',
      unknownArtist: 'Художник не установлен',
      probableArtist: 'атрибуция предположительная',
      verified: 'подтверждено',
      probable: 'предположительно',
      unknown: 'не установлено',
      typePoster: 'Киноплакат',
      typeBooklet: 'Разворот рекламного буклета',
      typeLeaflet: 'Листовка',
      typeBookSpread: 'Разворот книги',
      typeAlbumCover: 'Обложка папки/альбома',
      notRecorded: 'не указан',
      notEstablished: 'не установлена',
      backToHeritage: 'Вернуться в архив наследия',
      sourcesNote:
        'Ссылки ведут на внешние источники. Часть каталогов может быть недоступна из-за геоблокировки.',
      archival: 'Архивный документ',
      film: 'фильм',
      poster: 'плакат',
      loading: 'Загрузка',
    },
    curatorial: {
      eyebrow: 'Кураторский текст',
      title: 'Плакат как работа, а не как музейный экспонат',
      paragraphs: [
        'В 1953–1972 годах московская фабрика «Рекламфильм» выпускала афиши, которые каждый вечер встречали зрителя у кинотеатра. Это была массовая, быстрая, прикладная работа: художник получал чёрно-белые фотокомплекты, делал эскиз, утром его утверждали, а через неделю тираж уже печатали на дешёвой бумаге в два-три цвета. Плакат жил неделями, иногда днями.',
        'Дмитрий Краснопевцев пришёл на фабрику в 1953 году и проработал там двадцать лет — до 1973-го. Его киноплакаты почти не похожи на метафизические натюрморты, которыми он известен: здесь больше рекламной прямоты, крупного лица, локального цвета. Но и в них видна его манера — сдержанная, чуть отстранённая, внимательная к силуэту и паузе.',
        'Коллекция показывает не только Краснопевцева. В ней есть «Мексиканец» Виктора Кононова, «Когда рядом друзья» Бориса Кондратьева, вероятно, «Неподдающиеся» Николая Хомова, анонимная листовка и книжный разворот. Мы не выравниваем их под одно имя: разные авторы — часть истории «Рекламфильма», а не ошибка собрания.',
        'Двойное имя в заглавии — не подпись под каждым листом, а рамка собрания. Оно отсылает к двум линиям: к художественной работе Краснопевцева на «Рекламфильме» и к истории Фёдоровых, в которой эта коллекция сохранилась. Где атрибуция не подтверждена, мы говорим об этом прямо.',
      ],
    },
    gallery: {
      eyebrow: 'Коллекция',
      title: 'Сорок четыре листа',
      intro:
        'Плакаты, буклет, листовка, книжный разворот и обложка альбома. Пропорции оригиналов сохранены; изображения не обрезаны и не перецветокорректированы.',
      note:
        'Пометки «подтверждено», «предположительно» и «не установлено» относятся к атрибуции художника, а не к качеству отпечатка. Год плаката может не совпадать с годом фильма.',
    },
    context: {
      eyebrow: 'Контекст',
      title: 'Три линии',
      intro:
        'Художник, фабрика и собрание. Коротко о том, что подтверждено, и о том, что ещё требует архива.',
      krasnopevtsev: {
        title: 'Дмитрий Михайлович Краснопевцев',
        paragraphs: [
          'Московский художник (1925–1995), представитель неофициального искусства, мастер метафизического натюрморта. Учился в Суриковском институте (1949–1955), занимался офортом у М. А. Доброва.',
          'С 1953 по 1973 год работал художником киноплаката на «Рекламфильме». Первая персональная выставка прошла в 1962 году в квартире Святослава Рихтера; в 1992-м он стал первым лауреатом премии «Триумф».',
          'Киноплакаты были для него работой, а не главным высказыванием. Но именно они дают увидеть, как будущий мастер натюрморта учился строить изображение: через паузу, силуэт, ограниченный цвет и точную деталь.',
        ],
      },
      fedorov: {
        title: 'Алексей Алексеевич Фёдоров (1937–1994)',
        paragraphs: [
          'Имя, с которым связана история этого собрания. В доступных источниках нам не удалось документировать его биографию и конкретные киноплакаты, поэтому мы не приписываем ему ни один из 44 листов и не заполняем пробел догадками.',
          'Это не отменяет его значения для истории собрания, но требует дальнейшего архивного исследования. Собрание сформировал его сын, Алексей Фёдоров-младший (1970–2024); цифровые копии были переданы Антону Меркурову.',
          'Название выставки не следует читать так, будто коллекция принадлежала Фёдорову-старшему. Перед нами частное собрание, собранное уже после советского периода.',
        ],
      },
      reklamafilm: {
        title: '«Рекламфильм»',
        paragraphs: [
          'Московская фабрика киноплаката, главный производитель советской кинорекламы в 1950–60-е. Художники работали с чёрно-белыми фотокомплектами, часто без указания цветов; эскиз делался за ночь, утром утверждался, через неделю печатался тираж.',
          'В 1960-е на фабрику пришла группа молодых авторов — Мирон Лукьянов, Василий Островский, Лилия Левшунова и другие. Они вводили в плакат символику, метафору, коллаж, отходили от буквальной «кинематографической» иллюстрации. К началу 1990-х «Рекламфильм» фактически прекратил работу.',
          'Наши листы — часть этого массового производства. На них читаются даты подписания в печать, номера заказов, тиражи и цена. Это не уникальные единичные оттиски, а тиражная продукция, которая сохранилась как документ эпохи.',
        ],
      },
      timeline: [
        { year: '1953', text: 'Краснопевцев начинает работать на «Рекламфильме». В коллекции — «Корабли штурмуют бастионы» и «Слуга двух господ».' },
        { year: '1956', text: '«Мексиканец» Виктора Кононова и «Хозяйка гостиницы» Краснопевцева.' },
        { year: '1960', text: '«Первое свидание», «Ловцы губок», «Евгения Гранде» — год высокой продуктивности фабрики.' },
        { year: '1964', text: '«Тишина» (файл 1960-6) — поздний лист в коллекции, напоминающий, что имя файла не равно году плаката.' },
        { year: '1972', text: '«Могила льва» — последний по времени лист собрания.' },
      ],
    },
    collection: {
      eyebrow: 'Собрание',
      title: 'Откуда эти листы',
      paragraphs: [
        'Собрание сформировал Алексей Фёдоров-младший (1970–2024). Цифровые копии были переданы Антону Меркурову для публикации. Это не собрание Алексея Алексеевича Фёдорова (1937–1994) и не «архив художника»: перед нами частная коллекция, собранная уже после советского периода.',
        'Мы публикуем 44 листа как исследовательский корпус, а не как полный каталог «Рекламфильма». Часть листов — уникальные варианты, которых нет в РГБ; часть — работы других авторов; часть — архивные документы. Границы собрания важны так же, как его содержание.',
      ],
    },
    sources: {
      eyebrow: 'Источники',
      title: 'Где проверялись факты',
      intro:
        'Атрибуции, годы фильмов и выходные данные сверены с отпечатками и внешними каталогами. Ниже — основные точки входа.',
      links: [
        { label: 'Российская государственная библиотека', href: 'https://search.rsl.ru/', note: 'Каталог изоизданий, записи о плакатах и вариантах' },
        { label: 'НЭБ — Советский киноплакат', href: 'https://rusneb.ru/collections/1581_sovetskiy_kinoplakat/', note: 'Коллекция и исторический контекст' },
        { label: 'Музей кино — фонд киноплакатов', href: 'https://museikino.ru/funds/posters/', note: 'Музейное собрание и описание фонда' },
        { label: 'Манеж — История советского кино в киноплакате', href: 'https://moscowmanege.ru/ru/istoriya-sovetskogo-kino-v-kinoplakate-1919-1991/', note: 'Выставочный контекст 1919–1991' },
        { label: 'Reklamafilm — история', href: 'https://reklamafilm.com/poster_history', note: 'История фабрики и художников' },
        { label: 'Gamborg Gallery / Digital Soviet Art', href: 'https://www.digitalsovietart.com/artist-portfolios/812-krasnopevtsev-dmitry-1925-1995', note: 'Малоформатные варианты Краснопевцева' },
        { label: 'DEFA-Stiftung', href: 'https://www.defa-stiftung.de/', note: 'Фильмы ГДР: «Доктор Роберт Майер», «Пять патронных гильз»' },
        { label: 'Národní filmový archiv', href: 'https://nfa.cz/en/', note: 'Чехословацкие фильмы, включая «Бегство из тени»' },
        { label: 'Мосфильм', href: 'https://www.mosfilm.ru/', note: 'Фильмографические данные' },
        { label: 'ARTinvestment — Дмитрий Краснопевцев', href: 'https://artinvestment.ru/invest/artistofweek/20201221_krasnopevtsev_artist.html', note: 'Биография и работа в «Рекламфильме»' },
        { label: 'Dodge Collection — Dmitrii Krasnopevtsev', href: 'https://dodge.zimmerli.rutgers.edu/artists/dmitrii-krasnopevtsev', note: '1953–1973: работа художником киноплаката' },
      ],
    },
    footer: {
      note:
        'Цифровая выставка. Оригиналы не изменялись: изображения даны в исходных пропорциях, без обрезки и фильтров.',
      credit: 'Собрание Алексея Фёдорова-младшего · цифровые копии переданы Антону Меркурову',
    },
  },
  en: {
    meta: {
      title: 'Krasnopevtsev / Fedorov — Film Posters. Reklamfilm. 1953–1972',
      description:
        '44 sheets from a private collection: Reklamfilm posters, 1953–1972, other artists, and archival documents. With attributions and sources.',
      ogAlt: 'The Last Inch film poster by Dmitry Krasnopevtsev, 1959',
    },
    hero: {
      eyebrow: 'Digital exhibition · private collection',
      titleTop: 'KRASNOPEVTSEV',
      titleBottom: 'FEDOROV',
      subtitle: 'Film posters. Reklamfilm. 1953–1972.',
      intro:
        'Forty-four sheets from a private collection: Reklamfilm posters, archival documents, and a few works by other artists. No retouching, no stylisation — just paper, ink, and time.',
      cta: 'View the collection',
      imageCaption:
        'Dmitry Krasnopevtsev. The Last Inch. 1959. Paper, chromolithograph. Reklamfilm.',
    },
    labels: {
      collection: 'The collection',
      collectionCount: '44 sheets',
      view: 'View',
      viewHint: 'Open the image and label',
      close: 'Close',
      prev: 'Previous',
      next: 'Next',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      zoomReset: 'Reset zoom',
      zoomHint: 'Click the image to zoom',
      swipeHint: 'Arrow keys or swipe',
      artist: 'Artist',
      filmYear: 'Film year',
      posterYear: 'Poster year',
      director: 'Director',
      publisher: 'Publisher',
      technique: 'Technique',
      dimensions: 'Dimensions',
      edition: 'Edition',
      source: 'Attribution source',
      note: 'Note',
      unknownArtist: 'Artist not established',
      probableArtist: 'provisional attribution',
      verified: 'verified',
      probable: 'probable',
      unknown: 'not established',
      typePoster: 'Film poster',
      typeBooklet: 'Advertising booklet spread',
      typeLeaflet: 'Leaflet',
      typeBookSpread: 'Book spread',
      typeAlbumCover: 'Folder/album cover',
      notRecorded: 'not recorded',
      notEstablished: 'not established',
      backToHeritage: 'Back to the heritage archive',
      sourcesNote: 'Links lead to external sources. Some catalogues may be geo-blocked.',
      archival: 'Archival document',
      film: 'film',
      poster: 'poster',
      loading: 'Loading',
    },
    curatorial: {
      eyebrow: 'Curatorial text',
      title: 'A poster as work, not as a museum object',
      paragraphs: [
        'Between 1953 and 1972, Moscow’s Reklamfilm factory produced the posters that met audiences outside cinemas. It was mass, fast, applied work: an artist received black-and-white photo sets, made a sketch, had it approved in the morning, and within a week the print run was on cheap paper in two or three colours. A poster might live for weeks, sometimes only days.',
        'Dmitry Krasnopevtsev joined the factory in 1953 and stayed for twenty years, until 1973. His film posters look little like the metaphysical still lifes he is known for: here there is more advertising directness, a large face, a local colour. Yet his manner is still visible — restrained, slightly detached, attentive to silhouette and pause.',
        'The collection is not only Krasnopevtsev. It includes Viktor Kononov’s The Mexican, Boris Kondratyev’s When Friends Are Near, probably Nikolai Khomov’s The Unruly, an anonymous leaflet and a book spread. We do not flatten them under one name: different authors are part of the Reklamfilm story, not a mistake in the collection.',
        'The double name in the title is not a signature under every sheet but the frame of the collection. It points to two lines: Krasnopevtsev’s artistic work at Reklamfilm, and the Fedorov family history through which the collection survived. Where attribution is not confirmed, we say so plainly.',
      ],
    },
    gallery: {
      eyebrow: 'The collection',
      title: 'Forty-four sheets',
      intro:
        'Posters, a booklet, a leaflet, a book spread and an album cover. Original proportions are preserved; images are neither cropped nor colour-corrected.',
      note:
        '“Verified”, “probable” and “not established” refer to the attribution of the artist, not to the quality of the print. A poster year may differ from the film year.',
    },
    context: {
      eyebrow: 'Context',
      title: 'Three lines',
      intro:
        'An artist, a factory and a collection. Briefly, what is confirmed — and what still needs archival work.',
      krasnopevtsev: {
        title: 'Dmitry Mikhailovich Krasnopevtsev',
        paragraphs: [
          'Moscow artist (1925–1995), a figure of unofficial art and a master of the metaphysical still life. He studied at the Surikov Institute (1949–1955), working on etching with M. A. Dobrov.',
          'From 1953 to 1973 he worked as a film-poster artist at Reklamfilm. His first solo exhibition took place in 1962 in Sviatoslav Richter’s apartment; in 1992 he became the first laureate of the Triumph prize.',
          'Film posters were work for him, not his central statement. Yet they show how the future still-life painter learned to build an image: through pause, silhouette, limited colour and precise detail.',
        ],
      },
      fedorov: {
        title: 'Alexei Alekseevich Fedorov (1937–1994)',
        paragraphs: [
          'A name bound up with the history of this collection. In the sources available to us, we could not document his biography or specific film posters; we therefore do not attribute any of the 44 sheets to him, and we do not fill the gap with guesses.',
          'This does not diminish his significance for the history of the collection, but it calls for further archival research. The collection was formed by his son, Alexei Fedorov Jr. (1970–2024); digital copies were transferred to Anton Merkurov.',
          'The title of the exhibition should not be read as if the collection belonged to Fedorov Sr. This is a private collection formed after the Soviet period.',
        ],
      },
      reklamafilm: {
        title: 'Reklamfilm',
        paragraphs: [
          'A Moscow film-poster factory and the main producer of Soviet cinema advertising in the 1950s and 1960s. Artists worked from black-and-white photo sets, often without colour indications; a sketch was made overnight, approved in the morning, and printed within a week.',
          'In the 1960s a group of young authors — Miron Lukyanov, Vasily Ostrovsky, Liliya Levshunova and others — brought symbolism, metaphor and collage into the poster, moving away from literal “cinematic” illustration. By the early 1990s Reklamfilm had effectively ceased operations.',
          'Our sheets are part of that mass production. They carry print dates, order numbers, edition sizes and prices. They are not unique single impressions but editioned products that survived as documents of their time.',
        ],
      },
      timeline: [
        { year: '1953', text: 'Krasnopevtsev joins Reklamfilm. The collection includes Ships Storm the Bastions and The Servant of Two Masters.' },
        { year: '1956', text: 'Viktor Kononov’s The Mexican and Krasnopevtsev’s The Innkeeper.' },
        { year: '1960', text: 'First Date, Sponge Divers and Eugénie Grandet — a year of high output at the factory.' },
        { year: '1964', text: 'Silence (file 1960-6), a late sheet that reminds us the filename is not the poster year.' },
        { year: '1972', text: 'The Lion’s Grave, the latest sheet in the collection.' },
      ],
    },
    collection: {
      eyebrow: 'The collection',
      title: 'Where these sheets come from',
      paragraphs: [
        'The collection was formed by Alexei Fedorov Jr. (1970–2024). Digital copies were transferred to Anton Merkurov for publication. It is not the collection of Alexei Alekseevich Fedorov (1937–1994), nor an “artist’s archive”: it is a private collection formed after the Soviet period.',
        'We publish the 44 sheets as a research corpus, not as a complete catalogue of Reklamfilm. Some are unique variants absent from the Russian State Library; some are by other artists; some are archival documents. The boundaries of the collection matter as much as its contents.',
      ],
    },
    sources: {
      eyebrow: 'Sources',
      title: 'Where the facts were checked',
      intro:
        'Attributions, film years and imprint data were checked against the objects and external catalogues. These are the main entry points.',
      links: [
        { label: 'Russian State Library', href: 'https://search.rsl.ru/', note: 'Catalogue of visual materials, poster records and variants' },
        { label: 'NEB — Soviet film poster', href: 'https://rusneb.ru/collections/1581_sovetskiy_kinoplakat/', note: 'Collection and historical context' },
        { label: 'Museum of Cinema — poster fund', href: 'https://museikino.ru/funds/posters/', note: 'Museum collection and fund description' },
        { label: 'Manege — History of Soviet cinema in film posters', href: 'https://moscowmanege.ru/ru/istoriya-sovetskogo-kino-v-kinoplakate-1919-1991/', note: 'Exhibition context, 1919–1991' },
        { label: 'Reklamafilm — history', href: 'https://reklamafilm.com/poster_history', note: 'Factory and artists’ history' },
        { label: 'Gamborg Gallery / Digital Soviet Art', href: 'https://www.digitalsovietart.com/artist-portfolios/812-krasnopevtsev-dmitry-1925-1995', note: 'Small-format Krasnopevtsev variants' },
        { label: 'DEFA-Stiftung', href: 'https://www.defa-stiftung.de/', note: 'GDR films: Dr. Robert Mayer, Five Cartridges' },
        { label: 'Národní filmový archiv', href: 'https://nfa.cz/en/', note: 'Czechoslovak films, including Escape from the Shadow' },
        { label: 'Mosfilm', href: 'https://www.mosfilm.ru/', note: 'Filmographic data' },
        { label: 'ARTinvestment — Dmitry Krasnopevtsev', href: 'https://artinvestment.ru/invest/artistofweek/20201221_krasnopevtsev_artist.html', note: 'Biography and work at Reklamfilm' },
        { label: 'Dodge Collection — Dmitrii Krasnopevtsev', href: 'https://dodge.zimmerli.rutgers.edu/artists/dmitrii-krasnopevtsev', note: '1953–1973: work as a film-poster artist' },
      ],
    },
    footer: {
      note:
        'Digital exhibition. The originals were not altered: images are shown in their original proportions, without cropping or filters.',
      credit: 'Collection of Alexei Fedorov Jr. · digital copies transferred to Anton Merkurov',
    },
  },
};

const ARTIST_NAMES: Record<string, { ru: string; en: string }> = {
  'Дмитрий Михайлович Краснопевцев': { ru: 'Дмитрий Краснопевцев', en: 'Dmitry Krasnopevtsev' },
  'Виктор Кононов': { ru: 'Виктор Кононов', en: 'Viktor Kononov' },
  'Борис Кондратьев': { ru: 'Борис Кондратьев', en: 'Boris Kondratyev' },
  'Николай Хомов': { ru: 'Николай Хомов', en: 'Nikolai Khomov' },
};

export function displayTitle(item: KrassItem, lang: KrassLang): string {
  const title = lang === 'ru' ? item.titleRu : item.titleEn;
  return title || item.titleRu;
}

export function typeLabel(item: KrassItem, lang: KrassLang): string {
  const l = KRASS_COPY[lang].labels;
  switch (item.type) {
    case 'booklet-spread':
      return l.typeBooklet;
    case 'leaflet':
      return l.typeLeaflet;
    case 'book-spread':
      return l.typeBookSpread;
    case 'album-cover':
      return l.typeAlbumCover;
    default:
      return l.typePoster;
  }
}

export function isDocument(item: KrassItem): boolean {
  return item.type !== 'poster';
}

export function displayArtist(item: KrassItem, lang: KrassLang): string {
  const l = KRASS_COPY[lang].labels;
  if (item.id === '1962-2') {
    return lang === 'ru'
      ? 'Д. Краснопевцев, Л. Корчемкин (по подписям)'
      : 'D. Krasnopevtsev, L. Korchemkin (per captions)';
  }
  if (!item.artist) return l.unknownArtist;
  const known = ARTIST_NAMES[item.artist];
  const name = known ? known[lang] : item.artist;
  if (item.artistConfidence === 'probable') {
    return lang === 'ru' ? `${name} (предположительно)` : `${name} (probable)`;
  }
  return name;
}

export function confidenceLabel(item: KrassItem, lang: KrassLang): string {
  const l = KRASS_COPY[lang].labels;
  switch (item.confidence) {
    case 'verified':
      return l.verified;
    case 'corroborated':
      return lang === 'ru' ? 'подтверждено несколькими источниками' : 'corroborated';
    case 'probable':
      return l.probable;
    default:
      return l.unknown;
  }
}

export function directorLabel(item: KrassItem, lang: KrassLang): string {
  if (!item.director || !item.director.length) {
    return lang === 'ru' ? 'не установлен' : 'not established';
  }
  return item.director.join(', ');
}

export function publisherLabel(item: KrassItem, lang: KrassLang): string {
  return item.publisher || (lang === 'ru' ? 'не установлен' : 'not established');
}

export function techniqueLabel(item: KrassItem, lang: KrassLang): string {
  return item.technique || KRASS_COPY[lang].labels.notEstablished;
}

export function dimensionsLabel(item: KrassItem, lang: KrassLang): string | null {
  if (!item.dimensionsCm) return null;
  const match = item.dimensionsCm.match(/(\d+(?:[.,]\d+)?)\s*[×x]\s*(\d+(?:[.,]\d+)?)/);
  if (!match) return item.dimensionsCm;
  const size = `${match[1]} × ${match[2]} см`;
  const rsl = /RSL|РГБ/i.test(item.dimensionsCm);
  if (rsl) {
    return lang === 'ru' ? `${size} (по записи РГБ)` : `${size} (per RSL record)`;
  }
  return size;
}

export function editionLabel(item: KrassItem): string | null {
  if (!item.edition) return null;
  return item.edition;
}

export function priceLabel(item: KrassItem): string | null {
  if (!item.price) return null;
  return item.price;
}

export function posterYearLabel(item: KrassItem, lang: KrassLang): string {
  if (!item.posterYear) return KRASS_COPY[lang].labels.notRecorded;
  return String(item.posterYear);
}

export function filmYearLabel(item: KrassItem, lang: KrassLang): string {
  if (!item.filmYear) return KRASS_COPY[lang].labels.notRecorded;
  return String(item.filmYear);
}

export function attributionSummary(item: KrassItem, lang: KrassLang): string {
  if (item.id === '1962-2') {
    return lang === 'ru'
      ? 'Подписи на развороте книги; репродукции, не оригинальные плакаты'
      : 'Captions in the book spread; reproductions, not original posters';
  }
  if (item.artistConfidence === 'unknown') {
    return lang === 'ru'
      ? 'Атрибуция не установлена: на листе нет имени художника или издателя'
      : 'Attribution not established: the sheet carries no artist or publisher imprint';
  }
  if (item.artistConfidence === 'probable') {
    if (item.id === '1959-01') {
      return lang === 'ru'
        ? 'Кредитная строка обрезана; РГБ и история «Рекламфильма»'
        : 'Credit line cropped; RSL and Reklamfilm history';
    }
    return lang === 'ru'
      ? 'Атрибуция предположительная: кредитная строка обрезана или отсутствует'
      : 'Provisional attribution: credit line cropped or absent';
  }
  if (item.sources.some((s) => /РГБ|RSL/i.test(s))) {
    return lang === 'ru'
      ? 'Кредитная строка на отпечатке; каталожная запись РГБ'
      : 'Printed credit on the poster; RSL catalogue record';
  }
  return lang === 'ru'
    ? 'Кредитная строка на отпечатке'
    : 'Printed credit on the poster';
}

export function noteFor(item: KrassItem, lang: KrassLang): string {
  return lang === 'ru' ? item.notes : item.notesEn;
}

export function imageAlt(item: KrassItem, lang: KrassLang): string {
  const title = displayTitle(item, lang);
  const artist = displayArtist(item, lang);
  const year = posterYearLabel(item, lang);
  const kind = typeLabel(item, lang);
  if (lang === 'ru') {
    return `${kind} «${title}», ${artist}, ${year}`;
  }
  return `${kind} “${title}”, ${artist}, ${year}`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
