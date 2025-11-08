'use client';

import DonateButton from './DonateButton';

export default function Footer({ subscriberCount }) {

  return (
    <footer className="border-t border-gray-200 bg-gray-50">
      {/* Support section */}
      <section
        className="w-full flex items-center justify-center"
        style={{
          background: 'linear-gradient(120deg, #ffffff 0%, #fbfdff 100%)',
          WebkitBackdropFilter: 'blur(4px)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <div className="container mx-auto px-4 py-12">
          <div className="flex justify-center">
            <DonateButton />
          </div>
        </div>
      </section>
      
      {/* Copyright */}
      <div className="container mx-auto px-4 py-8">
        <div className="border-t border-gray-200 pt-6 text-center">
          <p className="text-sm text-gray-600">&copy; {new Date().getFullYear()} Anton Merkurov. Все права защищены.</p>
          <p className="mt-2 text-xs text-gray-500">
            Подписчиков рассылки: <span className="font-semibold text-gray-700">{subscriberCount}</span>
          </p>
        </div>
      </div>
    </footer>
  );
}


