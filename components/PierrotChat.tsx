'use client';

import { useState, useRef, useEffect } from 'react';

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
    // Добавляем сообщение пользователя в чат
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      // ИСПРАВЛЕНО: Стучимся в отдельный веб-роут
      const response = await fetch('/api/pierrot-web', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // ИСПРАВЛЕНО: Простая структура, которую ждет наш API
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
      
      // ИСПРАВЛЕНО: Берем поле 'reply' из нашего API
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
        className="text-xs font-mono text-gray-500 hover:text-black transition-colors uppercase tracking-widest"
        style={{ fontFamily: 'monospace' }}
      >
        &gt; TALK TO PIERROT <span className="animate-pulse">_</span>
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ 
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(5px)'
          }}
          onClick={() => setIsOpen(false)}
        >
          <div 
            className="relative w-full max-w-2xl h-[70vh] bg-black border border-white/20 text-gray-300 shadow-2xl flex flex-col font-mono"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-zinc-900/50">
              <div className="text-xs tracking-widest text-white">
                PIERROT // ADVISOR <span className="text-green-500 animate-pulse">●</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-xs text-gray-500 hover:text-white transition-colors"
              >
                [ CLOSE ]
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm">
              {messages.length === 0 && (
                <div className="text-gray-600 text-xs text-center mt-20">
                  The advisor is listening.<br/>Ask about Art, Silence, or your Digital Sins.
                </div>
              )}
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className="text-[10px] text-gray-600 mb-1 uppercase tracking-wider">
                    {msg.role === 'user' ? 'YOU' : 'PIERROT'}
                  </div>
                  <div className={`max-w-[85%] leading-relaxed ${
                    msg.role === 'user' 
                      ? 'text-white bg-zinc-900 p-3 border border-white/10' 
                      : 'text-gray-300 pl-0'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="text-gray-600 text-xs animate-pulse pl-0">
                  Thinking...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="border-t border-white/10 p-4 bg-zinc-900/30">
              <div className="flex items-center gap-3">
                <span className="text-gray-500 text-lg">›</span>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type here..."
                  disabled={isLoading}
                  className="flex-1 bg-transparent border-none outline-none text-white text-sm placeholder-gray-700"
                  autoFocus
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}