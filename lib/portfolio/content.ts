/**
 * Single editorial source for /portfolio.
 *
 * Every image below is an original asset already used by the public
 * Heart & Angel / Temple surfaces. Captions deliberately avoid inventing
 * titles, dates, editions, locations or sales figures that are not present in
 * the repository.
 */

const STORAGE = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public';

export type PortfolioImage = {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
};

const gallery = (name: string) => `${STORAGE}/heartandangel/Gallery/${name}`;
const temple = (name: string) => `${STORAGE}/heartandangel/Temple/${name}`;

export const PORTFOLIO_IMAGES = {
  heroPainting: {
    src: gallery('IMG_1511.JPG'),
    alt: 'Heart & Angel painting: the Angel beside a red heart-shaped balloon, a tree and a small house under a blue sky.',
    caption: 'Heart & Angel — painting.',
    width: 960,
    height: 1280,
  },
  framedDrawing: {
    src: gallery('IMG_1510.JPG'),
    alt: 'A framed Heart & Angel drawing of the Angel releasing a heart-shaped balloon beside a tree and a small house.',
    caption: 'Heart & Angel — framed drawing.',
    width: 960,
    height: 1280,
  },
  studioDrawing: {
    src: gallery('IMG_1508.JPG'),
    alt: 'A Heart & Angel drawing on textured paper, held above a table in the open air.',
    caption: 'Heart & Angel — drawing on paper.',
    width: 960,
    height: 1280,
  },
  tshirts: {
    src: gallery('IMG_1522.JPG'),
    alt: 'White Heart & Angel t-shirts with small Angel, Devil and heart prints.',
    caption: 'Wearable art — printed t-shirts.',
    width: 1280,
    height: 960,
  },
  mug: {
    src: gallery('IMG_1521.JPG'),
    alt: 'A white mug with a blue handle and a printed Heart & Angel figure holding a small cup.',
    caption: 'Heart & Angel — printed mug.',
    width: 960,
    height: 1280,
  },
  postcards: {
    src: gallery('IMG_1516.JPG'),
    alt: 'A hand holding a stack of Heart & Angel postcards with the Angel, Devil, hearts, tree and house.',
    caption: 'Heart & Angel — printed postcards.',
    width: 960,
    height: 1280,
  },
  graffiti: {
    src: gallery('IMG_1513.JPG'),
    alt: 'A large Heart & Angel street intervention on a stone wall: a white Angel holding a red heart beside public steps.',
    caption: 'Heart & Angel — public space intervention.',
    width: 1280,
    height: 960,
  },
  streetSticker: {
    src: gallery('IMG_1517.JPG'),
    alt: 'A Heart & Angel sticker placed on a grey column beside a city street.',
    caption: 'Heart & Angel — sticker in public space.',
    width: 960,
    height: 1280,
  },
  world: {
    src: `${STORAGE}/heartandangel/World.png`,
    alt: 'The Heart & Angel World: the Angel, a heart-shaped balloon, a tree and a small house in an open landscape.',
    caption: 'Heart & Angel — the World.',
    width: 2136,
    height: 1383,
  },
  stickerSheet: {
    src: gallery('IMG_1524.JPG'),
    alt: 'A sheet of Heart & Angel sticker designs showing the Angel, Devil, hearts, house, sun and small everyday scenes.',
    caption: 'Heart & Angel — sticker sheet and Telegram stickers.',
    width: 1006,
    height: 1018,
  },
  candle: {
    src: gallery('IMG_1525.JPG'),
    alt: 'A Heart & Angel digital artwork of the Angel holding a lit candle in a dark blue field.',
    caption: 'Heart & Angel — digital artwork.',
    width: 960,
    height: 1280,
  },
  templeHeart: {
    src: temple('IMG_1775.png'),
    alt: 'The Temple heart artwork: a stained-glass heart set in a circular window.',
    caption: 'The Temple — central artwork.',
    width: 672,
    height: 672,
  },
  templeLeft: {
    src: temple('IMG_1776.jpeg'),
    alt: 'Stained-glass Temple artwork: the Angel beneath a sun, beside a tree and a small house.',
    caption: 'The Temple — stained glass, Angel.',
    width: 896,
    height: 1200,
  },
  templeRight: {
    src: temple('IMG_1777.jpeg'),
    alt: 'Stained-glass Temple artwork: the Devil beneath a sun, beside a tree and a small house.',
    caption: 'The Temple — stained glass, Devil.',
    width: 896,
    height: 1200,
  },
} as const satisfies Record<string, PortfolioImage>;

export const MEDIUM_SEQUENCE = [
  'IMAGE',
  'OBJECT',
  'PUBLIC SPACE',
  'DIGITAL ENVIRONMENT',
  'SACRED SPACE',
  'SHARED WORLD',
] as const;

