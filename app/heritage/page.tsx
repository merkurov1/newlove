import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Image from 'next/image';

const siteUrl = 'https://www.merkurov.love';

export const metadata: Metadata = {
  title: 'Heritage Archive',
  description:
    'The documented legacy of Sergey Merkurov and the archival, cultural and digital projects of his great-grandson Anton Merkurov.',
  alternates: {
    canonical: '/heritage',
    // TODO: add languages: { ru: '/ru/heritage' } once the Russian version exists
  },
  openGraph: {
    title: 'Heritage Archive — Anton Merkurov',
    description:
      'Family history, the house museum in Gyumri, the Dynamo reliefs, death masks and digital art.',
    url: `${siteUrl}/heritage`,
    siteName: 'Anton Merkurov',
    type: 'website',
    locale: 'en_US',
    // TODO: images: [{ url: '/images/heritage/og.jpg', width: 1200, height: 630 }],
  },
};

/* ------------------------------------------------------------------ */
/* DATA                                                                */
/* ------------------------------------------------------------------ */

const source = {
  museum: 'https://sergey-merkurov.mus.am/en/',
  museumArites: 'https://arites.am/en/merkulovmuseum',
  museumHistory: 'https://armenpress.am/ru/article/1118071',
  museumRestoration: 'https://www.armmuseum.ru/news-blog/2016/8/24/-8',
  gyumri: 'https://regionalpost.org/en/articles/anton-merkurov.html',
  russianLife:
    'https://russianlife.com/magazine/sep-oct-2013/the-death-artist/',
  dynamoBBC:
    'https://www.bbc.com/russian/sport/2012/03/120109_dynamo_stadium_reconstruction',
  dynamo2017: 'https://www.theartnewspaper.ru/posts/4754/',
  dynamo2019: 'https://www.theartnewspaper.ru/posts/6657/',
  dynamo2023: 'https://www.theartnewspaper.ru/posts/20230112-vrlc/',
  leninAuction:
    'https://www.themoscowtimes.com/2014/06/16/controversial-lenin-death-mask-for-sale-in-us-a36443',
  leninNFT: 'https://www.kp.ru/daily/28353.5/4499365/',
  alphabet:
    'https://provereno.media/blog/2021/07/20/pravda-li-chto-sovetskuju-eroticheskuju-azbuku-narisoval-skulptor-merkurov/',
  digitalArt:
    'https://www.theartnewspaper.com/2021/03/19/pussy-riots-weekly-nft-drop-is-just-one-instance-of-russian-and-ukrainian-artists-embracing-new-modes-of-online-selling',
  linkedin:
    'https://www.linkedin.com/posts/merkurov_from-lenins-death-mask-to-ai-art-curator-activity-7400837518541234176-qG5L',
  rodin: 'https://oms.ru/sergej-merkurov-slezy-i-krov-rodena',
};

const siteLinks = {
  azbuka: 'https://merkurov.love/azbuka/',
};

const contents: [string, string, string][] = [
  ['01', 'Family record', '#family'],
  ['02', 'Gyumri museum', '#museum'],
  ['03', 'Dynamo reliefs', '#dynamo'],
  ['04', 'Death masks', '#masks'],
  ['05', 'Digital art', '#digital'],
  ['06', 'Erotic Alphabet', '#alphabet'],
  ['07', 'Chronology', '#chronology'],
  ['08', 'Sources', '#sources'],
];

type Row = { date: string; text: ReactNode };

const museumTimeline: Row[] = [
  {
    date: '1869',
    text: 'The family house is built by Fyodor Merkurov, Sergey Merkurov’s grandfather.',
  },
  { date: '1950', text: 'Sergey Merkurov transfers the house to the city.' },
  {
    date: '1984',
    text: 'The Sergey Merkurov House-Museum opens to the public.',
  },
  {
    date: '1988',
    text: 'The earthquake damages the building. Published accounts report that it was subsequently used as temporary shelter.',
  },
  // TODO: 2003 has no source on the page. Confirm against Armenpress (source 02)
  // or the museum site before publishing, or drop the row.
  { date: '2003', text: 'The house undergoes substantial restoration.' },
  {
    date: '2012',
    text: 'Anton Merkurov visits Gyumri and meets museum staff. In a later interview he discusses the use of the internet in museum work and cultural promotion.',
  },
  {
    date: '2016',
    text: 'A report by the Armenian Museum of Moscow states that restoration of the family house began with Anton Merkurov’s active participation.',
  },
  {
    date: '2023',
    text: 'Further renovation and the museum’s reopening are reported by Armenian media.',
  },
];

