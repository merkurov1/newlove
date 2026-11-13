/**
 * UNFRAMED episode data.
 *
 * This is a data model, not a universal page template: each episode keeps its
 * own composition. Both published transmissions are listed here.
 *
 * The Spectral Tiger passage is published from the manuscript source at
 * app/unframed/Unframed.markdown (Chapter 14: The London Shuttle, 2008).
 * The Episode 42 passage is a continuous excerpt from Chapter 06: The Digital
 * Awakening. Wording is intentionally verbatim; do not rewrite or expand it.
 */

export type UnframedEpisode = {
  slug: string;
  number: number;
  title: string;
  year?: string;
  seriesLabel: string;
  tagline: string;
  image: string;
  runtime?: string;
  format?: string;
  video: {
    url: string;
    title: string;
  };
  statement: string;
  chapter: {
    label: string;
    paragraphs: readonly string[];
    sourceLine: string;
  };
  book: {
    url: string;
    meta: string;
  };
  related: readonly {
    label: string;
    href: string;
  }[];
};

const TIGER_ARTWORK =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Prompt_a_translucent_202512051450.jpeg';

const APPLE_BOOKS_URL = 'https://books.apple.com/gb/book/unframed/id6792809614';

export const CONTAINER_EPISODE: UnframedEpisode = {
  slug: 'container',
  number: 42,
  title: 'Step Out of the Physical Container',
  seriesLabel: 'A memoir by Anton Merkurov',
  tagline:
    'A cyber-noir transmission from the digital awakening — on the first modems, the networks before the web, and the body left behind.',
  image: TIGER_ARTWORK,
  runtime: '~1 Min',
  format: '4K / Cyber-Noir Narrative',
  video: {
    url: 'https://www.youtube.com/embed/ZGhmmDVVwQg?rel=0&playsinline=1',
    title: 'UNFRAMED // Episode 42: Step Out of the Physical Container',
  },
  statement:
    'True freedom was never won on the streets. It booted up inside a flickering display. Step out of the physical container into pure digital status.',
  chapter: {
    label: '06 — The Digital Awakening',
    paragraphs: [
      `The hardware appeared on my desk like an artifact from an alien civilization. A beige box--an IBM 486DX--and the key to the universe: a US Robotics Sportster modem. 36.6 baud. The screeching, static scream of a digital connection, followed by the hiss of silence, was the most beautiful music I had ever heard. It was the sound of freedom. It was better than any metal band. Better than any bottle.`,
      `I didn't stop drinking immediately, but I stopped going to the basement to rot. I started going there to build. The internet didn't exist yet; there was FidoNet. It was decentralized, anarchic, and strictly hierarchical--a network of computers connected by phone lines, passing messages like digital samizdat.`,
      `It was a meritocracy of pure text. To stand out from the gray mass, you had to own the language. If you wrote smartly, you became a Node. If you wrote stupidly, you were disconnected. My social circle exploded. I met people there who would become famous figures, captains of industry, and lifelong friends. We lived in a hybrid reality long before it became a global standard. Part of the time was spent "Online"--glued to the screen, typing furiously. The other part was spent at the "Fidopoyka"--the Fido drinking party.`,
      `It was my first massive experience in communication. The core of the network was small--a few hundred active voices against a background of thousands of silent readers. To belong to that Core, you had to prove your worth both verbally and textually. We were an elite without money, defined only by our ability to process information.`,
      `The structure was beautiful in its brutality. At night, when phone rates dropped, the network would wake up. Modems would dial each other. By morning, your messages had traveled across the city, the country, and sometimes the world. No central server. No company. No government. Just people and wires.`,
      `Politics usually existed in the background, but in April 1997, it touched the wire. The bureaucrats decided to introduce "Povremenka"--metered billing for local calls. For us--the FidoNet nodes and modem addicts--it was a death sentence. We stepped out of the digital shadows and held my first conscious political rally. It wasn't for democracy or human rights; it was for bandwidth.`,
      `We gathered near the White House with signs that read "Povremenka Must Die." It was a surreal sight: a few hundred long-haired computer geeks standing in the cold, blinking in the sunlight like vampires, demanding that the flow of data remain free. The police looked at us with confusion. We didn't fit any known category of dissident.`,
      `Today, when I hold an ultra-powerful smartphone connected to a high-speed cloud, all of this looks cute, maybe even funny. But back then, that beige box wasn't just a computer. It was a window into the big world. And I had just climbed through it.`,
      `We didn't win the tariff battle, but the market solved it for us. Broadband arrived, landlines died, and the concept of "calling a house" became obsolete.`,
      `Then came the real Internet via dial-up. It was slow and expensive. We bought scratch cards in kiosks, rationing our minutes like oxygen. We navigated by the Rambler Top100, and mostly, we went to Krovatka ("The Little Bed").`,
      `Krovatka was a legendary web chat where thousands of people met in total anonymity. It was the first time I realized the power of the avatar. In the chat room, age and muscle didn't matter. The fact that I was a skinny teenager with circles under my eyes didn't matter. Only your words mattered. I spent nights there, honing my rhetoric, typing faster than I could think.`,
      `We developed a specific kind of cynicism to filter the weak. I remember a popular joke we played on newcomers. We would type into the main chat: "System Tip: If you unplug your modem wire and plug it back in very quickly, your connection speed will double." We would watch with cruel satisfaction as user after user timed out. User_19 has left the chat. Natasha_77 has left the chat. It was a literacy test. If you fell for it, you didn't deserve the bandwidth.`,
      `But Krovatka was for the masses. The professionals sat in IRC (Internet Relay Chat). I migrated with the former Fido veterans to the channel #fidorus.`,
      `IRC was the first real example of mass real-time communication. ICQ didn't even exist yet. Looking back, it was pure technological delight--a complex network of multiple servers and clients for different systems. And, of course, it offered the ability to talk to friends 24/7. Whenever you logged in, day or night, someone was always there.`,
      `It was then that I understood that geography is a prison. When you are a child, your social horizon is limited to your courtyard. The Web cracked the wall. Suddenly, I wasn't limited to the idiots in my neighborhood. I was connected to people who spoke my language. My room became a command center. My nickname became my real name. My physical body was just a vessel for the mind that lived in the wires.`,
      `The physical world was messy, unfair, and ruled by idiots with guns. The digital world was clean, logical, and ruled by those who wrote the code. I made my choice. I moved into the machine.`,
    ],
    sourceLine: 'Excerpted from UNFRAMED, Chapter 06: The Digital Awakening. © Anton Merkurov.',
  },
  book: {
    url: '/unframed/book',
    meta: 'Private reader · Full manuscript access',
  },
  related: [
    {
      label: 'Episode 0 — The Spectral Tiger',
      href: '/unframed/spectral-tiger',
    },
    {
      label: 'Series index',
      href: '/unframed',
    },
  ],
};

