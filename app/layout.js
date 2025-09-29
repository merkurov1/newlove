// app/layout.js

import './main.css';
import { Inter } from 'next/font/google';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AuthProvider from '@/components/AuthProvider';
import prisma from '@/lib/prisma';
import { Analytics } from '@vercel/analytics/react'; // <<< 1. ДОБАВЛЕН ИМПОРТ

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
});

export const metadata = {
  title: "Merkurov.love",
  description: "Art x Love x Money"
};

export default async function RootLayout({ children }) {
  const projects = await prisma.project.findMany({
    where: { published: true },
    orderBy: { createdAt: 'asc' },
  });

  const settings = { 
    site_name: 'Anton Merkurov', 
    slogan: 'Art x Love x Money', 
    logo_url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png' 
  };

  return (
    <html lang="ru" className={inter.className}>
      <body className="bg-white text-gray-800 min-h-screen">
        <AuthProvider>
          <div className="flex flex-col min-h-screen">
            <Header projects={projects} settings={settings} />
            <main className="flex-grow w-full container mx-auto px-4 py-8">
              {children}
            </main>
            <Footer />
          </div>
        </AuthProvider>
        <Analytics /> {/* <<< 2. ДОБАВЛЕН КОМПОНЕНТ АНАЛИТИКИ */}
      </body>
    </html>
  );
}
