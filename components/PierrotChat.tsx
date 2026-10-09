'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function PierrotChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/pierrot-web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });

      if (!response.ok) {
        throw new Error(`Connection Error: ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage = data.reply || 'Silence.';
      
      setMessages((prev) => [...prev, { role: 'assistant', content: assistantMessage }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => [
        ...prev,
        { 
          role: 'assistant', 
          content: '[ CONNECTION LOST. THE ETHER IS UNSTABLE. ]'
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDownInput = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Лаконичный триггер-таб */}
      <button
        onClick={() => setIsOpen(true)}
        className="group inline-flex items-center gap-2 px-3 py-1.5 bg-[#FAF8F5]/80 hover:bg-[#FAF8F5] border border-stone-300/80 text-[11px] font-mono tracking-[0.2em] text-stone-800 hover:text-stone-950 backdrop-blur-md transition-all cursor-pointer uppercase"
      >
        <span className="w-1.5 h-1.5 bg-stone-900 animate-pulse"></span>
        <span>Pierrot</span>
      </button>

      {/* Оверлей и Модалка */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-10"
            style={{ 
              background: 'rgba(10, 10, 10, 0.45)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)'
            }}
            onClick={() => setIsOpen(false)}
          >
            <motion.div 
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="relative w-full max-w-2xl h-[70vh] bg-[#FAF8F5] border border-stone-300 text-stone-900 shadow-2xl flex flex-col font-sans overflow-hidden"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              {/* Шапка */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-stone-300/80 bg-[#FAF8F5]">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] tracking-[0.25em] text-stone-500 uppercase">
                    PIERROT // ADVISOR
                  </span>
                  <span className="inline-block w-1.5 h-1.5 bg-stone-900 animate-pulse"></span>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone-400 hover:text-stone-900 transition-colors cursor-pointer"
                >
                  [ CLOSE ]
                </button>
              </div>

              {/* Сообщения */}
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 font-sans">
                {messages.length === 0 && (
                  <div className="text-center my-auto pt-20 space-y-2">
                    <p className="font-mono text-xs uppercase tracking-[0.25em] text-stone-400">
                      THE ADVISOR IS LISTENING
                    </p>
                    <p className="font-serif italic text-sm text-stone-500">
                      Ask about art, silence, or digital architecture.
                    </p>
                  </div>
                )}
                
                {messages.map((msg, idx) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={idx} 
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div className="font-mono text-[9px] text-stone-400 mb-1 uppercase tracking-widest">
                      {msg.role === 'user' ? 'YOU' : 'PIERROT'}
                    </div>
                    <div className={`max-w-[85%] text-sm leading-relaxed ${
                      msg.role === 'user' 
                        ? 'bg-stone-900 text-stone-50 p-3.5 tracking-wide' 
                        : 'bg-white border border-stone-200 p-4 text-stone-800 tracking-wide font-serif text-base'
                    }`}>
                      {msg.content}
                    </div>
                  </motion.div>
                ))}

                {isLoading && (
                  <div className="font-mono text-xs text-stone-400 animate-pulse tracking-widest uppercase">
                    THINKING...
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Ввод */}
              <div className="border-t border-stone-300 p-4 bg-[#FAF8F5]">
                <div className="flex items-center gap-3 bg-white border border-stone-300 px-4 py-3">
                  <span className="text-stone-400 font-mono text-xs">›</span>
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDownInput}
                    placeholder="TYPE YOUR MESSAGE..."
                    disabled={isLoading}
                    className="flex-1 bg-transparent border-none outline-none text-stone-900 font-mono text-xs tracking-wider placeholder-stone-400 uppercase"
                    autoFocus
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim() || isLoading}
                    className="font-mono text-xs uppercase tracking-[0.2em] px-3 py-1 bg-stone-900 text-stone-50 hover:bg-stone-800 disabled:opacity-20 transition-all cursor-pointer"
                  >
                    SEND
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
