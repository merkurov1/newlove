# SEO / AI-crawler audit

Canonical host: `https://www.merkurov.love` (the `next.config.js` redirect already
sends `merkurov.love` here). Identity spelling: **Anton Merkurov**, **Sergey Merkurov**.

## Route inventory

Public, indexable routes in the app router:

```
/
/lobby
/advising                     /advising/request (form, noindex)
/journal                      /journal/[slug]
/heritage
/media                        /media/record/[slug] (new)
/heartandangel                /heartandangel/about
/heartandangel/world          /heartandangel/calm
/heartandangel/letitgo        /heartandangel/NFT
/heartandangel/card           /heartandangel/card/success (transactional)
/unframed                     /unframed/book
/flow                         /flow/[slug]             /flow/join
/selection                    /selection/[slug]
/[slug]                       (articles and projects)
/isakeyforall
/research                     /research/novayagazeta2025
/silence
/tags                         /tags/[slug]
/lots                         /lots/[id]
/art-engine                   /art-engine/lots (admin, noindex)
/case-study/fontana           /case-study/garcia       /case-study/pivovarov
/communications
/2025
/all                          /all/map (noindex)
/cast
/temple
/tribute
/vigil
/absolution
/quiz/guess-estimate
/liveheart                    /liveheart/stat           /liveheart/tv
/liveheart/[slug]
/letters                      /letters/[slug] (canonical -> /journal)
/digest/[slug]
```

Private / excluded from the index: `/admin/*`, `/api/*`, `/auth/*`, `/login`,
`/register`, `/onboard/*`, `/profile`, `/users`, `/you/*`, `/kit`, `/roles-demo`,
`/debug-auth`, `/journal/*/full`, `/letters/*/full`, `/temple/whispers`,
`/research/telegram/*`, `/unframed/debug`.

## Before (audited source revision)

| Route | Title | Description | Canonical | og:image | JSON-LD | In sitemap |
|---|---|---|---|---|---|---|
| `/` | Anton Merkurov \| Art x Love x Money | 97 chars | `https://www.merkurov.love` (root) | global Supabase image | large `@graph` (WebSite/Person/Organization/ProfilePage) | yes |
| `/lobby` | Private Office & Access \| Anton Merkurov | 44 chars | `/lobby`* | global image | none | yes |
| `/advising` | Anton Merkurov — Advising & High-Stakes Counsel | 107 chars | `/advising` | Advising photo | none | yes |
| `/journal` | Journal \| Merkurov | 75 chars | `/journal` | none (inherited) | none | yes |
| `/journal/[slug]` | post title, untruncated | first 160 chars of body | `/journal/slug` | first image or none | none | yes (via letters) |
| `/heritage` | Heritage Archive — Sergey & Anton Merkurov | 157 chars | `/heritage` | TheThinker.jpg | WebPage graph with Person | yes |
| `/media` | Media Archive — Anton Merkurov | 161 chars | `/media` | `/media/opengraph-image` | none | yes |
| `/media/record/*` | — | — | — | — | — | **missing route (404)** |
| `/heartandangel` | Heart & Angel \| Anton Merkurov | 158 chars | `/heartandangel` | World.png | none | yes |
| `/unframed` | UNFRAMED - Memoir by Anton Merkurov | 88 chars | `/unframed` | cover | Book (no sameAs) | yes |
| `/flow` | Flow — Anton Merkurov | 80 chars | `/flow` | none | none | yes |
| `/selection` | Selection & Chronicles \| Anton Merkurov | 100 chars | `/selection` | none | none | yes |
| `/feed` | none (inherits root) | none | none | none | none | no |
| `/tags` | Tags \| Anton Merkurov | 32 chars | `/tags` | none | none | no |
| `/lots` | Curator Vault \| Auction Lots | 68 chars | `/lots` | none | none | no |
| `/stat` | — | — | — | — | — | **404 in sitemap** |
| `/projects` | — | — | — | — | — | **404 in sitemap** |

