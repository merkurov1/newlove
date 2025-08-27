// components/Footer.js
import Link from 'next/link';
import { supabase } from '@/lib/supabase-server';
import { socialIcons } from './components/Socialicons'; // Импортируем иконки

async function getSocialLinks() {
  const supabaseClient = supabase();
  const { data, error } = await supabaseClient.from('social').select('*');

  if (error) {
    console.error('Error fetching social links:', error);
    return [];
  }
  return data;
}

export default async function Footer() {
  const socialLinks = await getSocialLinks();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-800 text-white p-6 mt-8">
      <div className="container mx-auto flex flex-col items-center">
        <div className="flex space-x-4 mb-4">
          {socialLinks.map((link) => (
            <Link key={link.id} href={link.url} target="_blank" rel="noopener noreferrer">
              <span className="text-gray-400 hover:text-white transition-colors duration-300">
                {socialIcons[link.platform] || <span className="text-sm">{link.platform}</span>}
              </span>
            </Link>
          ))}
        </div>
        <div className="text-gray-500 text-sm">
          <p>© {currentYear} Антон Меркуров</p>
          <p>Made with Next.js, Tailwind CSS & Supabase.</p>
        </div>
      </div>
    </footer>
  );
}
