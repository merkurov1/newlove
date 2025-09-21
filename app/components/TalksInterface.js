'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';

export default function TalksInterface() {
  const [messages, setMessages] = useState([]);
  const [author, setAuthor] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false });
      setMessages(data || []);
    };

    fetchMessages();

    const subscription = supabase
      .channel('messages')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'messages' }, 
        (payload) => {
          setMessages(prev => [payload.new, ...prev]);
        }
      )
      .subscribe();

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const savedAuthor = localStorage.getItem('talks_author');
    if (savedAuthor) setAuthor(savedAuthor);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim() || !author.trim()) return;

    const { error } = await supabase
      .from('messages')
      .insert([{ author_name: author, content }]);

    if (error) {
      console.error('Ошибка отправки:', error);
    } else {
      setContent('');
      localStorage.setItem('talks_author', author);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-serif font-bold mb-6">Talks</h1>
      
      <form onSubmit={handleSubmit} className="mb-8">
        <input
          type="text"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Ваше имя"
          className="w-full p-2 border rounded mb-2"
          required
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Ваше сообщение..."
          rows="3"
          className="w-full p-2 border rounded mb-2"
          required
        />
        <button 
          type="submit" 
          className="bg-black text-white px-4 py-2 rounded"
        >
          Отправить
        </button>
      </form>

      <div className="space-y-4">
        {messages.map((message) => (
          <div key={message.id} className="border-b pb-4">
            <div className="flex justify-between items-start">
              <span className="font-semibold">{message.author_name}</span>
              <span className="text-sm text-gray-500">
                {new Date(message.created_at).toLocaleString('ru-RU')}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap">{message.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}