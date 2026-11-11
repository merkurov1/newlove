/**
 * UNFRAMED episode data.
 *
 * This is a data model, not a universal page template: each episode keeps its
 * own composition. Only the published Episode 0 is listed here.
 *
 * The Spectral Tiger passage is published from the manuscript source at
 * app/unframed/Unframed.markdown (Chapter 14: The London Shuttle, 2008).
 * Wording is intentionally verbatim; do not rewrite or expand it.
 */

export type UnframedEpisode = {
  slug: string;
  number: number;
  title: string;
  year: string;
  seriesLabel: string;
  tagline: string;
  image: string;
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

export const SPECTRAL_TIGER_EPISODE: UnframedEpisode = {
  slug: 'spectral-tiger',
  number: 0,
  title: 'The Spectral Tiger',
  year: '2008',
  seriesLabel: 'A proposed six-part docuseries',
  tagline: 'A cinematic teaser and a chapter from the memoir by Anton Merkurov.',
  image: TIGER_ARTWORK,
  video: {
    url: 'https://www.youtube.com/embed/VojUgJmk5I0?rel=0&playsinline=1',
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
    sourceLine:
      'Excerpted from UNFRAMED, Chapter 14: The London Shuttle. © Anton Merkurov.',
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

export const UNFRAMED_EPISODES: readonly UnframedEpisode[] = [SPECTRAL_TIGER_EPISODE];
