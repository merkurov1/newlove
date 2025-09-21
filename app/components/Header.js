// app/components/Header.js
import Link from 'next/link';
import Image from 'next/image';

export default function Header({ pages, settings }) {
  const site_name = settings?.site_name || 'Anton Merkurov';
  const slogan = settings?.slogan || 'Art x Love x Money';
  const logo_url = settings?.logo_url || 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png';

  return (
    <header className="bg-white text-gray-800 p-4 shadow-md">
      <div className="container mx-auto flex flex-col items-center py-8">
        <div className="text-center">
          <Link href="/">
            <Image
              src={logo_url}
              alt="Логотип"
              width={80}
              height={80}
              className="mb-4 mx-auto block"
            />
          </Link>
          <h1 className="text-4xl font-light mb-1">{site_name}</h1>
          <p className="text-sm text-gray-500 tracking-widest uppercase">{slogan}</p>
        </div>

        <div className="my-8 w-24 h-px bg-gray-300"></div>

        <nav>
          <ul className="flex flex-wrap justify-center sm:space-x-8 space-x-4 text-sm font-medium">
            <li>
              <Link href="/">
                <span className="hover:text-gray-500 transition-colors duration-200">🏠</span>
              </Link>
            </li>
            {pages.map((page) => (
              <li key={page.id}>
                <Link href={`/pages/${page.slug}`}>
                  <span className="hover:text-gray-500 transition-colors duration-200">{page.title.toUpperCase()}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}