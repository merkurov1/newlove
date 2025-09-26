// components/LoungeInterface.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useSession, signIn } from 'next-auth/react'; // <-- Импортируем хук для сессии
import Image from 'next/image';

// Обновляем тип для сообщения
type Message = {
  id: number;
  created_at: string;
  content: string;
  user_id: string; // <-- ID пользователя из auth.users
  // Мы будем получать author_name и author_avatar_url из связанной таблицы users
  users: {
    name: string;
    image: string;
  } | null;
};

export default function LoungeInterface() {
  const supabase = createClient();
  const { data: session } = useSession(); // <-- Получаем сессию пользователя
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  
  // Загружаем сообщения и подписываемся на обновления
  useEffect(() => {
    // Функция для загрузки сообщений с информацией об авторе
    const fetchInitialMessages = async () => {
      // Теперь мы делаем запрос с JOIN'ом, чтобы получить имя и аватар
      const { data, error } = await supabase
        .from('messages')
        .select(`
          id,
          created_at,
          content,
          user_id,
          users ( name, image )
        `)
        .order('created_at', { ascending: true });

      if (error) console.error('Error fetching messages:', error);
      else setMessages(data as Message[]);
    };

    fetchInitialMessages();

    // Настраиваем realtime-подписку
    const channel = supabase
      .channel('realtime-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
           // Когда приходит новое сообщение, нам нужно подтянуть данные пользователя
           const { data: userData, error } = await supabase
             .from('users')
             .select('name, image')
             .eq('id', payload.new.user_id)
             .single();

           if (error) {
               console.error('Error fetching user for new message:', error);
           } else {
               const newMessageWithUser = {
                   ...payload.new,
                   users: userData
               } as Message;
               setMessages((currentMessages) => [...currentMessages, newMessageWithUser]);
           }
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Автопрокрутка к последнему сообщению
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Функция отправки нового сообщения
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() === '' || !session?.user) return;
    
    // Теперь данные пользователя берем из сессии
    const { error } = await supabase.from('messages').insert({
      content: newMessage,
      user_id: session.user.id, // <-- ID из сессии next-auth
      // author_name и author_avatar_url больше не нужны, т.к. мы получаем их через JOIN
    });

    if (error) console.error('Error sending message:', error);
    else setNewMessage('');
  };

  // Если пользователь не авторизован, показываем заглушку
  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] text-center">
        <h2 className="text-2xl font-semibold mb-4">Присоединяйтесь к обсуждению</h2>
        <p className="mb-6 text-gray-600">Чтобы отправлять сообщения, пожалуйста, войдите в свой аккаунт.</p>
        <button
          onClick={() => signIn('google')}
          className="px-6 py-3 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-700 transition-colors"
        >
          Войти через Google
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] max-w-3xl mx-auto p-4 font-sans">
      {/* Лента сообщений */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((message) => {
          const isCurrentUser = message.user_id === session.user.id;
          return (
            <div
              key={message.id}
              className={`flex items-start gap-3 ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
            >
              {!isCurrentUser && (
                <Image
                  src={message.users?.image || '/default-avatar.png'}
                  alt={message.users?.name || 'Avatar'}
                  width={40}
                  height={40}
                  className="rounded-full"
                />
              )}
              <div
                className={`flex flex-col max-w-sm p-3 rounded-lg ${
                  isCurrentUser
                    ? 'bg-blue-600 text-white rounded-br-none'
                    : 'bg-white text-gray-800 rounded-bl-none border'
                }`}
              >
                {!isCurrentUser && (
                  <p className="font-semibold text-sm mb-1">{message.users?.name}</p>
                )}
                <p className="whitespace-pre-wrap">{message.content}</p>
                <p className={`text-xs mt-2 opacity-70 ${isCurrentUser ? 'text-right' : 'text-left'}`}>
                  {new Date(message.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              {isCurrentUser && (
                 <Image
                    src={session.user?.image || '/default-avatar.png'}
                    alt={session.user?.name || 'Avatar'}
                    width={40}
                    height={40}
                    className="rounded-full"
                  />
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Форма ввода */}
      <form onSubmit={handleSubmit} className="mt-4 p-4 bg-white border-t flex items-center gap-3">
        <Image
          src={session.user?.image || '/default-avatar.png'}
          alt="Your avatar"
          width={40}
          height={40}
          className="rounded-full"
        />
        <textarea
          placeholder="Напишите сообщение..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          className="w-full p-2 border rounded-md resize-none"
          rows={1}
        />
        <button
          type="submit"
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
          disabled={!newMessage.trim()}
        >
          Отправить
        </button>
      </form>
    </div>
  );
}

