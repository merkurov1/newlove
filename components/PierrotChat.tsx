'use client';

import { useState } from 'react';

export default function PierrotChat() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Trigger Link */}
      <button
        onClick={() => setIsOpen(true)}
        className="text-xs font-mono text-gray-500 hover:text-black transition-colors"
        style={{ fontFamily: 'Space Mono, Courier, monospace' }}
      >
        &gt; TALK TO PIERROT <span className="animate-pulse">_</span>
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ 
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)'
          }}
        >
          <div className="relative w-full max-w-4xl h-[80vh] bg-white border border-black shadow-2xl">
            {/* Close Button */}
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-xs font-mono text-black hover:text-gray-500 transition-colors z-10"
              style={{ fontFamily: 'Space Mono, Courier, monospace' }}
            >
              [ CLOSE ]
            </button>

            {/* Iframe with Pierrot Chat */}
            <iframe
              src="https://pierrot.merkurov.love/chat"
              className="w-full h-full border-0"
              title="Pierrot Chat Interface"
              allow="microphone"
            />
          </div>
        </div>
      )}
    </>
  );
}
