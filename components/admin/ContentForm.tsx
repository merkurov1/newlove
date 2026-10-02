"use client";

import { useState, useEffect, useCallback, ChangeEvent } from 'react';
import { createClient } from '@/lib/supabase-browser';
import TagInput from '@/components/admin/TagInput';
import BlockEditorImproved from '@/components/admin/BlockEditorImproved';
import RichTextArea from '@/components/admin/RichTextArea';
import { createSeoSlug } from '@/lib/slugUtils';
import { EditorJsBlock } from '@/types/blocks';

interface ContentFormProps {
  initialData?: Record<string, any>;
  saveAction: (formData: FormData) => void | Promise<any>;
  type: string;
}

function parseBlocks(raw: any): EditorJsBlock[] {
  if (!raw) return [];
  let arr = Array.isArray(raw) ? raw : (() => { try { return JSON.parse(raw); } catch { return []; } })();
  return arr.filter((block: any) => block && typeof block.type === 'string' && block.data && typeof block.data === 'object');
}

export default function ContentForm({ initialData, saveAction, type }: ContentFormProps) {
  const safeInitial = initialData && typeof initialData === 'object' ? initialData : {};
  const isEditing = !!safeInitial && !!safeInitial.id;
  
  const [title, setTitle] = useState(safeInitial.title || '');
  const [artist, setArtist] = useState(safeInitial.artist || '');
  const [curatorNote, setCuratorNote] = useState(safeInitial.curatorNote || '');
  const [quote, setQuote] = useState(safeInitial.quote || '');
  const [specs, setSpecs] = useState(safeInitial.specs || '');
  const [slug, setSlug] = useState(safeInitial.slug || '');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [content, setContent] = useState<EditorJsBlock[]>(() => parseBlocks(safeInitial.content));
  const [published, setPublished] = useState(safeInitial.published || false);
  const [error, setError] = useState('');
  const [slugError, setSlugError] = useState('');
  const [isCheckingSlug, setIsCheckingSlug] = useState(false);
  const [, setUser] = useState<any>(null);
  const [, setRole] = useState<string | null>(null);

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

  const checkSlugUniqueness = useCallback(async (slugToCheck: string) => {
    if (!slugToCheck || isEditing) return;

    setIsCheckingSlug(true);
    setSlugError('');

    try {
      const response = await fetch(`/api/admin/validate-slug?slug=${encodeURIComponent(slugToCheck)}&type=letter${isEditing ? `&excludeId=${safeInitial.id}` : ''}`);
      const data = await response.json();
      
      if (!data.available) {
        setSlugError('Slug is already in use. Please modify.');
      }
    } catch (err) {
      console.error('Slug validation error:', err);
    } finally {
      setIsCheckingSlug(false);
    }
  }, [isEditing, safeInitial.id]);

  useEffect(() => {
    if (!slugManuallyEdited && (artist.trim() || title.trim())) {
      const base = [artist, title].filter(Boolean).join(' ');
      const generatedSlug = createSeoSlug(base);
      setSlug(generatedSlug);
      if (!isEditing) {
        checkSlugUniqueness(generatedSlug);
      }
    }
  }, [artist, title, slugManuallyEdited, isEditing, checkSlugUniqueness]);

  const handleTitleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
  };

  const handleSlugChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newSlug = e.target.value;
    setSlug(newSlug);
    setSlugManuallyEdited(true);
    setSlugError('');
    
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

  async function handleSubmit(e: any) {
    setError('');
    setIsCheckingSlug(true);

    try {
      const res = await fetch('/api/user/role', { credentials: 'same-origin' });
      if (!res.ok) {
          e.preventDefault();
          setError('Authorization check failed. Please try again.');
          setIsCheckingSlug(false);
          return;
      }
      const body = await res.json();
      const serverRole = (body && body.role) ? String(body.role).toUpperCase() : 'ANON';
      if (serverRole !== 'ADMIN') {
          e.preventDefault();
          setError('Access denied: Administrator privileges required.');
          setIsCheckingSlug(false);
          return;
      }
    } catch (err) {
      console.error('Server role verification error:', err);
      e.preventDefault();
      setError('Authorization check failed. Please try again.');
      setIsCheckingSlug(false);
      return;
    } finally {
      setIsCheckingSlug(false);
    }

    if (!validateBlocks(content)) {
      e.preventDefault();
      setError('Invalid block structure: At least one valid content block is required.');
      return;
    }

    if (slugError) {
      e.preventDefault();
      setError('Please resolve URL errors before saving.');
      return;
    }

    const contentTextArea = e.currentTarget.elements.namedItem('content') as HTMLTextAreaElement;
    if (contentTextArea) {
      contentTextArea.value = JSON.stringify(content);
    }

    setError('');
  }

  async function handleTestSend() {
    if (!title || !content.length) {
      setError('Title and content are required for test dispatch.');
      return;
    }

    try {
      setError('Transmitting test dispatch...');
      
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
        setError(`✓ ${data.message || 'Test dispatch successful.'}`);
      } else {
        const data = await response.json();
        setError(`✕ Transmission error: ${data.error || 'Unknown error'}`);
      }
    } catch {
      setError('✕ Failed to transmit test dispatch.');
    }
  }

  return (
    <form 
      action={saveAction} 
      className="bg-white border border-neutral-200 p-8 sm:p-12 space-y-8 font-sans max-w-5xl mx-auto shadow-none" 
      onSubmit={handleSubmit}
    >
      {isEditing && <input type="hidden" name="id" value={safeInitial.id} />}
      
      {type !== 'выпуск' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="artist" className="block font-mono text-[11px] uppercase tracking-widest text-neutral-500 mb-2">
              Artist
            </label>
            <input
              type="text"
              name="artist"
              id="artist"
              value={artist}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setArtist(e.target.value)}
              placeholder="e.g. Sergey Merkurov"
              className="w-full bg-neutral-50/50 border border-neutral-200 px-4 py-3 text-sm text-neutral-900 focus:bg-white focus:border-neutral-900 focus:outline-none transition rounded-none font-serif"
            />
          </div>
          <div>
            <label htmlFor="title" className="block font-mono text-[11px] uppercase tracking-widest text-neutral-500 mb-2">
              Artwork Title *
            </label>
            <input
              type="text"
              name="title"
              id="title"
              required
              value={title}
              onChange={handleTitleChange}
              placeholder="e.g. Monumental Study"
              className="w-full bg-neutral-50/50 border border-neutral-200 px-4 py-3 text-sm text-neutral-900 focus:bg-white focus:border-neutral-900 focus:outline-none transition rounded-none font-serif italic"
            />
          </div>
        </div>
      )}
      
      {type === 'выпуск' && (
        <div>
          <label htmlFor="title" className="block font-mono text-[11px] uppercase tracking-widest text-neutral-500 mb-2">
            Edition Title *
          </label>
          <input
            type="text"
            name="title"
            id="title"
            required
            value={title}
            onChange={handleTitleChange}
            placeholder="Issue headline..."
            className="w-full bg-neutral-50/50 border border-neutral-200 px-4 py-3 text-sm text-neutral-900 focus:bg-white focus:border-neutral-900 focus:outline-none transition rounded-none font-serif"
          />
        </div>
      )}

      {type !== 'выпуск' && (
        <>
          <div>
            <label htmlFor="curatorNote" className="block font-mono text-[11px] uppercase tracking-widest text-neutral-500 mb-2">
              Curator's Note
            </label>
            <div className="border border-neutral-200 bg-neutral-50/30 p-1">
              <RichTextArea
                value={curatorNote}
                onChange={setCuratorNote}
                placeholder="Enter curatorial context..."
                className="font-serif text-sm"
                minHeight="140px"
              />
            </div>
            <input type="hidden" name="curatorNote" value={curatorNote} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="quote" className="block font-mono text-[11px] uppercase tracking-widest text-neutral-500 mb-2">
                Artist Statement / Quote
              </label>
              <textarea
                name="quote"
                id="quote"
                value={quote}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setQuote(e.target.value)}
                placeholder="Direct quotation..."
                className="w-full bg-neutral-50/50 border border-neutral-200 px-4 py-3 text-sm text-neutral-900 focus:bg-white focus:border-neutral-900 focus:outline-none transition rounded-none font-serif italic min-h-[120px]"
              />
            </div>
            <div>
              <label htmlFor="specs" className="block font-mono text-[11px] uppercase tracking-widest text-neutral-500 mb-2">
                Specs & Provenance
              </label>
              <div className="border border-neutral-200 bg-neutral-50/30 p-1">
                <RichTextArea
                  value={specs}
                  onChange={setSpecs}
                  placeholder="Material, Dimensions, Year..."
                  className="font-mono text-xs"
                  minHeight="120px"
                />
              </div>
              <input type="hidden" name="specs" value={specs} />
            </div>
          </div>
        </>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="slug" className="block font-mono text-[11px] uppercase tracking-widest text-neutral-500">
            URL Slug *
          </label>
          {!slugManuallyEdited && (
            <span className="font-mono text-[10px] text-neutral-400">
              [Auto-generated]
            </span>
          )}
          {isCheckingSlug && (
            <span className="font-mono text-[10px] text-neutral-900 animate-pulse">
              Verifying availability...
            </span>
          )}
        </div>
        <input
          type="text"
          name="slug"
          id="slug"
          required
          value={slug}
          onChange={handleSlugChange}
          className={`w-full bg-neutral-50/50 border px-4 py-3 text-xs font-mono text-neutral-900 focus:bg-white focus:outline-none transition rounded-none ${
            slugError ? 'border-rose-600 focus:border-rose-600' : 'border-neutral-200 focus:border-neutral-900'
          }`}
        />
        {slugError && <p className="mt-2 font-mono text-xs text-rose-600">{slugError}</p>}
      </div>

      <div className="border-t border-neutral-200 pt-8">
        <TagInput initialTags={safeInitial.tags} onChange={setTags} />
      </div>

      <div className="border-t border-neutral-200 pt-8">
        <label className="block font-mono text-[11px] uppercase tracking-widest text-neutral-500 mb-4">
          Composition Blocks
        </label>
        <BlockEditorImproved value={content} onChange={setContent} />
      </div>

      <input type="hidden" name="tags" value={JSON.stringify(tags)} />
      <textarea name="content" defaultValue={JSON.stringify(content)} readOnly hidden />
      <input type="hidden" name="artist" value={artist} />
      <input type="hidden" name="curatorNote" value={curatorNote} />
      <input type="hidden" name="quote" value={quote} />
      <input type="hidden" name="specs" value={specs} />

      {error && (
        <div className="border-l-2 border-neutral-900 bg-neutral-50 p-4 font-mono text-xs text-neutral-900">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between border-y border-neutral-200 py-6">
        <div className="flex items-center space-x-3">
          <input
            id="published"
            name="published"
            type="checkbox"
            checked={published}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPublished(e.target.checked)}
            className="h-4 w-4 rounded-none border-neutral-300 text-neutral-900 focus:ring-0 cursor-pointer"
          />
          <label htmlFor="published" className="font-mono text-xs uppercase tracking-wider text-neutral-800 cursor-pointer select-none">
            Publish to Live Archive
          </label>
        </div>
        <span className="font-mono text-[10px] text-neutral-400">
          {published ? 'Status: Public' : 'Status: Draft'}
        </span>
      </div>

      <div className="space-y-3 pt-2">
        <button 
          type="submit" 
          className="w-full bg-neutral-900 hover:bg-black text-white font-mono text-xs uppercase tracking-widest py-4 transition-all rounded-none shadow-none flex items-center justify-center"
        >
          {isEditing ? 'Save Changes' : `Create ${type}`}
        </button>
        
        {type === 'выпуск' && (
          <button 
            type="button" 
            onClick={handleTestSend}
            disabled={!title || !content.length}
            className="w-full border border-neutral-300 hover:border-neutral-900 text-neutral-900 bg-transparent font-mono text-xs uppercase tracking-widest py-4 transition-all rounded-none disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
          >
            Dispatch Test Preview
          </button>
        )}
      </div>
    </form>
  );
}
