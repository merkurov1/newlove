import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase-server';

async function getSiteSettings() {
  const supabaseClient = supabase();
  const { data, error } = await supabaseClient
    .from('settings')
    .select('site_name, slogan, logo_url')
    .single();

  if (error) {
    console.error('Error fetching site settings:', error);
    return null;
  }
  return data;
}

export default async function Header({ pages }) {
  const siteSettings = await getSiteSettings();

  const site_name = siteSettings?.site_name || 'Anton Merkurov';
  const slogan = siteSettings?.slogan || 'Art x Love x Money';
  const logo_url = siteSettings?.logo_url || 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png';

  return (
    <header className="bg-white text-gray-800 p-4 shadow-md">
      <div className="container mx-auto flex flex-col items-center py-8">
        {/* Top Section with Logo, Name, and Slogan */}
        <div className="text-center">
          <Link href="/">
            {/* Исправлено: добавлено mx-auto block для надежного центрирования */}
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

        {/* Separator Line */}
        <div className="my-8 w-24 h-px bg-gray-300"></div>

        {/* Bottom Navigation Section */}
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