\* The reported `/lobby` bug (canonical/og:url/og:title resolving to the homepage)
could not be reproduced in the checked source revision, but the root layout did own
a canonical and an `og:url`, so any page whose metadata failed to override them
would inherit the homepage. The root no longer sets either value.

Other systemic issues found:

- Root layout set `alternates.canonical`, `openGraph.url`, `og:image:alt: "…Unframed"`.
- `SearchAction` pointed to `/flow?q=` although Flow has no search endpoint.
- `/media/record/<slug>` was linked from data but had no route.
- Sitemap contained `/stat` and `/projects`, both 404.
- `/letters` and `/journal` served the same `letters` rows under two canonicals.
- `/feed` duplicate of `/flow`, with links to non-existent `/{lang}/{slug}` paths.
- `/tags` was an empty “choose a tag” page with no tag links.
- `/heartandangel/NFT` was `ssr:false`, so the initial HTML had no content or h1.
- `/cast`, `/temple`, `/vigil`, `/liveheart/tv` had no `<h1>`.
- Page components rendered nested `<main>` inside the layout `<main>`.
- No `robots.ts` entry for several named AI crawlers, no `/llms.txt`, no `/feed.xml`.
- No markdown twins, no sitemap alternates, no per-page OG image.

## After

| Route | Title (≤60) | Description (120–160) | Canonical / og:url | OG image | JSON-LD | Sitemap |
|---|---|---|---|---|---|---|
| `/` | Anton Merkurov — Art, Love & Money (34) | 125 | self | `/og?title=…` | WebSite, Person, Organization, ProfilePage, Breadcrumb | yes |
| `/lobby` | Private Office & Access \| Anton Merkurov (40) | 121 | self | `/og?title=…` | ProfilePage, Breadcrumb (+ site entities) | yes |
| `/advising` | Advising & High-Stakes Counsel \| Anton Merkurov (47) | 125 | self | `/og?title=…` | ProfessionalService, Breadcrumb | yes |
| `/journal` | Journal — Chronicles of the Unframed \| Anton Merkurov (53) | 123 | self | `/og?title=…` | CollectionPage, Breadcrumb | yes |
| `/journal/[slug]` | data title, truncated to 60 | data summary, padded to ≥120 | self | first image or `/og` | Article, Breadcrumb | yes |
| `/heritage` | Heritage Archive — Sergey & Anton Merkurov (42) | ≥120 | self | TheThinker.jpg | Person (Sergey, 1881–1952), CollectionPage, Breadcrumb | yes |
| `/media` | Media Archive — Interviews & Commentary \| Anton Merkurov (56) | 143 | self | `/og?title=…` | CollectionPage, Breadcrumb | yes |
| `/media/record/[slug]` | record title, ≤60 | record summary / generated, ≥120 | self | `/og?title=…` | Article **or** CreativeWork with `citation` + `isBasedOn`, Breadcrumb | yes |
| `/heartandangel` | Heart & Angel — A Living Digital Mythology (42) | 133 | self | World.png | CollectionPage + 3× VisualArtwork, Breadcrumb | yes |
| `/heartandangel/about` | About Heart & Angel \| A Living Digital Mythology (48) | 124 | self | World.png | CreativeWork, Breadcrumb | yes |
| `/heartandangel/world` | World \| Heart & Angel \| Anton Merkurov (38) | ≥120 | self | World.png | VisualArtwork, Breadcrumb | yes |
| `/heartandangel/calm` | Keep Calm — Digital Temple \| Merkurov Love (42) | ≥120 | self | Heart1.png | VisualArtwork, Breadcrumb | yes |
| `/heartandangel/letitgo` | Let It Go — Digital Temple (26) | ≥120 | self | IMG_0919.png | VisualArtwork, Breadcrumb | yes |
| `/heartandangel/NFT` | The Irreversible Choice — Heart & Angel NFT | ≥120 | self | IPFS artwork | site entities, Breadcrumb (page content now SSR) | yes |
| `/unframed` | UNFRAMED — A Memoir by Anton Merkurov | 120 | self | cover | Book with `sameAs` (Apple Books, B&N) | yes |
| `/unframed/book` | Read UNFRAMED — Full Book \| Anton Merkurov | 137 | self | cover | Book via parent | yes |
| `/flow` | Flow — Notes, Signals & Artifacts \| Anton Merkurov | 125 | self | `/og?title=…` | CollectionPage, Breadcrumb | yes |
| `/flow/[slug]` | item title, ≤60 | item body, ≤160 | self | item image or `/og` | BlogPosting (Article subtype), Breadcrumb | yes |
| `/selection` | Selection — Curated Art & Chronicles \| Anton Merkurov | 122 | self | `/og?title=…` | CollectionPage, Breadcrumb | yes |
| `/selection/[slug]` | artist — title, ≤60 | curator note / quote, ≥120 | self (bug fix: previously og:url was `/{slug}`) | artwork | Article, Breadcrumb | no (consolidated on `/[slug]`) |
| `/[slug]` | article/project title, ≤60 | generated, ≥120 | self | content image or `/og` | Article/AboutPage/Service/WebPage + Breadcrumb | yes |
| `/isakeyforall` | Love Is a Key for All — About Anton Merkurov | 145 | self | `/og?title=…` | ProfilePage, Breadcrumb | yes |
| `/research` | The Merkurov Doctrine — Research Archive | 152 | self | logo.png | CollectionPage, Breadcrumb | yes |
| `/research/novayagazeta2025` | From Content Censorship to Hardware Hegemony | 158 | self | `/og?title=…` | Article, Breadcrumb | yes |
| `/silence` | The Silence Index — Heritage vs Noise \| Anton Merkurov | 155 | self | `/og?title=…` | CreativeWork, Breadcrumb | yes |
| `/tags` | Tags — Browse the Archive by Topic \| Anton Merkurov | 133 | self | `/og?title=…` | CollectionPage, Breadcrumb | yes |
| `/tags/[slug]` | tag name, ≤60 | tag description, ≥120 | self | `/og?title=…` | site entities, Breadcrumb | yes |
| `/lots` | Curator Vault — Auction Lots \| Anton Merkurov | 144 | self | `/og?title=…` | CollectionPage, Breadcrumb | yes |
| `/lots/[id]` | artist — title, ≤60 | lot summary, ≥120 | self | lot image or `/og` | VisualArtwork, Breadcrumb | yes |
| `/art-engine` | Curator Engine — Art Market Intelligence \| Merkurov | 148 | self | `/og?title=…` | CreativeWork, Breadcrumb | yes |
| `/case-study/*` | case-study title | case-study summary | self | artwork | Article (garcia) / page entities | yes |
| `/communications` | History of Communication — Visual Lecture | 132 | self | `/og?title=…` | CreativeWork, Breadcrumb | yes |
| `/2025` | 2025 — Year Review \| Anton Merkurov | 126 | self | `/og?title=…` | site entities | yes |
| `/all` | All Projects — Index \| Anton Merkurov | 135 | self | `/og?title=…` | CollectionPage, Breadcrumb | yes |
| `/cast` | Cast — Psychological Protocol \| Digital Temple | 120 | self | `/og?title=…` | site entities; visible h1 added | yes |
| `/temple` | The Sanctuary — Digital Temple \| Merkurov Love | 120 | self | Angel1.png | site entities; visible h1 added | yes |
| `/tribute` | Tribute — Digital Temple | 119 | self | Heart1.png | site entities | yes |
| `/vigil` | Vigil — Digital Temple | 119 | self | IMG_0966.gif | site entities; visible h1 added | yes |
| `/absolution` | Absolution — Digital Temple \| Merkurov Love | 120 | self | IMG_0947.png | site entities | yes |
| `/quiz/guess-estimate` | Auction Estimate Quiz \| Anton Merkurov | 56→ helper | self | `/og?title=…` | site entities | yes |
| `/liveheart` | LiveHeart — Imprint Your Chaos \| Anton Merkurov | 137 | self | `/og?title=…` | site entities | yes |
| `/liveheart/stat` | LiveHeart Statistics — Artifact Patterns | 134 | self | `/og?title=…` | site entities | yes |
| `/liveheart/tv` | LiveHeart TV — Generative Heart Display | 130 | self | `/og?title=…` | site entities; visible h1 added | yes |
| `/letters` | Letters Archive \| Anton Merkurov | 131 | `/journal` | `/og` | site entities | no (consolidated) |
| `/letters/[slug]` | issue title | issue summary | `/journal/[slug]` | issue image | site entities | no (consolidated) |
| `/digest/[slug]` | digest title ≤60 | digest text ≥120 | self | `/og?title=…` | Article, Breadcrumb | no (no public index) |
| `/feed` | — | — | 308 → `/flow` | — | — | no |

