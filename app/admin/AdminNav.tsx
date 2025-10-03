
"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/admin', label: 'Панель', icon: '📊' },
  { href: '/admin/articles', label: 'Статьи', icon: '📄' },
  { href: '/admin/projects', label: 'Проекты', icon: '🚀' },
  { href: '/admin/products', label: 'Товары', icon: '🛍️' },
  { href: '/admin/letters', label: 'Письма', icon: '💌' },
  { href: '/admin/subscribers', label: 'Подписчики', icon: '📧' },
  { href: '/admin/users', label: 'Пользователи', icon: '👥' },
  { href: '/admin/media', label: 'Медиа', icon: '🖼️' },
  { href: '/admin/banners', label: 'Баннеры', icon: '🎨' },
  { href: '/admin/orders', label: 'Заказы', icon: '💬' },
];

export default function AdminNav() {
  const pathname = usePathname();
  
  return (
    <nav className="w-full bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ul className="flex flex-wrap items-center justify-center gap-1 md:gap-2 py-3">
          {navItems.map((item) => {
            const isActive = item.href === '/admin'
              ? pathname === item.href
              : (pathname ? pathname.startsWith(item.href) : false);
            
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`
                    flex flex-col items-center px-2 py-2 md:px-3 md:py-2.5 
                    rounded-lg text-xs md:text-sm font-medium transition-all duration-200
                    hover:scale-105 hover:shadow-md
                    ${isActive 
                      ? 'bg-blue-100 text-blue-700 shadow-sm border border-blue-200' 
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                    }
                  `}
                >
                  <span className={`text-lg md:text-xl mb-1 transition-all duration-200 ${isActive ? 'scale-110' : ''}`}>
                    {item.icon}
                  </span>
                  <span className="leading-tight">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      
      {/* Breadcrumb для текущей страницы */}
      {pathname && pathname !== '/admin' && (
        <div className="bg-gray-50 border-t border-gray-200 px-4 py-2">
          <div className="max-w-7xl mx-auto">
            <nav className="text-sm text-gray-500">
              <Link href="/admin" className="hover:text-gray-700">Админ</Link>
              {pathname.split('/').slice(2).map((segment, index, array) => {
                const href = '/admin/' + array.slice(0, index + 1).join('/');
                const isLast = index === array.length - 1;
                const label = segment.charAt(0).toUpperCase() + segment.slice(1);
                
                return (
                  <span key={segment}>
                    <span className="mx-2">›</span>
                    {isLast ? (
                      <span className="text-gray-800 font-medium">{label}</span>
                    ) : (
                      <Link href={href} className="hover:text-gray-700">{label}</Link>
                    )}
                  </span>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </nav>
  );
}
