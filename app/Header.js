import Link from 'next/link';
import Image from 'next/image';

export default function Header({ pages, siteSettings }) {
  const { site_name, slogan, logo_url } = siteSettings;

  return (
    <header className="bg-white text-gray-800 p-4 shadow-md">
      <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center text-center sm:text-left">
        {/* Logo, Site Name and Slogan Section - Centered */}
        <div className="flex flex-col items-center sm:items-start mb-4 sm:mb-0">
          <Link href="/" className="flex items-center space-x-4">
            {logo_url && (
              <Image src={logo_url} alt="Логотип" width={100} height={40} className="cursor-pointer" />
            )}
            <div>
              <h1 className="text-2xl font-bold cursor-pointer">{site_name}</h1>
              {slogan && <p className="text-sm text-gray-500 mt-1">{slogan}</p>}
            </div>
          </Link>
        </div>

        {/* Navigation Menu - Centered */}
        <nav>
          <ul className="flex flex-wrap justify-center sm:space-x-6 space-x-4 text-center">
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
