import Link from 'next/link';
import Image from 'next/image';

export default function Header({ articles, siteName, slogan }) {
  const logoUrl = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png';
  
  return (
    <>
      <header className="flex flex-wrap items-center justify-between p-6 bg-white">
        <div className="flex items-center flex-shrink-0 mr-6">
          <Link href="/">
            <Image src={logoUrl} alt="Логотип" width={48} height={48} />
          </Link>
          <div className="ml-4">
            <Link href="/" className="font-bold text-xl tracking-tight text-gray-900">{siteName}</Link>
            <p className="text-gray-600 text-sm">{slogan}</p>
          </div>
        </div>
      </header>
      <nav className="w-full p-4 bg-white">
        <div className="text-sm">
          {articles.map((article) => (
            <Link key={article.slug} href={`/${article.slug}`} className="block mt-4 lg:inline-block lg:mt-0 text-gray-800 hover:text-blue-600 mr-4">
              {article.title}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
