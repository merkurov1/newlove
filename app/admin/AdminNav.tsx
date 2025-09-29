
"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/admin', label: 'Главная', icon: '/icons/dashboard.svg' },
  { href: '/admin/articles', label: 'Статьи', icon: '/icons/article.svg' },
  { href: '/admin/projects', label: 'Проекты', icon: '/icons/project.svg' },
  { href: '/admin/letters', label: 'Рассылки', icon: '/icons/mail.svg' },
  { href: '/admin/media', label: 'Медиа', icon: '/icons/image.svg' },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="w-full bg-white border-b border-gray-200 shadow-sm">
      <ul className="flex flex-row items-center justify-center gap-2 md:gap-6 px-2 md:px-8 py-2">
        {navItems.map((item) => {
          const isActive = item.href === '/admin'
            ? pathname === item.href
            : (pathname ? pathname.startsWith(item.href) : false);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex flex-col items-center px-3 py-1.5 md:px-4 md:py-2 rounded-md text-xs md:text-sm font-medium transition-colors hover:bg-gray-100 ${isActive ? 'bg-gray-200 text-blue-700 font-semibold' : 'text-gray-600'}`}
              >
                <img src={item.icon} alt="" className="w-6 h-6 mb-0.5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
