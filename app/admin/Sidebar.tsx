// app/admin/Sidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/admin', label: 'Главная' },
  { href: '/admin/products', label: 'Товары' },
  { href: '/admin/orders', label: 'История заказов' },
  { href: '/admin/users', label: 'Пользователи' },
  { href: '/admin/subscribers', label: 'Подписчики' },
  { href: '/admin/articles', label: 'Статьи' },
  { href: '/admin/projects', label: 'Проекты' },
  { href: '/admin/letters', label: 'Рассылки' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-white border-r border-gray-200">
      <div className="p-6">
        <Link href="/" className="text-2xl font-bold text-gray-800">Merkurov.love</Link>
        <p className="text-xs text-gray-500">Панель управления</p>
      </div>
      <nav className="mt-6">
        <ul>
          {navItems.map((item) => {
            // --- УПРОЩЕННАЯ И НАДЕЖНАЯ ЛОГИКА АКТИВНОЙ ССЫЛКИ ---
            const isActive = item.href === '/admin' 
              ? pathname === item.href 
              : (pathname ? pathname.startsWith(item.href) : false);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center px-6 py-3 text-gray-600 hover:bg-gray-100 transition-colors ${
                    isActive ? 'bg-gray-200 text-gray-900 font-semibold' : ''
                  }`}
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
