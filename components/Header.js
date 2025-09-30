// ...existing code...
// ...existing code...
"use client";

import Link from "next/link";
// ...existing code...
import Image from 'next/image';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useState, useEffect } from 'react';

export default function Header({ projects, settings }) {
  const { data: session, status } = useSession();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const site_name = settings?.site_name || 'Anton Merkurov';
  const slogan = settings?.slogan || 'Art x Love x Money';
  const logoUrl = settings?.logo_url || 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png';

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          
          <Link href="/" className="group flex items-center space-x-4">
            <Image 
              src={logoUrl} 
              alt="Логотип" 
              width={40}
              height={40}
              priority 
              className="transition-transform duration-300 group-hover:scale-110"
            />
            <div>
              <h1 className="text-xl font-light tracking-wider text-gray-900">{site_name}</h1>
              <p className="hidden text-xs uppercase tracking-widest text-gray-400 sm:block">{slogan}</p>
            </div>
          </Link>

          <nav className="hidden items-center md:flex">
            <ul className="list-none flex items-center justify-center gap-6 text-xs font-semibold uppercase tracking-[0.2em]"> 
              <li>
                <Link href="/shop" className="group py-2 text-gray-500 transition-colors duration-300 hover:text-gray-900">
                  <span role="img" aria-label="Магазин">🛍️</span>
                  <span className="block h-px max-w-full scale-x-0 bg-gray-900 transition-all duration-300 group-hover:scale-x-100"></span>
                </Link>
              </li>
              {Array.isArray(projects) && projects.map((project) => (
                <li key={project.id}>
                  <Link href={`/${project.slug}`} className="group py-2 text-gray-500 transition-colors duration-300 hover:text-gray-900">
                    {project.title}
                    <span className="block h-px max-w-full scale-x-0 bg-gray-900 transition-all duration-300 group-hover:scale-x-100"></span>
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/talks" className="group py-2 text-gray-500 transition-colors duration-300 hover:text-gray-900">
                  Talks
                  <span className="block h-px max-w-full scale-x-0 bg-gray-900 transition-all duration-300 group-hover:scale-x-100"></span>
                </Link>
              </li>
            </ul>
          </nav>

          <div className="hidden md:flex items-center justify-end" style={{minWidth: '150px'}}>
            {status === 'loading' && <div className="h-8 w-24 animate-pulse rounded-md bg-gray-200" />}
            {status === 'unauthenticated' && (
              <button onClick={() => signIn('google')} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-700">Sign In</button>
            )}
            {status === 'authenticated' && (
              <div className="flex items-center gap-4">
                
                {/* <<< НОВАЯ ССЫЛКА НА ПРОФИЛЬ >>> */}

                <button onClick={() => signOut()} className="text-sm font-semibold text-gray-500 transition-colors hover:text-gray-900">Sign out</button>
              </div>
            )}
          </div>

          <div className="flex items-center md:hidden">
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="z-50 focus:outline-none">
              <svg className="h-6 w-6 text-gray-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </header>
      
      <div className={`fixed inset-0 z-40 transform bg-white pt-24 transition-transform duration-300 md:hidden ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <nav className="container mx-auto px-4">
          <ul className="list-none flex flex-col items-center gap-6 text-sm font-semibold uppercase tracking-[0.2em]">
            <li>
              <Link href="/shop" onClick={() => setIsMenuOpen(false)} className="py-2 text-gray-500 hover:text-gray-900">
                <span role="img" aria-label="Магазин">🛍️</span>
              </Link>
            </li>
            {Array.isArray(projects) && projects.map((project) => (
              <li key={project.id}>
                <Link href={`/${project.slug}`} onClick={() => setIsMenuOpen(false)} className="py-2 text-gray-500 hover:text-gray-900">{project.title}</Link>
              </li>
            ))}
            <li>
              <Link href="/talks" onClick={() => setIsMenuOpen(false)} className="py-2 text-gray-500 hover:text-gray-900">Talks</Link>
            </li>
            {/* Ссылки из UserSidebar перенесены сюда */}
            {status === 'authenticated' && (
              (() => {
                const username = session.user?.username || session.user?.name || 'me';
                return <>
                  <li>
                    <Link href={`/you/${username}`} onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 py-2 text-gray-600 font-semibold hover:text-gray-900">
                      👤 Профиль
                    </Link>
                  </li>
                  <li>
                    <Link href="/users" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 py-2 text-gray-600 font-semibold hover:text-gray-900">
                      👥 Пользователи
                    </Link>
                  </li>
                </>;
              })()
            )}
          </ul>
        </nav>
        <div className="mt-8 border-t border-gray-200 pt-6">
          <div className="flex items-center justify-center">
            {status === 'loading' && <div className="h-8 w-24 animate-pulse rounded-md bg-gray-200" />}
            {status === 'unauthenticated' && (
              <button onClick={() => { signIn('google'); setIsMenuOpen(false); }} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-700">Sign In</button>
            )}
            {status === 'authenticated' && (
              <div className="flex flex-col items-center gap-4">
                <Link href="/profile" onClick={() => setIsMenuOpen(false)} className="py-2 text-gray-600 font-semibold hover:text-gray-900 flex items-center gap-2">
                    ⚙️ Настройки
                </Link>
                <div className="flex items-center gap-2 mt-4">
                   {session.user?.image && <Image src={session.user.image} alt={session.user.name || 'Аватар'} width={32} height={32} className="rounded-full" />}
                   <span className="text-sm font-medium text-gray-700">{session.user.name}</span>
                </div>
                <button onClick={() => { signOut(); setIsMenuOpen(false); }} className="mt-2 text-sm font-semibold text-gray-500 transition-colors hover:text-gray-900">Sign out</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
