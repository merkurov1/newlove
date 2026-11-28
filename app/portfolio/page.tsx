import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import SaveAsPdfButton from '@/components/portfolio/SaveAsPdfButton';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  MEDIUM_SEQUENCE,
  PORTFOLIO_IMAGES,
  STATEMENT,
  HEART_AND_ANGEL,
  MOVEMENTS,
  TEMPLE,
  SHARED_WORLD,
  OTHER_PROJECTS,
  BIOGRAPHY,
  CONTACT,
  type PortfolioImage,
} from '@/lib/portfolio/content';
import { pageMetadata, ROUTE_COPY } from '@/lib/seo';
import { breadcrumbJsonLd, collectionPageJsonLd, creativeWorkJsonLd } from '@/lib/structuredData';
import styles from './portfolio.module.css';

const copy = ROUTE_COPY['/portfolio'];

export const metadata: Metadata = pageMetadata({
  ...copy,
  path: '/portfolio',
  type: 'website',
  imageWidth: 2136,
  imageHeight: 1383,
  languages: {
    'x-default': '/portfolio',
    en: '/portfolio',
  },
  keywords: [
    'Anton Merkurov',
    'artist portfolio',
    'Heart & Angel',
    'contemporary painting',
    'drawing',
    'public art',
    'digital art',
    'Digital Temple',
    'artist residency',
    'open call',
    'gallery',
  ],
});

type FigureProps = {
  image: PortfolioImage;
  className?: string;
  sizes: string;
  preload?: boolean;
};

function Figure({ image, className = '', sizes, preload = false }: FigureProps) {
  return (
    <figure className={`${styles.figure} ${className}`.trim()}>
      <div className={styles.imageFrame}>
        <Image
          src={image.src}
          alt={image.alt}
          width={image.width}
          height={image.height}
          sizes={sizes}
          quality={84}
          preload={preload}
        />
      </div>
      <figcaption className={styles.caption}>{image.caption}</figcaption>
    </figure>
  );
}

