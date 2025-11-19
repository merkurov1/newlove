'use client';

import PierrotChat from './PierrotChat';

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-gray-50">
      <div className="container mx-auto px-3 py-6 sm:py-8">
        <div className="text-center space-y-4">
          {/* Pierrot Chat Trigger */}
          <div>
            <PierrotChat />
          </div>
          
          {/* Copyright */}
          <p className="text-sm text-gray-600">
            &copy; {new Date().getFullYear()} Anton Merkurov. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
