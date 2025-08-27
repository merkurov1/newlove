import Link from 'next/link';
import Image from 'next/image';

const siteName = 'site_name';
const slogan = 'slogan';

export default function Header({ pages }) {
  return (
    <header className="bg-white text-gray-800 p-4 shadow-md">
      <div className="container mx-auto flex justify-between items-center">
        {/* Site Name and Slogan Section */}
        <div className="flex items-center space-x-4">
          {/* Logo (if you still want to use it) */}
          {/* <Link href="/">
            <Image src={logoUrl} alt="Логотип" width={100} height={40} className="cursor-pointer" />
          </Link> */}
          <div>
            <Link href="/">
              <h1 className="text-2xl font-bold cursor-pointer">{siteName}</h1>
            </Link>
            <p className="text-sm text-gray-500 mt-1">{slogan}</p>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav>
          <ul className="flex space-x-6">
            <li>
              <Link href="/">
                <span className="text-gray-800 hover:text-blue-600 transition-colors duration-200 font-medium">Главная</span>
              </Link>
            </li>
            {pages.map((page) => (
              <li key={page.id}>
                <Link href={`/pages/${page.slug}`}>
                  <span className="text-gray-800 hover:text-blue-600 transition-colors duration-200 font-medium">{page.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
