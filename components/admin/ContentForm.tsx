"use client";

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import TagInput from '@/components/admin/TagInput';
import BlockEditorImproved from '@/components/admin/BlockEditorImproved';
import { createSeoSlug } from '@/lib/slugUtils';

import { EditorJsBlock } from '@/types/blocks';





interface ContentFormProps {
  initialData?: any;
  saveAction: any;
  type: string;
}

function parseBlocks(raw: any): EditorJsBlock[] {
  if (!raw) return [];
  let arr = Array.isArray(raw) ? raw : (() => { try { return JSON.parse(raw); } catch { return []; } })();
  // Validate and coerce to EditorJsBlock shape
  return arr.filter((block: any) => block && typeof block.type === 'string' && block.data && typeof block.data === 'object');
}


export default function ContentForm({ initialData, saveAction, type }: ContentFormProps) {
  const safeInitial = initialData && typeof initialData === 'object' ? initialData : {};
  const isEditing = !!safeInitial && !!safeInitial.id;
  const [title, setTitle] = useState(safeInitial.title || '');
  const [slug, setSlug] = useState(safeInitial.slug || '');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false); // Всегда разрешаем автогенерацию
  const [content, setContent] = useState<EditorJsBlock[]>(parseBlocks(safeInitial.content));
  const [published, setPublished] = useState(safeInitial.published || false);
  const [error, setError] = useState('');
  const [slugError, setSlugError] = useState('');
  const [isCheckingSlug, setIsCheckingSlug] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    const supabase = createClient();
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
      setRole(data.user?.user_metadata?.role || null);
    };
    getUser();
    const { data: listener } = supabase.auth.onAuthStateChange(() => getUser());
    return () => { try { listener?.subscription?.unsubscribe?.(); } catch {} };
  }, []);
  const [tags, setTags] = useState<string[]>(() => (safeInitial.tags || []).map((t: any) => t.name));

  // Функция проверки уникальности slug
  const checkSlugUniqueness = useCallback(async (slugToCheck: string) => {
    if (!slugToCheck || isEditing) return; // Для редактирования не проверяем

    setIsCheckingSlug(true);
    setSlugError('');

    try {
      const response = await fetch(`/api/admin/validate-slug?slug=${encodeURIComponent(slugToCheck)}&type=letter${isEditing ? `&excludeId=${safeInitial.id}` : ''}`);
      const data = await response.json();
      
      if (!data.available) {
        setSlugError('Этот URL уже используется. Измените slug.');
      }
    } catch (err) {
      console.error('Ошибка проверки slug:', err);
    } finally {
      setIsCheckingSlug(false);
    }
  }, [isEditing, safeInitial.id]);

  // Автогенерация slug из title
  useEffect(() => {
    if (!slugManuallyEdited && title.trim()) {
      const generatedSlug = createSeoSlug(title);
      setSlug(generatedSlug);
      // Проверяем уникальность только для новых записей
      if (!isEditing) {
        checkSlugUniqueness(generatedSlug);
      }
    }
  }, [title, slugManuallyEdited, isEditing, checkSlugUniqueness]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSlug = e.target.value;
    setSlug(newSlug);
    setSlugManuallyEdited(true); // Отмечаем, что slug редактировался вручную
    setSlugError(''); // Сбрасываем ошибку
    
    // Проверяем уникальность при ручном вводе
    if (newSlug.trim()) {
      checkSlugUniqueness(newSlug);
    }
  };

  function validateBlocks(blocks: EditorJsBlock[]) {
    if (!Array.isArray(blocks) || blocks.length === 0) return false;
    for (const block of blocks) {
      if (!block.type || typeof block.type !== 'string') return false;
      if (!block.data || typeof block.data !== 'object') return false;
      if (block.type === 'richText' && typeof block.data.html !== 'string') return false;
      if (block.type === 'gallery' && (!Array.isArray(block.data.images))) return false;
      if (block.type === 'image' && typeof block.data.url !== 'string') return false;
      if (block.type === 'code' && typeof block.data.code !== 'string') return false;
      if (block.type === 'columns') {
        if (!Array.isArray(block.data.columns)) return false;
        for (const column of block.data.columns) {
          if (!column || typeof column.html !== 'string') return false;
        }
      }
      if (block.type === 'quote' && typeof block.data.text !== 'string') return false;
      if (block.type === 'video' && typeof block.data.url !== 'string') return false;
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    // Do not prevent default here; allow the native form submission to reach
    // the server action when validation passes. We will call
    // e.preventDefault() only on failure paths to stop submission.
    // Perform a server-side role check to avoid relying solely on client-side
    // metadata which can be stale or blocked by RLS. This endpoint uses the
    // service-role key (when available) to determine if the current session
    // belongs to an ADMIN. It is safe to call from the browser (same-origin).
    setError('');
    setIsCheckingSlug(true);
    try {
      const res = await fetch('/api/user/role', { credentials: 'same-origin' });
      if (!res.ok) {
          e.preventDefault();
          setError('Не удалось проверить привилегии администратора. Попробуйте позже.');
          setIsCheckingSlug(false);
          return false;
      }
      const body = await res.json();
      const serverRole = (body && body.role) ? String(body.role).toUpperCase() : 'ANON';
      if (serverRole !== 'ADMIN') {
          e.preventDefault();
          setError('Ошибка: нет прав администратора. Войдите как админ.');
          setIsCheckingSlug(false);
          return false;
      }
    } catch (err) {
      console.error('Ошибка проверки роли на сервере:', err);
        e.preventDefault();
        setError('Не удалось проверить привилегии администратора. Попробуйте позже.');
        setIsCheckingSlug(false);
        return false;
    } finally {
      setIsCheckingSlug(false);
    }
    if (!validateBlocks(content)) {
      e.preventDefault();
      setError('Проверьте структуру блоков: должен быть хотя бы один корректный блок.');
      return false;
    }
    if (slugError) {
      e.preventDefault();
      setError('Исправьте ошибки в URL перед сохранением.');
      return false;
    }
    setError('');
    // Allow the form to proceed (the server-side actions will re-check permissions)
    return true;
  }

  // Функция для отправки тестового письма
  async function handleTestSend() {
    if (!title || !content.length) {
      setError('Заполните название и содержание письма для тестовой отправки');
      return;
    }

    try {
      setError('Отправляем тестовое письмо...');
      
      const response = await fetch('/api/admin/letters/test-send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          content,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setError(`✅ ${data.message}`);
      } else {
        const data = await response.json();
        setError(`❌ Ошибка отправки: ${data.error || 'Неизвестная ошибка'}`);
      }
    } catch (err) {
      setError('❌ Ошибка при отправке тестового письма');
    }
  }



  return (
  <form action={saveAction} className="space-y-6 bg-white p-4 sm:p-8 rounded-lg shadow-md" onSubmit={handleSubmit}>
  {isEditing && <input type="hidden" name="id" value={safeInitial.id} />}
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700">Название</label>
        <input
          type="text"
          name="title"
          id="title"
          required
          value={title}
          onChange={handleTitleChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-base px-3 py-3"
        />
      </div>
      <div>
        <label htmlFor="slug" className="block text-sm font-medium text-gray-700">
          URL (slug)
          {!slugManuallyEdited && (
            <span className="text-xs text-gray-500 ml-2">
              (автогенерируется из названия)
            </span>
          )}
          {isCheckingSlug && (
            <span className="text-xs text-blue-500 ml-2">
              (проверяем уникальность...)
            </span>
          )}
        </label>
        <input
          type="text"
          name="slug"
          id="slug"
          required
          value={slug}
          onChange={handleSlugChange}
          className={`mt-1 block w-full rounded-md shadow-sm text-base px-3 py-3 ${
            slugError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
          }`}
        />
        {slugError && (
          <p className="mt-1 text-sm text-red-600">{slugError}</p>
        )}
      </div>
  <TagInput initialTags={safeInitial.tags} onChange={setTags} />
  <BlockEditorImproved value={content} onChange={setContent} />
      <input type="hidden" name="tags" value={JSON.stringify(tags)} />
  <textarea name="content" value={JSON.stringify(content)} readOnly hidden />
      {error && <div className="text-red-600 text-sm font-medium">{error}</div>}
      <div className="flex items-center mt-2 mb-2">
        <input
          id="published"
          name="published"
          type="checkbox"
          checked={published}
          onChange={e => setPublished(e.target.checked)}
          className="h-6 w-6 rounded border-gray-300 text-blue-600"
        />
        <label htmlFor="published" className="ml-3 block text-base text-gray-900">
          Опубликовано на сайте
        </label>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        ✓ Опубликованные письма видны на сайте в разделе Letters<br/>
        📧 Отправка рассылки — отдельная операция (после публикации)
      </p>
      <div className="mt-4 space-y-3">
        <button type="submit" className="w-full flex justify-center py-3 px-4 border rounded-md shadow-sm text-base font-medium text-white bg-blue-600 hover:bg-blue-700 min-h-[44px]">
          {isEditing ? 'Сохранить изменения' : `Создать ${type}`}
        </button>
        
        {/* Кнопка тестовой отправки только для писем */}
        {type === 'выпуск' && (
          <button 
            type="button" 
            onClick={handleTestSend}
            disabled={!title || !content.length}
            className="w-full flex justify-center py-3 px-4 border border-orange-500 rounded-md shadow-sm text-base font-medium text-orange-600 bg-white hover:bg-orange-50 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            📧 Отправить тест админу
          </button>
        )}
      </div>
    </form>
  );
}