const dynamoTimeline: Row[] = [
  {
    date: '2012',
    text: 'The reliefs are removed during stadium redevelopment. BBC News Russian Service reports on the campaign for their preservation and the return of the originals.',
  },
  {
    date: '2016',
    text: 'Restoration work begins, according to later reporting by The Art Newspaper Russia.',
  },
  {
    date: '2017',
    text: 'The Art Newspaper Russia reports from the restoration workshop. Anton Merkurov is quoted after visiting the workshop and commenting on the care taken with the works.',
  },
  {
    date: '2019',
    text: 'The question of where the originals should be displayed remains unresolved. Anton publicly argues that the reliefs should retain their connection to the historic stadium and remain visible to the public.',
  },
  {
    date: '2022–23',
    text: 'The originals are installed inside the renewed Dynamo complex, in the Arena Plaza area. Reporting in January 2023 describes their new display after years of restoration and uncertainty.',
  },
];

const alphabetTimeline: Row[] = [
  {
    date: '1931',
    text: 'The date inscribed on a sheet reproduced in circulated images. The original’s provenance and authorship have not been conclusively established by the cited fact-check.',
  },
  {
    date: '2020',
    text: 'Anton Merkurov organised an exhibition project around the series at Cube art space in Moscow. According to the published fact-check, a designer prepared high-resolution redrawings from low-resolution scans; a screenprint edition and postcards were also produced.',
  },
  {
    date: '2021',
    text: 'Provereno.Media published a fact-check examining the attribution, the reproduced images and the contemporary exhibition project.',
  },
];

const chronology: Row[] = [
  { date: '1869', text: 'The family house in Gyumri is built.' },
  {
    date: '1881',
    text: 'Sergey Merkurov is born in Alexandropol, now Gyumri.',
  },
  {
    date: '1905–07',
    text: 'Merkurov lives and works in Paris and studies in Auguste Rodin’s studio.',
  },
  {
    date: '1950',
    text: 'Sergey Merkurov transfers the family house to the city.',
  },
  { date: '1984', text: 'The house museum opens.' },
  { date: '1988', text: 'The earthquake damages the museum building.' },
  { date: '2003', text: 'Substantial restoration of the house museum.' },
  {
    date: '2012',
    text: 'The Dynamo reliefs are removed during stadium redevelopment. BBC reports on the campaign for their preservation. Anton Merkurov visits Gyumri and meets museum staff.',
  },
  {
    date: '2013',
    text: 'Russian Life publishes “The Death Artist”, an English-language profile of Sergey Merkurov and his legacy.',
  },
  {
    date: '2014',
    text: 'The Moscow Times reports on the proposed US sale of a Lenin death mask and Anton Merkurov’s objection.',
  },
  {
    date: '2016',
    text: 'Restoration of the family house in Gyumri begins with Anton Merkurov’s active participation, according to a report by the Armenian Museum of Moscow.',
  },
  {
    date: '2017–19',
    text: 'Reporting documents the restoration of the Dynamo reliefs and the debate over their future location.',
  },
  {
    date: '2020',
    text: 'The Erotic Alphabet exhibition project is presented at Cube art space in Moscow.',
  },
  {
    date: '2021',
    text: 'Public reporting documents the digital Lenin mask project and examines the Erotic Alphabet attribution.',
  },
  {
    date: '2022–23',
    text: 'The restored Dynamo originals are displayed inside the renewed stadium complex. Further renovation of the Gyumri museum is reported.',
  },
];

