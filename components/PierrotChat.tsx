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
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/pierrot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: userMessage,
          sourceId: null,
          conversationId: null,
          settings: {}
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', response.status, errorText);
        throw new Error(`API Error ${response.status}: ${errorText.substring(0, 100)}`);
      }

      const data = await response.json();
      console.log('API Response:', data);
      
      // Try multiple possible response fields
      const assistantMessage = data.response || data.reply || data.message || data.text || data.answer || data.result || JSON.stringify(data);
      setMessages(prev => [...prev, { role: 'assistant', content: assistantMessage }]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMsg = error instanceof TypeError && error.message.includes('Failed to fetch')
        ? '[Error: CORS or Network issue. Check browser console for details.]'
        : `[Error: ${error instanceof Error ? error.message : 'Unable to reach Pierrot'}]`;
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: errorMsg
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
          onClick={() => setIsOpen(false)}
        >
          <div 
            className="relative w-full max-w-4xl h-[80vh] bg-black text-green-400 shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
            style={{ fontFamily: 'Space Mono, Courier, monospace' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-green-400/30">
              <div className="text-xs">
                <span className="text-green-400">PIERROT://TERMINAL</span>
                <span className="ml-4 text-green-400/50">[CONNECTED]</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-xs text-green-400 hover:text-green-300 transition-colors"
              >
                [ CLOSE ]
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
              {messages.length === 0 && (
                <div className="text-green-400/50 text-xs">
                  &gt; System ready. Type your message below...
                </div>
              )}
              {messages.map((msg, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="text-xs text-green-400/70">
                    {msg.role === 'user' ? '> USER:' : '> PIERROT:'}
                  </div>
                  <div className="pl-4 whitespace-pre-wrap">{msg.content}</div>
                </div>
              ))}
              {isLoading && (
                <div className="text-green-400/50 text-xs animate-pulse">
                  &gt; PIERROT is typing...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="border-t border-green-400/30 p-4">
              <div className="flex items-center gap-2">
                <span className="text-green-400 text-sm">&gt;</span>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your message..."
                  disabled={isLoading}
                  className="flex-1 bg-transparent border-none outline-none text-green-400 text-sm placeholder-green-400/30"
                  style={{ fontFamily: 'Space Mono, Courier, monospace' }}
                  autoFocus
                />
                <span className="text-green-400 animate-pulse">_</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
