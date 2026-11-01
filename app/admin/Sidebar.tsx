// app/admin/Sidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/admin', label: 'Обзор' },
  { href: '/admin/flow-issues', label: 'Газета Flow' },
  { href: '/admin/operations', label: 'Operations' },
  { href: '/admin/projects', label: 'Проекты' },
  { href: '/admin/postcards', label: 'Открытки' },
  { href: '/admin/newsletter-jobs', label: 'Логи доставки' },
  { href: '/admin/users', label: 'Пользователи и подписчики' },
  { href: '/admin/brain/radar', label: 'Editorial Radar' },
  { href: '/admin/brain', label: 'Brain Injection' },
];

export default function Sidebar() {
  const pathname = usePathname() ?? '';
  const activeHref = navItems
    .map((item) => item.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((left, right) => right.length - left.length)[0];

  return (
    <aside className="w-64 min-h-screen bg-white border-r border-gray-200 flex flex-col">
      <div className="p-8 pb-4 flex flex-col items-center border-b border-gray-100">
        <Link
          href="/"
          className="text-2xl font-extrabold text-blue-700 tracking-tight mb-1 hover:underline"
        >
          Merkurov.love
        </Link>
        <p className="text-xs text-gray-400 font-medium">Админ-панель</p>
      </div>
      <nav className="flex-1 mt-6">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => {
            const isActive = activeHref === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`
                    flex items-center gap-3 px-5 py-3 rounded-lg text-base font-medium transition-all duration-200
                    hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200
                    ${isActive ? 'bg-blue-100 text-blue-700 font-semibold shadow' : 'text-gray-700'}
                  `}
                  tabIndex={0}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
