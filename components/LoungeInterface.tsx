'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { signIn } from 'next-auth/react';
import Image from 'next/image';
import type { Session } from 'next-auth';

type InitialMessage = {
  id: number;
  createdAt: Date;
  content: string;
  userId: string;
  author: { name: string | null; image: string | null };
};

type Props = {
  initialMessages: InitialMessage[];
  session: Session | null;
};

export default function LoungeInterface({ initialMessages, session }: Props) {
  const supabase = createClient();
  const [messages, setMessages] = useState(initialMessages);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  
  useEffect(() => {
    const channel = supabase
      .channel('realtime-messages')
      .on( 'postgres_changes', { event: 'INSERT', schema: 'public', table: 'Message' },
        () => { window.location.reload(); }
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() === '' || !session?.user) return;
    const optimisticMessage = {
      id: Date.now(),
      content: newMessage,
      createdAt: new Date(),
      userId: session.user.id,
      author: { name: session.user.name, image: session.user.image },
    };
    setMessages([...messages, optimisticMessage]);
    setNewMessage('');
    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newMessage }),
    });
  };

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] text-center">
        <h2 className="text-2xl font-semibold mb-4">Присоединяйтесь к обсуждению</h2>
        <p className="mb-6 text-gray-600">Чтобы отправлять сообщения, пожалуйста, войдите.</p>
        <button onClick={() => signIn('google')} className="px-6 py-3 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-700">Войти через Google</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] max-w-3xl mx-auto p-4 font-sans">
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((message) => {
          const isCurrentUser = message.userId === session.user.id;
          return (
            <div key={message.id} className={`flex items-start gap-3 ${isCurrentUser ? 'justify-end' : 'justify-start'}`}>
              {!isCurrentUser && <Image src={message.author?.image || '/default-avatar.png'} alt={message.author?.name || 'Avatar'} width={40} height={40} className="rounded-full" />}
              <div className={`flex flex-col max-w-sm p-3 rounded-lg ${isCurrentUser ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white text-gray-800 rounded-bl-none border'}`}>
                {!isCurrentUser && <p className="font-semibold text-sm mb-1">{message.author?.name}</p>}
                <p className="whitespace-pre-wrap">{message.content}</p>
                <p className={`text-xs mt-2 opacity-70 ${isCurrentUser ? 'text-right' : 'text-left'}`}>{new Date(message.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              {isCurrentUser && <Image src={session.user?.image || '/default-avatar.png'} alt={session.user?.name || 'Avatar'} width={40} height={40} className="rounded-full" />}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="mt-4 p-4 bg-white border-t flex items-center gap-3">
        <Image src={session.user?.image || '/default-avatar.png'} alt="Your avatar" width={40} height={40} className="rounded-full" />
        <textarea placeholder="Напишите сообщение..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }} className="w-full p-2 border rounded-md resize-none" rows={1} />
        <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300" disabled={!newMessage.trim()}>Отправить</button>
      </form>
    </div>
  );
}
