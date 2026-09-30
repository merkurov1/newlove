'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, X, Terminal, ArrowRight } from 'lucide-react';

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

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/pierrot-web', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', response.status, errorText);
        throw new Error(`Connection Error: ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage = data.reply || "Silence.";
      
      setMessages(prev => [...prev, { role: 'assistant', content: assistantMessage }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "[ CONNECTION LOST. THE ETHER IS UNSTABLE. ]"
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Trigger Link */}
      <button
        onClick={() => setIsOpen(true)}
        className="group inline-flex items-center gap-2 text-xs font-mono uppercase tracking-[0.2em] text-zinc-600 hover:text-[#111111] transition-colors"
      >
        <span>&gt; Talk to Pierrot</span>
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></span>
      </button>

      {/* Modal Overlay with Liquid Glass */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6"
            style={{ 
              background: 'rgba(15, 15, 15, 0.4)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)'
            }}
            onClick={() => setIsOpen(false)}
          >
            {/* Modal Box */}
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-2xl h-[75vh] bg-[#FAF8F5]/90 backdrop-blur-2xl border border-zinc-300/80 text-[#111111] shadow-[0_24px_64px_rgba(0,0,0,0.15)] flex flex-col rounded-3xl overflow-hidden"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-200 bg-white/50">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[11px] tracking-[0.25em] text-zinc-500 uppercase">
                    Pierrot // Advisor
                  </span>
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="group font-mono text-xs uppercase tracking-widest text-zinc-500 hover:text-[#111111] transition-colors flex items-center gap-1.5"
                >
                  <span>[ Close ]</span>
                </button>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto px-6 py-8 space-y-6">
                {messages.length === 0 && (
                  <div className="text-zinc-400 font-serif text-sm text-center my-auto pt-16 space-y-2">
                    <p className="text-zinc-600 font-mono text-xs uppercase tracking-widest">The advisor is listening</p>
                    <p className="italic">Ask about art, silence, or digital architecture.</p>
                  </div>
                )}
                
                {messages.map((msg, idx) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={idx} 
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div className="font-mono text-[10px] text-zinc-400 mb-1.5 uppercase tracking-wider">
                      {msg.role === 'user' ? 'You' : 'Pierrot'}
                    </div>
                    <div className={`max-w-[85%] leading-relaxed ${
                      msg.role === 'user' 
                        ? 'bg-[#111111] text-[#FAF8F5] p-4 rounded-2xl rounded-tr-sm font-sans text-sm shadow-sm' 
                        : 'bg-white/80 border border-zinc-200/80 p-5 rounded-2xl rounded-tl-sm font-serif text-zinc-800 text-base shadow-[0_4px_20px_rgba(0,0,0,0.02)]'
                    }`}>
                      {msg.content}
                    </div>
                  </motion.div>
                ))}

                {isLoading && (
                  <div className="flex items-center gap-2 font-mono text-xs text-zinc-400 animate-pulse pl-2">
                    <span>Thinking</span>
                    <span className="tracking-widest">...</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="border-t border-zinc-200 p-4 md:p-5 bg-white/70 backdrop-blur-md">
                <div className="flex items-center gap-3 bg-white border border-zinc-200 rounded-2xl px-4 py-3 shadow-sm focus-within:border-zinc-400 transition-colors">
                  <span className="text-zinc-400 font-mono text-sm">›</span>
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your message..."
                    disabled={isLoading}
                    className="flex-1 bg-transparent border-none outline-none text-[#111111] font-serif text-base placeholder-zinc-400"
                    autoFocus
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim() || isLoading}
                    className="p-2 rounded-xl bg-[#111111] text-white hover:bg-zinc-800 disabled:opacity-30 transition-all"
                  >
                    <ArrowRight size={16} />
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