const sources: { title: string; detail: string; href: string }[] = [
  {
    title: 'Sergey Merkurov House-Museum — official website',
    detail: 'Museum and collection information.',
    href: source.museum,
  },
  {
    title: 'Armenpress — history of the house museum',
    detail:
      'The house, transfer to the city, museum opening and restoration.',
    href: source.museumHistory,
  },
  {
    title: 'Armenian Museum of Moscow — restoration of the family house',
    detail:
      '2016 report describing the start of restoration and Anton Merkurov’s participation.',
    href: source.museumRestoration,
  },
  {
    title: 'Regional Post — Anton Merkurov',
    detail: 'Interview on Gyumri, the museum and cultural communication.',
    href: source.gyumri,
  },
  {
    title: 'Russian Life — “The Death Artist”',
    detail:
      'English-language profile of Sergey Merkurov and the family legacy.',
    href: source.russianLife,
  },
  {
    title: 'BBC News Russian Service — Dynamo reliefs',
    detail: '2012 reporting on the removal and campaign for preservation.',
    href: source.dynamoBBC,
  },
  {
    title: 'The Art Newspaper Russia — restoration, 2017',
    detail: 'Reporting from the reliefs’ restoration process.',
    href: source.dynamo2017,
  },
  {
    title: 'The Art Newspaper Russia — the reliefs’ future, 2019',
    detail:
      'Reporting on the debate over where the originals should be displayed.',
    href: source.dynamo2019,
  },
  {
    title: 'The Art Newspaper Russia — the reliefs at Dynamo, 2023',
    detail:
      'Report on the originals’ display inside the renewed stadium complex.',
    href: source.dynamo2023,
  },
  {
    title: 'The Moscow Times — Lenin death mask, 2014',
    detail:
      'Reporting on a proposed US sale and Anton Merkurov’s objection.',
    href: source.leninAuction,
  },
  {
    title: 'Komsomolskaya Pravda — digital Lenin mask, 2021',
    detail: 'Interview describing the 3D and NFT project.',
    href: source.leninNFT,
  },
  {
    title: 'The Art Newspaper — digital art and online selling, 2021',
    detail: 'Commentary on new digital modes of selling art.',
    href: source.digitalArt,
  },
  {
    title: 'Provereno.Media — Erotic Alphabet fact-check, 2021',
    detail:
      'Attribution, reproduced images and the 2020 exhibition project.',
    href: source.alphabet,
  },
  {
    title: 'Anton Merkurov — first-person account on LinkedIn',
    detail: 'Family legacy, the Lenin death mask and digital art.',
    href: source.linkedin,
  },
  {
    title: 'Sergey Merkurov: Tears and Blood of Rodin',
    detail:
      'Published account of Merkurov’s years in Europe and his encounter with Rodin.',
    href: source.rodin,
  },
  {
    title: 'AriTes — Sergey Merkurov’s House-Museum',
    detail: 'Collection description: number of masks made and exhibited.',
    href: source.museumArites,
  },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Heritage Archive — Anton Merkurov',
  url: `${siteUrl}/heritage`,
  inLanguage: 'en',
  about: {
    '@type': 'Person',
    name: 'Sergey Merkurov',
    birthDate: '1881-11-07',
    birthPlace: 'Alexandropol (Gyumri)',
    jobTitle: 'Sculptor',
  },
  author: { '@type': 'Person', name: 'Anton Merkurov', url: siteUrl },
};

/* ------------------------------------------------------------------ */
/* COMPONENTS                                                          */
/* ------------------------------------------------------------------ */

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-stone-300 underline-offset-4 transition-colors hover:decoration-stone-900"
    >
      {children}
      <span aria-hidden="true" className="ml-1 text-[10px]">
        ↗
      </span>
    </a>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.17em] text-stone-500 sm:text-[11px]">
      {children}
    </p>
  );
}

function SectionTitle({
  number,
  eyebrow,
  children,
}: {
  number: string;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-8 sm:mb-10">
      <Eyebrow>
        {number} / {eyebrow}
      </Eyebrow>
      <h2 className="max-w-3xl font-[var(--font-cormorant,Georgia,serif)] text-4xl font-normal leading-[0.98] tracking-[-0.035em] text-stone-900 sm:text-5xl lg:text-6xl">
        {children}
      </h2>
    </div>
  );
}

function SourceNote({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`mt-5 text-xs leading-6 text-stone-500 ${className}`}>
      {children}
    </p>
  );
}

function TimelineRow({ date, children }: { date: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-4 border-t border-stone-200 py-5 sm:grid-cols-[105px_minmax(0,1fr)] sm:gap-8">
      <p className="pt-1 font-mono text-xs tabular-nums text-stone-500">
        {date}
      </p>
      <div className="min-w-0 text-sm leading-7 text-stone-700">{children}</div>
    </div>
  );
}

function Timeline({ rows }: { rows: Row[] }) {
  return (
    <div>
      {rows.map((r) => (
        <TimelineRow key={r.date + String(r.text).slice(0, 12)} date={r.date}>
          {r.text}
        </TimelineRow>
      ))}
    </div>
  );
}

function SourceRow({
  number,
  title,
  detail,
  href,
}: {
  number: string;
  title: string;
  detail: string;
  href: string;
}) {
  return (
    <li className="grid grid-cols-[24px_minmax(0,1fr)] gap-3 border-t border-stone-200 py-4">
      <span className="pt-1 font-mono text-[10px] text-stone-400">
        {number}
      </span>
      <div className="min-w-0">
        <p className="text-sm leading-6 text-stone-900">
          <ExternalLink href={href}>{title}</ExternalLink>
        </p>
        <p className="mt-1 text-xs leading-5 text-stone-500">{detail}</p>
      </div>
    </li>
  );
}