export const SPECTRAL_TIGER_EPISODE: UnframedEpisode = {
  slug: 'spectral-tiger',
  number: 0,
  title: 'The Spectral Tiger',
  year: '2008',
  seriesLabel: 'A proposed six-part docuseries',
  tagline: 'A cinematic teaser and a chapter from the memoir by Anton Merkurov.',
  image: TIGER_ARTWORK,
  video: {
    url: 'https://www.youtube.com/embed/TmC6Lr5K4R8?rel=0&playsinline=1',
    title: 'UNFRAMED // Episode 0: The Spectral Tiger — official teaser',
  },
  statement:
    'Episode 0 is a short teaser for UNFRAMED — an upcoming 6-part docuseries on digital status, virtual sovereignty, and the illusion of physical boundaries.',
  chapter: {
    label: '14 — The London Shuttle',
    paragraphs: [
      '2008 was the year the world cracked. The subprime mortgage bubble burst, banks collapsed, and the global economy became a live autopsy. At RBC, the mood was grim. We were cutting budgets, firing staff, and writing reports about the end of capitalism. I had an escape route. Every evening, I would take off my suit, turn off the news, and log into a better jurisdiction: World of Warcraft.',
      "Azeroth wasn't just a game. It was a perfect behavioral model. In the real world, the rules were messy. You could work hard and still get fired. The logic was broken. In WoW, the logic was absolute. If you wanted routine, you did daily quests. For teamwork and politics, you went on a Raid. For pure capitalism, you played the market at the Auction House. It was a clean system: effort equaled reward. For a mind tired of corporate schizophrenia, it was therapy.",
      "Then I found the ultimate asset: The Spectral Tiger. It came from a loot code in a physical card game. It was rare and expensive. Crucially, the Tiger gave you no actual advantage. It wasn't faster than a standard horse. It didn't add stamina or strength. Its utility was exactly zero. Its only function was Status.",
      'I bought it on eBay for $500. In 2008, spending five hundred dollars on a digital cat was considered insanity. You could buy a used car or a lot of vodka for that money. I made the transaction without hesitation.',
      "I did it to stand in Ironforge, the main hub for the Alliance. I would summon the Tiger and just park in the center of the main square. I stood there doing absolutely nothing. Other players would run past, stop, and look. They knew the price and they knew the rarity. It was the digital equivalent of parking a yellow Ferrari on Red Square. You don't drive it to get groceries; you drive it to show that you can.",
      "While the real economy was burning outside my window, I sat on my glowing ghost tiger, radiating success. That account likely still exists on Blizzard's servers. The password is lost and the email is forgotten, but the Tiger is still there in the code. Eternal, useless, and beautiful. It was my first real lesson in the modern economy: Utility is for the poor. The real markup is always on the Air.",
      "The account with the Spectral Tiger is likely still alive somewhere in the database. Of course, since it's no longer tied to a physical card, its market value has dropped. But as an asset, it served its purpose. It taught me that in a collapsing economy, a digital ghost can be more stable than a bank account. It was a proof of concept for everything that would happen ten years later.",
    ],
    sourceLine: 'Excerpted from UNFRAMED, Chapter 14: The London Shuttle. © Anton Merkurov.',
  },
  book: {
    url: APPLE_BOOKS_URL,
    meta: '£3.99 · English · 215 pages',
  },
  related: [
    {
      label: 'View the proposal',
      href: '/unframed/proposal',
    },
  ],
};

/** Publication order: newest transmission first. */
export const UNFRAMED_EPISODES: readonly UnframedEpisode[] = [
  CONTAINER_EPISODE,
  SPECTRAL_TIGER_EPISODE,
];