## Crawling files

- `app/sitemap.ts`: static public routes + Supabase articles, Flow items, journal
  letters, tags, lots and all media records; `lastModified` where known;
  bilingual routes carry en/ru/x-default alternates (same URL until separate
  RU/EN URLs exist — see `TODO(anton)`).
- `app/robots.ts`: allows all public content, disallows only admin/api/auth/draft
  and the 3D debug page; explicitly lists GPTBot, OAI-SearchBot, ChatGPT-User,
  ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot, Google-Extended,
  Applebot-Extended and CCBot.
- `/llms.txt` and `/llms-full.txt` are generated from `data/media.ts`, Supabase
  journal/Flow data and the shared route list.
- `/feed.xml` is the canonical Journal RSS feed; `/rss.xml` permanently
  redirects there, while `/flow/rss` is the separate Flow feed.
  `<link rel="alternate">` is emitted by `pageMetadata`.
- Markdown twins: `/path.md` and `Accept: text/markdown` are rewritten by
  `middleware.ts` to `/api/markdown`, which server-renders the page and converts
  the main content with Turndown.

## Remaining TODO(anton)

1. **Substack URL** — no official Substack link exists in the repository. Add it
   to `EBOOK_LINKS` / Book `sameAs` when confirmed (`app/unframed/layout.tsx`).
