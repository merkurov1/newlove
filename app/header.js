import Link from 'next/link';
import { supabase } from './lib/supabase'; // Обратите внимание на путь

async function getSettingsAndMenu() {
  const { data: settingsData, error: settingsError } = await supabase
    .from('settings')
    .select('key, value');

  // Обработка ошибок и формирование данных
  if (settingsError) {
    console.error('Ошибка загрузки настроек:', settingsError);
    return { settings: {}, articles: [] };
  }

  const settings = {};
  settingsData.forEach(item => {
    settings[item.key] = item.value;
  });

  const { data: articlesData, error: articlesError } = await supabase
    .from('articles')
    .select('slug, title')
    .eq('page', true);

  if (articlesError) {
    console.error('Ошибка загрузки статей:', articlesError);
    return { settings, articles: [] };
  }

  return { settings, articles: articlesData || [] };
}

export default async function Header() {
  const { settings, articles } = await getSettingsAndMenu();

  const siteName = settings.site_name || 'Название сайта';
  const slogan = settings.slogan || 'Слоган сайта';
  const logoUrl = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png';

  return (
    <header className="flex flex-wrap items-center justify-between p-6">
      <div className="flex items-center flex-shrink-0 text-white mr-6">
        <Link href="/">
          <img src={logoUrl} alt="Логотип" className="h-12 w-12" />
        </Link>
        <div className="ml-4">
          <Link href="/" className="font-bold text-xl tracking-tight text-gray-900">{siteName}</Link>
          <p className="text-gray-600 text-sm">{slogan}</p>
        </div>
      </div>
      <div className="block lg:hidden">
      </div>
      <div className="w-full block flex-grow lg:flex lg:items-center lg:w-auto">
        <div className="text-sm lg:flex-grow">
          {articles.map((article) => (
            <Link key={article.slug} href={`/${article.slug}`} className="block mt-4 lg:inline-block lg:mt-0 text-gray-800 hover:text-blue-600 mr-4">
              {article.title}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}
