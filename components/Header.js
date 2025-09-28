'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useSession, signIn, signOut } from 'next-auth/react';

export default function Header({ projects, settings }) {
  const { data: session, status } = useSession();

  const site_name = settings?.site_name || 'Merkurov.love';
  const slogan = settings?.slogan || 'Art x Love x Money';
  const logoUrl = settings?.logo_url || 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png';

  return (
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

        <nav className="hidden md:flex">
          <ul className="list-none flex items-center justify-center gap-6 text-xs font-semibold uppercase tracking-[0.2em]"> 
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

        {/* <<< ВОССТАНОВЛЕННЫЙ БЛОК ДЛЯ АВТОРИЗАЦИИ >>> */}
        <div className="flex items-center justify-end" style={{minWidth: '150px'}}>
          {/* Пока идет проверка сессии, показываем "заглушку" */}
          {status === 'loading' && (
            <div className="h-8 w-24 animate-pulse rounded-md bg-gray-200" />
          )}

          {/* Если пользователь не авторизован, показываем кнопку входа */}
          {status === 'unauthenticated' && (
            <button 
              onClick={() => signIn('google')} 
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-700"
            >
              Sign In
            </button>
          )}

          {/* Если пользователь авторизован, показываем его данные и кнопку выхода */}
          {status === 'authenticated' && (
            <div className="flex items-center gap-4">
              {session.user?.image && (
                <Image
                  src={session.user.image}
                  alt={session.user.name || 'Аватар'}
                  width={32}
                  height={32}
                  className="rounded-full"
                />
              )}
              <span className="hidden text-sm font-medium text-gray-700 sm:block">{session.user.name}</span>
              <button 
                onClick={() => signOut()} 
                className="text-sm font-semibold text-gray-500 transition-colors hover:text-gray-900"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}


