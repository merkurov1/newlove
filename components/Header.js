import Link from 'next/link';
import Image from 'next/image';

export default function Header({ pages, settings }) {
  const site_name = settings?.site_name || 'Merkurov.love';
  const slogan = settings?.slogan || 'Art x Love x Money';
  const logoUrl = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png';

  return (
    <header className="w-full bg-white pt-16 pb-8 border-b border-gray-200">
      <div className="container mx-auto flex flex-col items-center justify-center space-y-6">
        <Link href="/">
          <Image 
            src={logoUrl} 
            alt="Логотип" 
            width={60}
            height={60}
            priority 
          />
        </Link>
        <h1 className="text-5xl font-light tracking-wider text-gray-900">
          {site_name}
        </h1>
        <div className="flex items-center w-full max-w-sm">
          <div className="flex-grow border-t border-gray-200"></div>
          <span className="mx-4 text-xs tracking-widest text-gray-400 uppercase">{slogan}</span>
          <div className="flex-grow border-t border-gray-200"></div>
        </div>
      </div>
      <nav className="w-full pt-8">
        <ul className="list-none flex items-center justify-center gap-4 md:gap-8 text-xs font-semibold tracking-[0.2em] uppercase"> 
          {Array.isArray(pages) && pages.map((page) => (
            <li key={page.id}>
              <Link href={`/projects/${page.slug}`} className="group text-gray-400 hover:text-gray-900 transition-colors duration-300 py-2">
                {page.title}
                <span className="block max-w-full h-px bg-gray-900 transition-all duration-300 scale-x-0 group-hover:scale-x-100"></span>
              </Link>
            </li>
          ))}
          <li>
            <Link href="/talks" className="group text-gray-400 hover:text-gray-900 transition-colors duration-300 py-2">
              Talks
              <span className="block max-w-full h-px bg-gray-900 transition-all duration-300 scale-x-0 group-hover:scale-x-100"></span>
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
