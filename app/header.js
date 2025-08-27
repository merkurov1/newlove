import Link from 'next/link';
import Image from 'next/image';

const logoUrl = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png';

export default function Header({ pages }) {
  return (
    <header className="bg-gray-800 text-white p-4 shadow-md">
      <div className="container mx-auto flex justify-between items-center">
        <Link href="/">
          <Image src={logoUrl} alt="Логотип" width={100} height={40} className="cursor-pointer" />
        </Link>
        <nav>
          <ul className="flex space-x-4">
            <li>
              <Link href="/">
                <span className="hover:text-gray-400">Главная</span>
              </Link>
            </li>
            {pages.map((page) => (
              <li key={page.id}>
                <Link href={`/pages/${page.slug}`}>
                  <span className="hover:text-gray-400">{page.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