export const STATEMENT = {
  lead: 'One artistic system, appearing in different forms.',
  paragraphs: [
    'Anton Merkurov works with a small set of images until they become a world. A heart, an angel, a devil, a tree, a house: repeated, redrawn, materialised and set in motion. The work is not a survey of media. It is one visual language testing how far a symbol can travel — from a sheet of paper to a wall, from a wall to a screen, from a screen to a place another person can enter.',
    'Heart & Angel is the centre of that practice. Begun in 2015 with simple drawn hearts, it has grown into an authored universe of characters, symbols and spaces. Painting and drawing remain the source. Objects, street interventions, digital works and the Temple are not separate projects; they are the same idea under different conditions of encounter.',
  ],
};

export const HEART_AND_ANGEL = {
  title: 'Heart & Angel',
  subtitle: 'An evolving artistic universe',
  year: 'From 2015',
  motto: 'Love is necessary. Love is never enough.',
  lead: 'A personal mythology of the Angel, the Devil and the Heart — three figures inside the same inner landscape.',
  paragraphs: [
    'The Angel and the Devil are not moral opposites. They share the same qualities, the same abilities and the same right to exist. One may carry wings; the other may carry a tail. Neither is wholly good or wholly bad. At the centre is the heart: sometimes a balloon, sometimes a simple shape, always a relationship rather than a trophy.',
    'What began as a naive line has become a continuous visual language. The same figures appear in paintings and drawings, on shirts and domestic objects, on walls and columns, in digital landscapes, in small interactive rituals and in the Temple. The medium changes; the emotional grammar does not.',
  ],
};

export const MOVEMENTS = [
  {
    id: 'image',
    index: 'I',
    medium: 'IMAGE',
    title: 'Painting & Drawing',
    body: [
      'Painting and drawing are the source of the universe. The Angel and the Devil are drawn with the same line; the heart is the only object that changes scale, material and meaning. Works on paper and canvas keep the hand visible — the wobble of the contour, the fill that does not quite meet the edge, the mark that stays.',
      'The simplicity is deliberate. A symbol has to survive being repeated: on a page, a wall, a screen, a sticker, a shirt. The drawings test that survival before anything else does.',
    ],
    images: ['framedDrawing', 'studioDrawing'] as const,
    layout: 'image',
  },
  {
    id: 'object',
    index: 'II',
    medium: 'OBJECT',
    title: 'Physical Objects',
    body: [
      'Physical objects are not merchandise appended to the work. They are another way for the images to exist in a room. Wearable art, mugs, postcards and stickers were produced and sold as part of the project, carrying the same figures into daily life.',
      'The object is not a reproduction of the painting. It is a different scale of the same idea: something held, worn, sent or kept.',
    ],
    images: ['tshirts', 'mug', 'postcards'] as const,
    layout: 'objects',
  },
  {
    id: 'public-space',
    index: 'III',
    medium: 'PUBLIC SPACE',
    title: 'Street Interventions',
    body: [
      'In public space the figures meet people who did not come to a gallery. A wall, a column, a pedestrian route: the work is placed into an existing composition and left to be encountered. Only documented interventions are shown here.',
      'The street does not decorate the project. It tests whether the images can hold their meaning without a frame, a caption or a white wall.',
    ],
    images: ['graffiti', 'streetSticker'] as const,
    layout: 'public',
  },
  {
    id: 'digital-environment',
    index: 'IV',
    medium: 'DIGITAL ENVIRONMENT',
    title: 'Digital Artifacts',
    body: [
      'Digital works extend the same vocabulary into motion, weather and interaction. The World is a living landscape; Calm and Let It Go are small interactive rituals. Digital graphics and Telegram stickers let the figures circulate as everyday signals rather than fixed artworks.',
      'The screen is treated as a place with its own light, tempo and weather — not as a container for documentation.',
    ],
    images: ['world', 'stickerSheet', 'candle'] as const,
    layout: 'digital',
  },
] as const;

