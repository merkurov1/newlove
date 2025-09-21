// components/LoungeInterface.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase-browser'; // Используем клиент для браузера

// Определяем тип для сообщения
type Message = {
  id: number;
  created_at: string;
  author_name: string;
  content: string;
};

export default function LoungeInterface() {
  const supabase = createClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [authorName, setAuthorName] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  // 1. При первой загрузке компонента, получаем имя автора из localStorage
  useEffect(() => {
    const savedName = localStorage.getItem('chatAuthorName');
    if (savedName) {
      setAuthorName(savedName);
    }
  }, []);
  
  // 2. Загружаем начальные сообщения и подписываемся на realtime-обновления
  useEffect(() => {
    // Функция для загрузки сообщений
    const fetchInitialMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
      } else {
        setMessages(data);
      }
    };

    fetchInitialMessages();

    // Настраиваем realtime-подписку
    const channel = supabase
      .channel('realtime-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          // Когда приходит новое сообщение, добавляем его в наш список
          setMessages((currentMessages) => [...currentMessages, payload.new as Message]);
        }
      )
      .subscribe();

    // 3. Отписываемся от канала, когда компонент размонтируется
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // 4. Автоматическая прокрутка к последнему сообщению
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 5. Функция для отправки нового сообщения
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() === '' || authorName.trim() === '') {
      alert('Пожалуйста, введите имя и сообщение.');
      return;
    }

    // Сохраняем имя в localStorage
    localStorage.setItem('chatAuthorName', authorName);

    const { error } = await supabase
      .from('messages')
      .insert({ content: newMessage, author_name: authorName });

    if (error) {
      console.error('Error sending message:', error);
    } else {
      // Очищаем поле ввода после отправки
      setNewMessage('');
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] max-w-2xl mx-auto p-4">
      {/* Лента сообщений */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 rounded-lg">
        {messages.map((message) => (
          <div key={message.id} className="p-3 rounded-lg shadow-sm bg-white">
            <p className="font-semibold text-blue-700">{message.author_name}</p>
            <p className="text-gray-800 whitespace-pre-wrap">{message.content}</p>
            <p className="text-xs text-gray-400 mt-1 text-right">
              {new Date(message.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Форма ввода */}
      <form onSubmit={handleSubmit} className="mt-4 p-4 bg-white border-t">
        <input
          type="text"
          placeholder="Ваше имя"
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          className="w-full p-2 mb-2 border rounded-md"
        />
        <textarea
          placeholder="Напишите сообщение..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          className="w-full p-2 border rounded-md"
          rows={3}
        />
        <button
          type="submit"
          className="w-full mt-2 p-3 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Отправить
        </button>
      </form>
    </div>
  );
}