function SectionLabel({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <div className={styles.sectionLabel}>
      <span>{children}</span>
      <span aria-hidden="true">{index}</span>
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <div className={styles.page} data-portfolio-page>
      <SaveAsPdfButton />

      <JsonLd
        data={collectionPageJsonLd({
          path: '/portfolio',
          name: 'Anton Merkurov — Selected Works',
          description: copy.description,
          items: [
            { name: 'Heart & Angel', url: '/heartandangel' },
            { name: 'The Temple', url: '/temple' },
            { name: 'UNFRAMED', url: '/unframed' },
            { name: 'Heritage Archive', url: '/heritage' },
            { name: 'Media Archive', url: '/media' },
          ],
        })}
      />
      <JsonLd
        data={creativeWorkJsonLd({
          path: '/portfolio#heart-and-angel',
          name: 'Heart & Angel',
          description:
            'An evolving artistic universe by Anton Merkurov, begun in 2015: painting, drawing, physical objects, public space, digital environments and the Temple.',
          datePublished: '2015',
          image: PORTFOLIO_IMAGES.world.src,
          genre: 'Contemporary art',
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Portfolio', path: '/portfolio' },
        ])}
      />

      <article>
        <header className={styles.cover} id="top">
          <div className={styles.coverText}>
            <p className={styles.eyebrow}>Portfolio · Selected works</p>
            <h1 className={styles.name}>
              <span>Anton</span> <span>Merkurov</span>
            </h1>
            <p className={styles.coverTitle}>Selected Works</p>
            <p className={styles.coverLede}>
              An independent artistic practice moving between painting, drawing, physical objects,
              public space and digital environments. At its centre is <em>Heart &amp; Angel</em>, an
              evolving artistic universe begun in 2015.
            </p>
            <p className={styles.formula}>Made from the heart. Built with intention and craft.</p>
            <nav className={styles.coverNav} aria-label="Portfolio sections">
              <a href="#statement">Statement</a>
              <a href="#heart-and-angel">Heart &amp; Angel</a>
              <a href="#temple">The Temple</a>
              <a href="#biography">Biography</a>
              <a href="#contact">Contact</a>
            </nav>
            <p className={styles.coverMeta}>
              Painting · Drawing · Objects · Public space · Digital · Ritual
            </p>
          </div>

          <Figure
            image={PORTFOLIO_IMAGES.heroPainting}
            className={styles.coverFigure}
            sizes="(max-width: 900px) 100vw, 52vw"
            preload
          />
        </header>

        <section className={styles.statement} id="statement" aria-labelledby="statement-title">
          <SectionLabel index="01">Artist statement</SectionLabel>
          <div className={styles.statementGrid}>
            <h2 className={styles.statementLead} id="statement-title">
              {STATEMENT.lead}
            </h2>
            <div className={styles.bodyCopy}>
              {STATEMENT.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              <p className={styles.pull}>
                Image becomes object. Object enters public space. Public space becomes a digital
                environment. The digital environment becomes a sacred space. The sacred space opens
                toward a shared world.
              </p>
            </div>
          </div>
        </section>

        <section
          className={styles.chapter}
          id="heart-and-angel"
          aria-labelledby="heart-and-angel-title"
        >
          <div className={styles.chapterHeader}>
            <SectionLabel index="02">The centre</SectionLabel>
            <div className={styles.chapterTitleRow}>
              <div>
                <h2 className={styles.chapterTitle} id="heart-and-angel-title">
                  {HEART_AND_ANGEL.title}
                </h2>
                <p className={styles.chapterSubtitle}>{HEART_AND_ANGEL.subtitle}</p>
              </div>
              <p className={styles.year}>{HEART_AND_ANGEL.year}</p>
            </div>
            <p className={styles.chapterLede}>{HEART_AND_ANGEL.lead}</p>
            <blockquote className={styles.motto}>
              <p>“{HEART_AND_ANGEL.motto}”</p>
            </blockquote>
          </div>

          <div className={styles.chapterIntro}>
            {HEART_AND_ANGEL.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>

          <ol className={styles.sequence} aria-label="The development of Heart & Angel">
            {MEDIUM_SEQUENCE.map((medium, index) => (
              <li key={medium}>
                <span className={styles.sequenceIndex} aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span>{medium}</span>
              </li>
            ))}
          </ol>

          <figure className={styles.worldFigure}>
            <div className={styles.worldFrame}>
              <Image
                src={PORTFOLIO_IMAGES.world.src}
                alt={PORTFOLIO_IMAGES.world.alt}
                width={PORTFOLIO_IMAGES.world.width}
                height={PORTFOLIO_IMAGES.world.height}
                sizes="(max-width: 1200px) 100vw, 1200px"
                quality={88}
              />
            </div>
            <figcaption className={styles.caption}>{PORTFOLIO_IMAGES.world.caption}</figcaption>
          </figure>
        </section>

        {MOVEMENTS.map((movement) => (
          <section
            key={movement.id}
            className={`${styles.movement} ${styles[`movement_${movement.layout}`]}`}
            id={movement.id}
            aria-labelledby={`${movement.id}-title`}
          >
            <div className={styles.movementHeader}>
              <p className={styles.movementIndex} aria-hidden="true">
                {movement.index}
              </p>
              <div>
                <p className={styles.movementMedium}>{movement.medium}</p>
                <h2 className={styles.movementTitle} id={`${movement.id}-title`}>
                  {movement.title}
                </h2>
              </div>
            </div>

            {movement.layout === 'objects' ? (
              <>
                <div className={styles.objectsIntro}>
                  <div className={styles.bodyCopy}>
                    {movement.body.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </div>
                <div className={styles.objectStrip}>
                  <Figure
                    image={PORTFOLIO_IMAGES.tshirts}
                    className={styles.objectTshirts}
                    sizes="(max-width: 900px) 100vw, 45vw"
                  />
                  <Figure
                    image={PORTFOLIO_IMAGES.mug}
                    className={styles.objectMug}
                    sizes="(max-width: 900px) 50vw, 24vw"
                  />
                  <Figure
                    image={PORTFOLIO_IMAGES.postcards}
                    className={styles.objectPostcards}
                    sizes="(max-width: 900px) 50vw, 24vw"
                  />
                </div>
              </>
            ) : movement.layout === 'public' ? (
              <>
                <div className={styles.publicIntro}>
                  <div className={styles.bodyCopy}>
                    {movement.body.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                  <Figure
                    image={PORTFOLIO_IMAGES.streetSticker}
                    className={styles.streetSticker}
                    sizes="(max-width: 900px) 70vw, 20vw"
                  />
                </div>
                <Figure
                  image={PORTFOLIO_IMAGES.graffiti}
                  className={styles.graffitiFigure}
                  sizes="100vw"
                />
              </>
            ) : movement.layout === 'digital' ? (
              <>
                <div className={styles.digitalIntro}>
                  <div className={styles.bodyCopy}>
                    {movement.body.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                  <div className={styles.digitalArtifacts}>
                    <Figure
                      image={PORTFOLIO_IMAGES.stickerSheet}
                      className={styles.stickerSheet}
                      sizes="(max-width: 900px) 100vw, 34vw"
                    />
                    <Figure
                      image={PORTFOLIO_IMAGES.candle}
                      className={styles.candleFigure}
                      sizes="(max-width: 900px) 70vw, 24vw"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className={styles.imageGrid}>
                <div className={styles.imageGridCopy}>
                  <div className={styles.bodyCopy}>
                    {movement.body.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </div>
                <div className={styles.imageGridFigures}>
                  {movement.images.map((imageKey) => (
                    <Figure
                      key={imageKey}
                      image={PORTFOLIO_IMAGES[imageKey]}
                      className={styles.imageGridFigure}
                      sizes="(max-width: 900px) 100vw, 32vw"
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        ))}

        <section className={styles.temple} id="temple" aria-labelledby="temple-title">
          <div className={styles.templeHeader}>
            <SectionLabel index="03">Sacred space</SectionLabel>
            <h2 className={styles.templeTitle} id="temple-title">
              {TEMPLE.title}
            </h2>
            <p className={styles.templeSubtitle}>{TEMPLE.subtitle}</p>
          </div>

          <div className={styles.templeTriptych}>
            {TEMPLE.images.map((imageKey, index) => (
              <Figure
                key={imageKey}
                image={PORTFOLIO_IMAGES[imageKey]}
                className={`${styles.templeFigure} ${styles[`templeFigure${index}`]}`}
                sizes="(max-width: 900px) 100vw, 30vw"
              />
            ))}
          </div>

          <div className={styles.templeBody}>
            <div className={styles.templeCopy}>
              {TEMPLE.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>

            <dl className={styles.templeElements}>
              {TEMPLE.elements.map((element) => (
                <div key={element.title}>
                  <dt>{element.title}</dt>
                  <dd>{element.body}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className={styles.templeFoot}>
            <p className={styles.templeRitualLabel}>Rituals</p>
            <ul className={styles.rituals}>
              {TEMPLE.rituals.map((ritual) => (
                <li key={ritual.title}>
                  <Link href={ritual.href}>{ritual.title}</Link>
                </li>
              ))}
            </ul>
            <Link className={styles.templeLink} href="/temple">
              Enter the Temple <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </section>

        <section
          className={styles.sharedWorld}
          id="shared-world"
          aria-labelledby="shared-world-title"
        >
          <div className={styles.sharedWorldTop}>
            <SectionLabel index="04">Next chapter</SectionLabel>
            <p className={styles.status}>{SHARED_WORLD.status}</p>
          </div>
          <div className={styles.sharedWorldGrid}>
            <div>
              <h2 className={styles.sharedWorldTitle} id="shared-world-title">
                {SHARED_WORLD.title}
              </h2>
              <div className={styles.sharedWorldCopy}>
                {SHARED_WORLD.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </div>
            <div className={styles.sharedWorldComposition} aria-hidden="true">
              <div className={styles.sharedWorldOrbit} />
              <p>{SHARED_WORLD.words[0]}</p>
              <p>{SHARED_WORLD.words[1]}</p>
              <p>{SHARED_WORLD.words[2]}</p>
            </div>
          </div>
        </section>

        <section
          className={styles.otherProjects}
          id="other-projects"
          aria-labelledby="other-projects-title"
        >
          <SectionLabel index="05">Selected other projects</SectionLabel>
          <h2 className={styles.sectionTitle} id="other-projects-title">
            Other rooms of the same practice
          </h2>
          <div className={styles.projectList}>
            {OTHER_PROJECTS.map((project) => (
              <article className={styles.projectRow} key={project.title}>
                <h3 className={styles.projectTitle}>
                  <Link href={project.href}>{project.title}</Link>
                </h3>
                <p className={styles.projectBody}>{project.body}</p>
                <Link
                  className={styles.projectLink}
                  href={project.href}
                  aria-label={`Open ${project.title}`}
                >
                  Open <span aria-hidden="true">↗</span>
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.biography} id="biography" aria-labelledby="biography-title">
          <SectionLabel index="06">Biography / selected facts</SectionLabel>
          <div className={styles.biographyGrid}>
            <div>
              <h2 className={styles.sectionTitle} id="biography-title">
                Anton Merkurov
              </h2>
              <p className={styles.bioShort}>{BIOGRAPHY.short}</p>
              <div className={styles.bioExtended}>
                {BIOGRAPHY.extended.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </div>
            <dl className={styles.facts}>
              {BIOGRAPHY.facts.map((fact) => (
                <div className={styles.factRow} key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className={styles.contact} id="contact" aria-labelledby="contact-title">
          <SectionLabel index="07">Contact / links</SectionLabel>
          <div className={styles.contactGrid}>
            <div>
              <h2 className={styles.contactTitle} id="contact-title">
                For residencies, exhibitions, institutions and commissions.
              </h2>
              <p className={styles.contactBody}>
                Professional enquiries are welcome by email or through the private office. The
                public archive, project pages and social channels are listed alongside.
              </p>
              <a className={styles.email} href={CONTACT.emailHref}>
                {CONTACT.email}
              </a>
            </div>
            <nav className={styles.contactLinks} aria-label="Contact and project links">
              {CONTACT.links.map((link) =>
                'external' in link && link.external ? (
                  <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer">
                    {link.label} <span aria-hidden="true">↗</span>
                  </a>
                ) : (
                  <Link key={link.label} href={link.href}>
                    {link.label} <span aria-hidden="true">→</span>
                  </Link>
                )
              )}
            </nav>
          </div>
          <p className={styles.colophon}>
            Anton Merkurov — Selected Works · Edition 2026 · The web page is the source of the print
            edition.
          </p>
        </section>
      </article>
    </div>
  );
}