export const TEMPLE = {
  title: 'The Temple',
  subtitle: 'A Sacred Digital Space',
  paragraphs: [
    'The Temple is not a website about a sacred place. It is the place itself: a quiet digital sanctuary built around presence, attention, repetition and collective memory. At its centre is a shared heart. Visitors can light the Vigil, leave a trace, move through small rituals and read the Chronicles — a public record of what others have kept.',
    'The project asks whether a digital place can hold meaning through use rather than spectacle: light that changes with participation, a daily return, a trace that remains. Its scale is deliberately human. It does not claim an audience; it makes room for one.',
  ],
  elements: [
    {
      title: 'The central heart',
      body: 'A shared votive heart at the centre of the Temple.',
    },
    {
      title: 'The Vigil',
      body: 'A daily act of lighting and returning; one flame shared across visitors.',
    },
    {
      title: 'Light',
      body: 'The heart responds to the life of the Vigil — glow, colour and intensity.',
    },
    {
      title: 'Traces',
      body: 'Ritual actions leave a public, allowlisted trace.',
    },
    {
      title: 'Chronicles',
      body: 'A rolling public record of recent traces, kept in UTC.',
    },
  ],
  rituals: [
    { title: 'Calm', href: '/heartandangel/calm' },
    { title: 'Let It Go', href: '/heartandangel/letitgo' },
    { title: 'Absolution', href: '/absolution' },
    { title: 'Cast', href: '/cast' },
  ],
  images: ['templeLeft', 'templeHeart', 'templeRight'] as const,
};

export const SHARED_WORLD = {
  title: 'A Shared World',
  status: 'In development',
  paragraphs: [
    'The next chapter is a shared multiplayer world: a place where more than one presence can inhabit the landscape at the same time. It is in development and is not presented here as a finished product.',
    'The intention is continuous with the Temple — not a game to win, but a world to keep company in. One landscape, many presences, and the same question: what does it mean to be somewhere together?',
  ],
  words: ['ONE LANDSCAPE', 'MANY PRESENCES', 'A WORLD STILL BEING BUILT'],
};

export const OTHER_PROJECTS = [
  {
    title: 'UNFRAMED',
    href: '/unframed',
    body: 'An ongoing artistic and editorial project about memory, images, archives and digital transformation. It moves between memoir, essay, image and research, asking how a life is edited when everything can be copied.',
  },
  {
    title: 'Heritage Archive',
    href: '/heritage',
    body: 'Work with cultural memory and historical materials: the archive of sculptor Sergey Dmitrievich Merkurov, museum and restoration records, family papers and digital restitution.',
  },
  {
    title: 'Media Archive',
    href: '/media',
    body: 'A long-term archive of publications, mentions and media work, with source links and a chronological record.',
  },
] as const;

export const BIOGRAPHY = {
  short:
    'Anton Merkurov is an artist, art dealer, and media and communication expert, analyst and writer. His visual practice is centred on Heart & Angel, an evolving artistic universe begun in 2015, and moves between painting, drawing, physical objects, public space, digital environments and participatory ritual. He is the great-grandson of sculptor Sergey Dmitrievich Merkurov (1881–1952).',
  extended: [
    'Born in Moscow in the late Soviet period and raised through the 1990s, Merkurov grew up inside the artistic community while initially choosing a path in technology and new media. Over more than two decades he worked across media, communications, photography and digital strategy, as an adviser, analyst and writer. Alongside that work he has maintained the family’s cultural archive, including the Sergey Merkurov Museum in Gyumri, Armenia, family papers and archival publishing.',
    'Heart & Angel began in 2015 with simple hearts drawn in a naive hand. It has since become a sustained artistic system: paintings and drawings, wearable and domestic objects, street interventions, digital artifacts, interactive rituals and the Temple. The work is independent, cumulative and deliberately unfixed in medium. Its centre is not a style but a set of relationships — between love and attention, image and object, private feeling and shared space.',
  ],
  facts: [
    {
      label: 'Practice',
      value:
        'Painting, drawing, physical objects, public space, digital environments and participatory ritual.',
    },
    { label: 'Central work', value: 'Heart & Angel, begun in 2015.' },
    {
      label: 'Family',
      value: 'Great-grandson of sculptor Sergey Dmitrievich Merkurov (1881–1952).',
    },
    {
      label: 'Professional background',
      value:
        'Art dealer; media and communication expert; analyst and writer. More than two decades in media and technology.',
    },
    {
      label: 'Archive work',
      value:
        'Sergey Merkurov Museum, Gyumri; family papers; archival publishing and digital restitution.',
    },
    { label: 'Based', value: 'Lives and works between Moscow and London.' },
  ],
} as const;

export const CONTACT = {
  email: 'merkurov@gmail.com',
  emailHref: 'mailto:merkurov@gmail.com?subject=Portfolio%20enquiry',
  links: [
    { label: 'Private office', href: '/lobby' },
    { label: 'Heart & Angel', href: '/heartandangel' },
    { label: 'The Temple', href: '/temple' },
    { label: 'UNFRAMED', href: '/unframed' },
    { label: 'Heritage Archive', href: '/heritage' },
    { label: 'Media Archive', href: '/media' },
    { label: 'Instagram', href: 'https://www.instagram.com/heart_and_angel', external: true },
    { label: 'Telegram', href: 'https://t.me/heartandangel', external: true },
  ],
} as const;