2. **Separate RU/EN URLs** — most pages are bilingual on one URL. Sitemap
   alternates currently point en/ru to the same URL. Add real counterpart URLs
   when the RU/EN split ships (`app/sitemap.ts`).
3. **Media record gaps** — some records have no publication day or summary;
   they fall back to the archive creation date and a generated summary. Fill in
   `data/media.ts` or the Supabase `media_archive_records` table.
4. **Page-specific OG artwork** — pages without a real photograph use the
   generated `/og` card. Supply dedicated 1200×630 artwork where it exists.
5. **SearchAction** — intentionally omitted: there is no site-wide search
   endpoint. `/media?q=` only searches the media archive.
6. **Anton Merkurov portrait** — the global Person image is the existing
   `og-image.png`; replace it with a verified portrait when available.
7. **Historical facts** — only dates already present in the code were used
   (Sergey Merkurov 1881–1952, birth 1881-11-07, death 1952-06-08). Verify the
   day-level dates against the museum record before treating them as final.
8. **`/letters` vs `/journal`** — consolidated with canonical, but the pages
   still render different representations of the same issue. Decide whether to
   redirect `/letters/*` permanently.
9. **Lint** — the repository ESLint config fails on every JSX file with
   `react/react-in-jsx-scope` (pre-existing). `next.config.js` ignores ESLint
   during builds. This audit did not change lint configuration.

## Decisions not taken

- No visual redesign of the hero; the homepage intro is a visible section in the
  same palette and type system.
- No invented social profiles, awards, addresses, ISBNs or Substack links.
- No `noindex` on public pages. `noindex` is limited to not-found metadata,
  private app surfaces already marked before, and admin routes.
- No `hreflang` between URLs that do not exist.
- No automatic redirect of `/letters/*` yet because the archive UI is not
  identical to the journal article UI.
