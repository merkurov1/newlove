'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LetterCommentsClient({
  slug,
  serverContainerId,
}: {
  slug?: string;
  serverContainerId?: string;
}) {
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [newContent, setNewContent] = useState('');
  const [posting, setPosting] = useState(false);
  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        let theSlug = slug;
        if (!theSlug && typeof window !== 'undefined') {
          const parts = window.location.pathname.split('/').filter(Boolean);
          const idx = parts.indexOf('journal');
          if (idx >= 0 && parts.length > idx + 1) theSlug = parts[idx + 1];
        }
        const { data } = await supabase.auth.getSession();
        const s = (data as any)?.session || null;
        if (!mounted) return;
        if (!s || !s.user) {
          setHasSession(false);
          setComments([]);
          setError('unauthenticated');
          return;
        }
        setHasSession(true);
        if (!theSlug) {
          setError('missing_slug');
          return;
        }
        const res = await fetch(`/api/journal/${encodeURIComponent(theSlug)}/comments`, {
          credentials: 'same-origin',
        });
        if (res.status === 401) {
          if (mounted) {
            setComments([]);
            setError('unauthenticated');
          }
          return;
        }
        const json = await res.json();
        if (mounted) setComments(json.comments || []);
      } catch (e) {
        if (mounted) setError(String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
  }, [slug, supabase]);
  async function handlePost(e: any) {
    e.preventDefault();
    if (!newContent.trim()) return;
    setPosting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const s = (data as any)?.session || null;
      if (!s || !s.user) {
        setError('unauthenticated');
        setPosting(false);
        return;
      }
      const optimistic = {
        id: `tmp-${Date.now()}`,
        content: newContent,
        created_at: new Date().toISOString(),
        author_display: 'You',
      };
      setComments((c) => [...c, optimistic]);
      let postSlug = slug;
      if (!postSlug && typeof window !== 'undefined') {
        const parts = window.location.pathname.split('/').filter(Boolean);
        const idx = parts.indexOf('journal');
        if (idx >= 0 && parts.length > idx + 1) postSlug = parts[idx + 1];
      }
      if (!postSlug) {
        setError('missing_slug');
        setPosting(false);
        return;
      }
      const res = await fetch(`/api/journal/${encodeURIComponent(postSlug)}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent }),
        credentials: 'same-origin',
      });
      const json = await res.json();
      if (json && json.comment) {
        setComments((c) => c.map((it) => (it.id === optimistic.id ? json.comment : it)));
      }
      setNewContent('');
    } catch (e) {
      setError(String(e));
    } finally {
      setPosting(false);
    }
  }
  return (
    <div className="mt-8">
      <h3 className="font-serif text-2xl mb-4">Comments</h3>
      {loading && <div className="text-sm text-gray-500">Loading comments...</div>}
      {error === 'unauthenticated' && (
        <div className="text-sm text-gray-600 mb-3">Comments are available to registered users only.</div>
      )}
      {error && error !== 'unauthenticated' && (
        <div className="text-sm text-red-600">Error: {error}</div>
      )}
      {!loading && !error && comments.length === 0 && (
        <div className="text-sm text-gray-500 mb-3">No comments yet — be the first!</div>
      )}

      <ul className="space-y-4">
        {comments.map((c) => (
          <li key={c.id} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-mono uppercase tracking-widest text-gray-700">{c.author_display || 'Anonymous'}</div>
              <div className="text-xs text-gray-400">{new Date(c.created_at).toLocaleString()}</div>
            </div>
            <div className="text-gray-900 font-serif leading-relaxed">{c.content}</div>
          </li>
        ))}
      </ul>

      <form onSubmit={handlePost} className="mt-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <label className="block font-mono text-xs uppercase tracking-widest text-gray-500 mb-2">Leave a comment</label>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            className="w-full p-4 border border-gray-100 rounded-md resize-none focus:ring-2 focus:ring-black/10 font-serif text-base"
            rows={4}
            placeholder="Share your thoughts or feedback..."
          />
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                disabled={posting || error === 'unauthenticated' || hasSession === false}
                type="submit"
                className="inline-block border-b-2 border-black pb-1 text-sm font-mono uppercase tracking-widest"
              >
                Send
              </button>
              <button
                type="button"
                onClick={() => setNewContent('')}
                className="px-3 py-2 border rounded-md text-sm"
              >
                Clear
              </button>
            </div>
            <div className="text-xs text-gray-500">Be polite — follow the community rules</div>
          </div>
        </div>
      </form>
    </div>
  );
}
