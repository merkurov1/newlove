// components/LoungeInterface.js

'use client';

import { useState, useEffect, useRef } from 'react';
import { Picker } from 'emoji-mart';
import 'emoji-mart/css/emoji-mart.css';
import { createClient } from '@/lib/supabase-browser';
import { signIn } from 'next-auth/react';
import Image from 'next/image';
import type { Session } from 'next-auth';
import LinkPreview from './LinkPreview';

// Типы не изменились
type InitialMessage = {
  id: string;
  createdAt: Date;
  content: string;
  userId: string;
  user: { name: string | null; image: string | null };
};

type Props = {
  initialMessages: InitialMessage[];
  session: Session | null;
};

// --- НОВЫЙ ТИП ДЛЯ ПЕЧАТАЮЩИХ ПОЛЬЗОВАТЕЛЕЙ ---
type TypingUser = {
  name: string;
  image: string;
};

export default function LoungeInterface({ initialMessages, session }: Props) {
  const supabase = createClient();
  const [messages, setMessages] = useState(initialMessages);
  const [newMessage, setNewMessage] = useState('');
  // --- НОВОЕ СОСТОЯНИЕ ДЛЯ ИНДИКАТОРА ПЕЧАТИ ---
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  // --- СОСТОЯНИЕ ДЛЯ EMOJI PICKER ---
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  // --- СОСТОЯНИЕ ДЛЯ РЕАКЦИЙ ---
  // reactions: { [messageId: string]: Set<userId> }
  const [reactions, setReactions] = useState<{ [key: string]: Set<string> }>({});

  // --- ФУНКЦИЯ ДЛЯ ЛАЙКА ---
  const handleLike = (messageId: string) => {
    if (!session?.user?.id) return;
    setReactions(prev => {
      const current = prev[messageId] ? new Set<string>(prev[messageId]) : new Set<string>();
      if (current.has(session.user.id)) {
        current.delete(session.user.id);
      } else {
        current.add(session.user.id);
      }
      return { ...prev, [messageId]: current };
    });
  };
  
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Плавный скролл к последнему сообщению
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  
  // --- 1. УЛУЧШЕННЫЙ REAL-TIME КАНАЛ ---
  useEffect(() => {
    if (!session) return; // Не подписываемся, если нет сессии

    const channel = supabase.channel('realtime-talks'); // Дадим каналу более уникальное имя

    // --- ПОДПИСКА НА НОВЫЕ СООБЩЕНИЯ (INSERT) ---
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Message' },
      (payload) => {
        // Добавляем новое сообщение в конец списка без перезагрузки
        setMessages((currentMessages) => [...currentMessages, payload.new as InitialMessage]);
      }
    );

    // --- ПОДПИСКА НА УДАЛЕННЫЕ СООБЩЕНИЯ (DELETE) ---
    channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'Message' },
      (payload) => {
        // Убираем удаленное сообщение из списка по ID
        setMessages((currentMessages) => currentMessages.filter(msg => msg.id !== payload.old.id));
      }
    );

    // --- ПОДПИСКА НА ИНДИКАТОР ПЕЧАТИ (PRESENCE) ---
    channel.on('presence', { event: 'sync' }, () => {
        const newState = channel.presenceState<TypingUser>();
        const users = Object.values(newState).map(p => p[0]);
        // Убираем себя из списка печатающих
        setTypingUsers(users.filter(u => u.name !== session.user.name)); 
      }
    );

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Сообщаем всем, что мы в чате
        await channel.track({ 
            name: session.user.name, 
            image: session.user.image 
        });
      }
    });

    return () => { supabase.removeChannel(channel); };
  }, [supabase, session]); // Добавили session в зависимости

  // --- 2. ФУНКЦИЯ УДАЛЕНИЯ СООБЩЕНИЯ ---
  const handleDelete = async (messageId: string) => {
    // Оптимистичное удаление из UI
    setMessages((currentMessages) => currentMessages.filter(msg => msg.id !== messageId));
    // Отправляем запрос на сервер
    await fetch(`/api/messages/${messageId}`, { method: 'DELETE' });
  };

  // --- 3. ФУНКЦИЯ ИНДИКАТОРА ПЕЧАТИ ---
  const handleTyping = () => {
    const channel = supabase.channel('realtime-talks');
    // Сообщаем, что мы начали печатать
    channel.track({ name: session?.user?.name, image: session?.user?.image });
    
    // Сбрасываем таймер, если он уже был
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    // Устанавливаем таймер, который через 3 секунды сообщит, что мы закончили печатать
    typingTimeoutRef.current = setTimeout(() => {
        channel.untrack();
    }, 3000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() === '' || !session?.user) return;
    
    // Оптимистичное обновление работает как и раньше
    const optimisticMessage = {
      id: Date.now().toString(), 
      content: newMessage,
      createdAt: new Date(),
      userId: session.user.id,
      user: { name: session.user.name ?? null, image: session.user.image ?? null },
    };
    setMessages([...messages, optimisticMessage]);
    setNewMessage('');
    
    // Сообщаем, что мы закончили печатать
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    supabase.channel('realtime-talks').untrack();
    
    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newMessage }),
    });
  };

  if (!session) {
    // ... (эта часть без изменений)
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
          // Найти первую ссылку в сообщении
          const urlMatch = message.content.match(/https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+/);
          const likes = reactions[message.id] ? reactions[message.id].size : 0;
          const likedByMe = reactions[message.id]?.has(session.user.id);
          return (
            <div key={message.id} className={`group flex items-start gap-3 ${isCurrentUser ? 'justify-end' : 'justify-start'}`}>
              {!isCurrentUser && <Image src={message.user?.image || '/default-avatar.png'} alt={message.user?.name || 'Avatar'} width={40} height={40} className="rounded-full" />}
              <div className={`flex flex-col max-w-xs sm:max-w-sm p-3 rounded-lg ${isCurrentUser ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white text-gray-800 rounded-bl-none border'}`}>
                {!isCurrentUser && <p className="font-semibold text-sm mb-1">{message.user?.name}</p>}
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
                {/* --- ПРЕДПРОСМОТР ССЫЛКИ --- */}
                {urlMatch && <LinkPreview url={urlMatch[0]} />}
                {/* --- РЕАКЦИИ --- */}
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => handleLike(message.id)}
                    className={`text-xl transition ${likedByMe ? 'text-pink-500 scale-110' : 'text-gray-400 hover:text-pink-400'}`}
                  >
                    ❤️
                  </button>
                  {likes > 0 && <span className="text-xs text-gray-500">{likes}</span>}
                </div>
                <p className={`text-xs mt-2 opacity-70 ${isCurrentUser ? 'text-right' : 'text-left'}`}>{new Date(message.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              {/* --- КНОПКА УДАЛЕНИЯ --- */}
              {isCurrentUser && (
                <button onClick={() => handleDelete(message.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                </button>
              )}
              {isCurrentUser && <Image src={session.user?.image || '/default-avatar.png'} alt={session.user?.name || 'Avatar'} width={40} height={40} className="rounded-full" />}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* --- ИНДИКАТОР ПЕЧАТИ --- */}
      <div className="h-6 px-4 text-sm text-gray-500 italic">
        {typingUsers.length > 0 && (
          `${typingUsers.map(u => u.name).join(', ')} печатает...`
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 bg-white border-t flex items-center gap-3 relative">
        <Image src={session.user?.image || '/default-avatar.png'} alt="Your avatar" width={40} height={40} className="rounded-full" />
        <div className="relative w-full">
          <textarea placeholder="Напишите сообщение..." value={newMessage} onChange={(e) => { setNewMessage(e.target.value); handleTyping(); }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }} className="w-full p-2 border rounded-md resize-none" rows={1} />
          <button type="button" onClick={() => setShowEmojiPicker(v => !v)} className="absolute right-2 top-2 text-xl" tabIndex={-1}>
            😊
          </button>
          {showEmojiPicker && (
            <div className="absolute bottom-12 right-0 z-50">
              <Picker
                onSelect={(emoji: any) => {
                  setNewMessage(newMessage + (emoji.native || emoji.colons || ''));
                  setShowEmojiPicker(false);
                }}
                title="Выберите emoji"
                emoji="point_up"
                theme="light"
                showPreview={false}
                showSkinTones={false}
              />
            </div>
          )}
        </div>
        <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300" disabled={!newMessage.trim()}>Отправить</button>
      </form>
    </div>
  );
}
