import Link from 'next/link';
import { AI_DISCLOSURE, PERSON_NAME } from '@/lib/seo';

const FOOTER_LINKS = [
  { href: '/heritage', label: 'Heritage' },
  { href: '/media', label: 'Media Archive' },
  { href: '/unframed', label: 'Unframed' },
  { href: '/flow', label: 'Flow' },
  { href: '/selection', label: 'Selection' },
  { href: '/journal', label: 'Journal' },
] as const;

/**
 * The single footer used by every public page. The previous "All rights
 * reserved"-only variants were removed so the AI disclosure and the crawlable
 * link graph are identical sitewide.
 */
export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="site-footer w-full border-t border-zinc-200/60 bg-[#FAF8F5] px-6 py-8 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6">
        <nav aria-label="Site archives" className="w-full">
          <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[10px] tracking-[0.18em]">
            {FOOTER_LINKS.map((link) => (
              <li key={link.href}>
                <Link className="transition-colors hover:text-zinc-900" href={link.href}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex w-full flex-col items-center justify-between gap-3 sm:flex-row">
          <span>
            &copy; {currentYear} {PERSON_NAME}
          </span>
          <span className="font-sans text-[10px] lowercase italic tracking-normal text-zinc-400" lang="en">
            {AI_DISCLOSURE}
          </span>
        </div>
      </div>
    </footer>
  );
}