/**
 * Figure: renders next/image when `src` is set, otherwise a labelled
 * placeholder so the layout can be reviewed before assets exist.
 * Always fill in `credit` and `rights` — the page's whole premise is provenance.
 */
function Figure({
  src,
  alt,
  caption,
  credit,
  ratio = 'aspect-[4/3]',
  priority = false,
  className = '',
}: {
  src?: string;
  alt: string;
  caption: string;
  credit: string;
  ratio?: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <figure className={className}>
      <div className={`relative w-full overflow-hidden bg-stone-200 ${ratio}`}>
        {src ? (
          <Image
            src={src}
            alt={alt}
            fill
            priority={priority}
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center border border-dashed border-stone-400 p-4 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-stone-500">
            Image: {alt}
          </div>
        )}
      </div>
      <figcaption className="mt-3 text-xs leading-5 text-stone-500">
        {caption}{' '}
        <span className="text-stone-400">{credit}</span>
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* PAGE                                                                */
/* ------------------------------------------------------------------ */

export default function HeritagePage() {
  return (
    <main
      id="top"
      className="min-h-screen overflow-x-clip bg-[#FAF8F5] text-stone-900"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto w-full max-w-[1500px] px-5 pb-20 pt-28 sm:px-8 sm:pb-28 sm:pt-36 lg:px-12">
        {/* INTRODUCTION */}

        <section className="border-b border-stone-300 pb-10 sm:pb-14">
          <div className="mb-9 flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500">
              Anton Merkurov / Personal archive
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500">
              Family · Art · Documents
            </p>
          </div>

          <Eyebrow>Heritage / Research dossier</Eyebrow>

          <h1 className="max-w-5xl font-[var(--font-cormorant,Georgia,serif)] text-6xl font-normal leading-[0.88] tracking-[-0.055em] sm:text-8xl lg:text-[112px]">
            Objects have
            <br />
            <span className="text-stone-400">their own</span>
            <br />
            histories.
          </h1>

          <div className="mt-8 grid gap-6 sm:mt-10 sm:grid-cols-[1.2fr_0.8fr] sm:items-end">
            <p className="max-w-2xl text-base leading-7 text-stone-700 sm:text-lg sm:leading-8">
              A documented record of the legacy of sculptor Sergey Merkurov
              and the work of his great-grandson, Anton Merkurov, across
              family archives, public monuments, museum history, print and
              digital art.
            </p>
            <p className="max-w-sm text-xs leading-6 text-stone-500 sm:justify-self-end">
              Historical facts, published reporting and personal
              participation are distinguished throughout. Unresolved
              attributions are identified rather than presented as
              established facts.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            {[
              'Family archive',
              'Museum history',
              'Public monuments',
              'Digital reinterpretation',
            ].map((item) => (
              <span
                key={item}
                className="border border-stone-300 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-stone-600 sm:text-[10px]"
              >
                {item}
              </span>
            ))}
          </div>

          {/* IMAGE SLOT: hero — e.g. Lenin mask cast or Dynamo relief detail */}
          <Figure
            className="mt-10"
            ratio="aspect-[16/9]"
            priority
            alt="Hero: Merkurov work, wide crop"
            caption="TODO caption."
            credit="TODO credit / rights."
          />
        </section>

        {/* PAGE NAVIGATION — sticky, horizontal scroll on small screens */}

        {/* TODO: set top-* to the height of the site header */}
        <nav
          aria-label="On this page"
          className="sticky top-0 z-20 -mx-5 flex overflow-x-auto border-b border-stone-300 bg-[#FAF8F5]/95 px-5 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12"
        >
          {contents.map(([number, label, href]) => (
            <a
              key={number}
              href={href}
              className="flex min-h-11 shrink-0 items-center gap-2 py-2 pr-6 text-xs text-stone-600 transition-colors hover:text-black"
            >
              <span className="font-mono text-[10px] text-stone-400">
                {number}
              </span>
              <span>{label}</span>
            </a>
          ))}
        </nav>

        {/* 01 FAMILY RECORD */}

        <section
          id="family"
          className="scroll-mt-32 border-b border-stone-300 py-12 sm:py-16"
        >
          <SectionTitle number="01" eyebrow="Family record">
            Two generations.
            <br />
            Different media.
          </SectionTitle>

          <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
            <article className="border-t border-stone-300 pt-5">
              <Figure
                className="mb-6"
                ratio="aspect-[4/5]"
                alt="Portrait of Sergey Merkurov"
                caption="Sergey Merkurov. TODO date and context."
                credit="TODO credit / rights."
              />
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500">
                1881–1952 / Sculpture
              </p>
              <h3 className="mt-4 font-[var(--font-cormorant,Georgia,serif)] text-3xl leading-tight tracking-[-0.025em] sm:text-4xl">
                Sergey Dmitrievich Merkurov
              </h3>
              <p className="mt-4 text-sm leading-7 text-stone-700">
                Sergey Merkurov was born in Alexandropol, now Gyumri, on 7
                November 1881. He studied in Europe, including at the Munich
                Academy of Fine Arts, and worked in Paris from 1905 to 1907.
                There, he studied in Auguste Rodin&apos;s studio, an
                experience he later described as decisive for his
                understanding of sculpture.
              </p>
              <p className="mt-4 text-sm leading-7 text-stone-700">
                His work included monumental sculpture and posthumous masks.
                He later directed the Pushkin State Museum of Fine Arts in
                Moscow from 1944 to 1949. His legacy survives in public
                monuments, museum collections, archival materials and the
                family house in Gyumri.
              </p>
              <SourceNote>
                Sources:{' '}
                <ExternalLink href={source.rodin}>
                  Sergey Merkurov: Tears and Blood of Rodin
                </ExternalLink>
                {' · '}
                <ExternalLink href={source.museum}>
                  Sergey Merkurov House-Museum
                </ExternalLink>
              </SourceNote>
            </article>

            <article className="border-t border-stone-300 pt-5">
              <Figure
                className="mb-6"
                ratio="aspect-[4/5]"
                alt="Portrait of Anton Merkurov"
                caption="Anton Merkurov."
                credit="TODO credit."
              />
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500">
                Born 1981 / Research and contemporary projects
              </p>
              <h3 className="mt-4 font-[var(--font-cormorant,Georgia,serif)] text-3xl leading-tight tracking-[-0.025em] sm:text-4xl">
                Anton Merkurov
              </h3>
              <p className="mt-4 text-sm leading-7 text-stone-700">
                Anton Merkurov is Sergey Merkurov&apos;s great-grandson. His
                documented engagement with the family legacy includes public
                advocacy concerning the Dynamo stadium reliefs, work
                connected with the house museum in Gyumri, publication of
                family archival material, exhibition projects and the
                digitisation and artistic reinterpretation of Lenin&apos;s
                posthumous mask.
              </p>
              <p className="mt-4 text-sm leading-7 text-stone-700">
                Alongside these projects, his public record includes media
                and technology work, writing, art-market commentary and
                experimentation with digital distribution.
              </p>
              <SourceNote>
                Sources:{' '}
                <ExternalLink href={source.gyumri}>
                  Regional Post interview
                </ExternalLink>
                {' · '}
                <ExternalLink href={source.linkedin}>
                  First-person account on LinkedIn
                </ExternalLink>
              </SourceNote>
            </article>
          </div>

          {/* TODO: replace with a concrete inventory of the family archive
              (what it holds, how much, what has been published). Documented
              facts only. */}
          <div className="mt-10 border-t border-stone-200 pt-5">
            <Eyebrow>Family papers</Eyebrow>
            <p className="max-w-3xl text-sm leading-7 text-stone-700">
              The English-language magazine <em>Russian Life</em> published a
              substantial profile of the sculptor in 2013 that draws on the
              family archive.
            </p>
            <p className="mt-3 text-sm">
              <ExternalLink href={source.russianLife}>
                Russian Life — “The Death Artist”
              </ExternalLink>
            </p>
          </div>
        </section>

        {/* 02 GYUMRI MUSEUM */}

        <section
          id="museum"
          className="scroll-mt-32 border-b border-stone-300 py-12 sm:py-16"
        >
          <SectionTitle number="02" eyebrow="Gyumri, Armenia">
            The family house
            <br />
            becomes a museum.
          </SectionTitle>

          <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16">
            <div>
              <p className="text-sm leading-7 text-stone-700">
                The Sergey Merkurov House-Museum occupies the family house in
                Gyumri where the sculptor was born. Its history connects a
                nineteenth-century residence with a public collection
                devoted to his life and work.
              </p>

              <div className="mt-6 border-y border-stone-300 py-5">
                <p className="font-mono text-3xl tracking-tight">1869</p>
                <p className="mt-2 text-xs leading-6 text-stone-500">
                  The year the house was built by Sergey Merkurov&apos;s
                  grandfather, Fyodor Merkurov, according to published
                  museum histories.
                </p>
              </div>

              <p className="mt-5 text-sm leading-7 text-stone-700">
                In 1950, Sergey Merkurov transferred the house to the city.
                The museum opened in 1984. It was damaged in the 1988
                earthquake and later underwent restoration.
              </p>

              <Figure
                className="mt-8"
                alt="The Merkurov House-Museum, Gyumri"
                caption="The House-Museum, Gyumri. TODO year."
                credit="TODO credit / rights."
              />

              <p className="mt-4 text-sm">
                <ExternalLink href={source.museum}>
                  Official museum website
                </ExternalLink>
              </p>
            </div>

            <div>
              <Timeline rows={museumTimeline} />
              <SourceNote>
                Sources:{' '}
                <ExternalLink href={source.museumHistory}>
                  Armenpress
                </ExternalLink>
                {' · '}
                <ExternalLink href={source.museumRestoration}>
                  Armenian Museum of Moscow, 2016
                </ExternalLink>
                {' · '}
                <ExternalLink href={source.gyumri}>
                  Regional Post, 2017
                </ExternalLink>
              </SourceNote>
            </div>
          </div>
        </section>

        {/* 03 DYNAMO */}

        <section
          id="dynamo"
          className="scroll-mt-32 border-b border-stone-300 py-12 sm:py-16"
        >
          <SectionTitle number="03" eyebrow="Moscow / Public monuments">
            Dynamo.
            <br />
            The fate of six reliefs.
          </SectionTitle>

          <p className="max-w-3xl text-sm leading-7 text-stone-700 sm:text-base sm:leading-8">
            Six large relief panels depicting athletes decorated the
            porticos of Moscow&apos;s Dynamo stadium for decades. Their
            removal during redevelopment in 2012 triggered a public
            discussion about restoration, location and access to the
            originals. Anton Merkurov, as the sculptor&apos;s
            great-grandson, became a public voice in that discussion.
          </p>

          <div className="my-8 grid grid-cols-2 gap-4 border-y border-stone-300 py-6 sm:grid-cols-4">
            <div>
              <p className="font-mono text-3xl sm:text-4xl">6</p>
              <p className="mt-2 text-xs leading-5 text-stone-500">
                Original relief panels
              </p>
            </div>
            <div>
              <p className="font-mono text-3xl sm:text-4xl">44</p>
              <p className="mt-2 text-xs leading-5 text-stone-500">
                Athletes represented in published reporting
              </p>
            </div>
            <div>
              <p className="font-mono text-3xl sm:text-4xl">7,000+</p>
              <p className="mt-2 text-xs leading-5 text-stone-500">
                Fragments reported during restoration
              </p>
            </div>
            <div>
              <p className="font-mono text-3xl sm:text-4xl">2012→2023</p>
              <p className="mt-2 text-xs leading-5 text-stone-500">
                From removal to display of the originals
              </p>
            </div>
          </div>
          {/* TODO: confirm which of sources 07 / 09 carries 44 and 7,000+,
              then cite that one specifically instead of both. */}
          <SourceNote className="-mt-4 mb-8">
            Figures: reporting by The Art Newspaper Russia, 2017 and 2023
            (sources 07 and 09).
          </SourceNote>

          <div className="mb-8 grid gap-4 sm:grid-cols-2">
            <Figure
              alt="Dynamo relief in situ, before 2012"
              caption="A relief on the Dynamo stadium portico before removal."
              credit="TODO credit / rights."
            />
            <Figure
              alt="Dynamo relief fragments in the restoration workshop"
              caption="Restoration workshop, 2017."
              credit="TODO credit / rights."
            />
          </div>

          <Timeline rows={dynamoTimeline} />

          <div className="mt-8 border-l border-stone-400 pl-4">
            <p className="text-sm leading-7 text-stone-700">
              The reliefs were restored by specialists, including the St
              Petersburg workshop “Nasledie”. Anton Merkurov&apos;s
              documented role was public advocacy and commentary on their
              preservation and placement, not the physical restoration
              itself.
            </p>
          </div>

          <div className="mt-6 flex flex-col items-start gap-3 text-sm">
            <ExternalLink href={source.dynamoBBC}>
              BBC News Russian Service, 2012 — the campaign over the Dynamo
              reliefs
            </ExternalLink>
            <ExternalLink href={source.dynamo2017}>
              The Art Newspaper Russia, 2017 — restoration
            </ExternalLink>
            <ExternalLink href={source.dynamo2019}>
              The Art Newspaper Russia, 2019 — the debate over location
            </ExternalLink>
            <ExternalLink href={source.dynamo2023}>
              The Art Newspaper Russia, 2023 — the originals at Dynamo
            </ExternalLink>
          </div>
        </section>

        {/* 04 DEATH MASKS */}

        <section
          id="masks"
          className="scroll-mt-32 border-b border-stone-300 py-12 sm:py-16"
        >
          <SectionTitle number="04" eyebrow="Sculpture / Historical objects">
            The death mask
            <br />
            as an archive.
          </SectionTitle>

          <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16">
            <div>
              <p className="text-sm leading-7 text-stone-700">
                Sergey Merkurov is known for his posthumous masks of
                prominent historical figures. Published descriptions of the
                museum collection state that he made more than 300 masks and
                that masks of 59 political leaders and public figures were
                exhibited at the house museum, including Lenin&apos;s
                original death mask.
              </p>

              <SourceNote>
                Collection figures refer to different things: the reported
                total number of masks made by the sculptor is not the same
                as the number displayed in the museum.
              </SourceNote>

              <Figure
                className="mt-8"
                ratio="aspect-[4/5]"
                alt="Death mask from the Merkurov collection"
                caption="TODO: which mask, where held."
                credit="TODO credit / rights."
              />

              <p className="mt-4 text-sm">
                <ExternalLink href={source.museumArites}>
                  AriTes — Sergey Merkurov&apos;s House-Museum
                </ExternalLink>
              </p>
            </div>

            <div>
              <div className="border-t border-stone-300 pt-5">
                <Eyebrow>2014 / Public controversy</Eyebrow>
                <h3 className="font-[var(--font-cormorant,Georgia,serif)] text-3xl leading-tight sm:text-4xl">
                  The Lenin mask and a proposed US sale.
                </h3>
                <p className="mt-4 text-sm leading-7 text-stone-700">
                  The Moscow Times reported on a proposed sale of a Lenin
                  death mask in the United States and Anton Merkurov&apos;s
                  objection to the auction. The article documents a public
                  intervention concerning the status and commercial
                  treatment of an object associated with his
                  great-grandfather.
                </p>
                <p className="mt-3 text-sm">
                  <ExternalLink href={source.leninAuction}>
                    The Moscow Times, 16 June 2014
                  </ExternalLink>
                </p>
              </div>

              <div className="mt-8 border-t border-stone-300 pt-5">
                <Eyebrow>2013 / Family archive</Eyebrow>
                <h3 className="font-[var(--font-cormorant,Georgia,serif)] text-3xl leading-tight sm:text-4xl">
                  An international record.
                </h3>
                <p className="mt-4 text-sm leading-7 text-stone-700">
                  “The Death Artist”, published in Russian Life, places
                  Sergey Merkurov&apos;s masks and work within the wider
                  history of the sculptor and his family archive. It is one
                  of the English-language publications documenting this
                  legacy.
                </p>
                <p className="mt-3 text-sm">
                  <ExternalLink href={source.russianLife}>
                    Read the article
                  </ExternalLink>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 05 DIGITAL */}

        <section
          id="digital"
          className="scroll-mt-32 border-b border-stone-300 py-12 sm:py-16"
        >
          <SectionTitle number="05" eyebrow="Digitisation / Contemporary art">
            From a historical cast
            <br />
            to a digital artwork.
          </SectionTitle>

          <p className="max-w-3xl text-sm leading-7 text-stone-700 sm:text-base sm:leading-8">
            In 2021, Anton Merkurov discussed a project based on a 3D
            digitisation of Lenin&apos;s posthumous mask. The project
            brought a historical sculptural object into the context of
            animation and NFT distribution. The published account describes
            a collaborative production involving other creative and
            technical contributors.
          </p>

          <div className="my-8 grid gap-0 border-y border-stone-300 sm:grid-cols-3 sm:divide-x sm:divide-stone-300">
            {[
              [
                '01 / Object',
                'Historical cast',
                'A posthumous mask associated with Sergey Merkurov’s sculptural practice.',
              ],
              [
                '02 / Process',
                '3D digitisation',
                'Photographic capture was used to construct a three-dimensional model, as described in the published interview.',
              ],
              [
                '03 / Interpretation',
                'Animation and NFT',
                'The concept included an animated mask in which Lenin opens his eyes and is gradually covered by grass.',
              ],
            ].map(([label, title, text], i) => (
              <div
                key={label}
                className={`py-5 ${
                  i === 0
                    ? 'sm:pr-5'
                    : i === 1
                      ? 'border-t border-stone-300 sm:border-t-0 sm:px-5'
                      : 'border-t border-stone-300 sm:border-t-0 sm:pl-5'
                }`}
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500">
                  {label}
                </p>
                <h3 className="mt-3 text-lg">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-stone-600">{text}</p>
              </div>
            ))}
          </div>

          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            <Figure
              alt="Physical cast of the mask"
              caption="Object."
              credit="TODO credit."
            />
            <Figure
              alt="3D model render"
              caption="Model."
              credit="TODO credit."
            />
            <Figure
              alt="Still from the animation"
              caption="Animation still."
              credit="TODO credit."
            />
          </div>

          <p className="max-w-3xl text-sm leading-7 text-stone-700">
            One specific transformation: from a physical historical object
            to a digital model and then to an animated artwork. Technical
            details are attributed to published reporting.
          </p>

          <div className="mt-6 flex flex-col items-start gap-3 text-sm">
            <ExternalLink href={source.leninNFT}>
              Komsomolskaya Pravda, November 2021 — interview about the
              digital mask project
            </ExternalLink>
            <ExternalLink href={source.digitalArt}>
              The Art Newspaper, March 2021 — digital art and new modes of
              online selling
            </ExternalLink>
            <ExternalLink href={source.linkedin}>
              Anton Merkurov — “From Lenin’s death mask to AI art curator”
            </ExternalLink>
          </div>
        </section>

        {/* 06 EROTIC ALPHABET */}

        <section
          id="alphabet"
          className="scroll-mt-32 border-b border-stone-300 py-12 sm:py-16"
        >
          <SectionTitle number="06" eyebrow="Print / Attribution / Exhibition">
            The Erotic Alphabet,
            <br />
            1931.
          </SectionTitle>

          <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16">
            <div>
              <p className="text-sm leading-7 text-stone-700">
                Images of an erotic alphabet dated 1931 have circulated
                online with an attribution to Sergey Merkurov. A reproduced
                sheet bears an inscription reading “Рисовал С. Д. Меркуров
                17-Х-931 г.”
              </p>
              <p className="mt-4 text-sm leading-7 text-stone-700">
                The attribution remains qualified. In an interview with
                Provereno.Media, Anton Merkurov said he had not personally
                handled the original. He considered the reproduced
                signature consistent with Sergey Merkurov&apos;s
                handwriting, based on his familiarity with family archival
                material.
              </p>

              {/* Check rights and content suitability before publishing */}
              <Figure
                className="mt-8"
                alt="Reproduced sheet with the 1931 inscription"
                caption="Reproduced sheet bearing the inscription."
                credit="TODO credit / rights."
              />
            </div>

            <div>
              <Timeline rows={alphabetTimeline} />

              <div className="mt-6 border-l border-stone-400 pl-4">
                <p className="text-xs leading-6 text-stone-500">
                  Editorial distinction: the contemporary exhibition and
                  reproductions are documented projects. They do not, by
                  themselves, establish the provenance or authorship of the
                  original 1931 sheets.
                </p>
              </div>

              <p className="mt-5 text-sm">
                <ExternalLink href={source.alphabet}>
                  Provereno.Media — fact-check on the Erotic Alphabet
                </ExternalLink>
              </p>
              <p className="mt-3 text-sm">
                <ExternalLink href={siteLinks.azbuka}>
                  Explore the project archive
                </ExternalLink>
              </p>
            </div>
          </div>
        </section>

        {/* 07 CHRONOLOGY */}

        <section
          id="chronology"
          className="scroll-mt-32 border-b border-stone-300 py-12 sm:py-16"
        >
          <SectionTitle number="07" eyebrow="Chronology">
            A record of events,
            <br />
            not a family legend.
          </SectionTitle>
          <Timeline rows={chronology} />
        </section>

        {/* 08 SOURCES */}

        <section id="sources" className="scroll-mt-32 py-12 sm:py-16">
          <SectionTitle number="08" eyebrow="Sources and verification">
            Follow the evidence.
          </SectionTitle>

          <p className="mb-8 max-w-2xl text-sm leading-7 text-stone-600">
            The following institutional pages, interviews and publications
            support the historical statements and project descriptions on
            this page.
          </p>

          <ol>
            {sources.map((s, i) => (
              <SourceRow
                key={s.href}
                number={String(i + 1).padStart(2, '0')}
                title={s.title}
                detail={s.detail}
                href={s.href}
              />
            ))}
          </ol>

          <div className="mt-10 border-t border-stone-300 pt-5">
            <p className="max-w-3xl text-xs leading-6 text-stone-500">
              This is a working historical record. Where the original
              object, provenance or authorship has not been conclusively
              established by the cited sources, the page preserves that
              distinction. Personal participation is described separately
              from the work of institutions, restorers and collaborators.
            </p>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-300 pt-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500">
            Anton Merkurov / Heritage archive
          </p>
          <a
            href="#top"
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500 hover:text-stone-900"
          >
            Back to top ↑
          </a>
        </div>
      </div>
    </main>
  );
}
