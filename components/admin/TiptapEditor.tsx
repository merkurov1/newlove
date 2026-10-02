"use client";

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { useEffect } from 'react';

interface TiptapEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
}

export default function TiptapEditor({
  value,
  onChange,
  placeholder = 'Напишите что-нибудь...',
  minHeight = '140px',
}: TiptapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline underline-offset-2 hover:text-blue-800',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-neutral max-w-none focus:outline-none min-h-[inherit] px-4 py-3 text-neutral-900',
      },
    },
  });

  // Синхронизация внешнего значения при изменении извне
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      if (editor.isEmpty && !value) return;
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) {
    return <div className="animate-pulse bg-neutral-100 rounded-lg" style={{ minHeight }} />;
  }

  return (
    <div className="border border-neutral-200 rounded-xl bg-white focus-within:border-neutral-400 focus-within:ring-1 focus-within:ring-neutral-400 transition-all overflow-hidden shadow-2xs">
      {/* Компактная панель форматирования */}
      <div className="flex flex-wrap items-center gap-1 px-3 py-2 bg-neutral-50/80 border-b border-neutral-200 text-neutral-600 text-xs">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`px-2.5 py-1 rounded font-semibold transition-colors ${
            editor.isActive('bold') ? 'bg-neutral-200 text-neutral-900' : 'hover:bg-neutral-200/60'
          }`}
          title="Жирный"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`px-2.5 py-1 rounded italic transition-colors ${
            editor.isActive('italic') ? 'bg-neutral-200 text-neutral-900' : 'hover:bg-neutral-200/60'
          }`}
          title="Курсив"
        >
          I
        </button>
        <div className="w-px h-4 bg-neutral-300 mx-1" />
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`px-2.5 py-1 rounded font-medium transition-colors ${
            editor.isActive('heading', { level: 2 }) ? 'bg-neutral-200 text-neutral-900' : 'hover:bg-neutral-200/60'
          }`}
          title="Заголовок H2"
        >
          H2
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`px-2.5 py-1 rounded font-medium transition-colors ${
            editor.isActive('heading', { level: 3 }) ? 'bg-neutral-200 text-neutral-900' : 'hover:bg-neutral-200/60'
          }`}
          title="Заголовок H3"
        >
          H3
        </button>
        <div className="w-px h-4 bg-neutral-300 mx-1" />
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`px-2.5 py-1 rounded transition-colors ${
            editor.isActive('bulletList') ? 'bg-neutral-200 text-neutral-900' : 'hover:bg-neutral-200/60'
          }`}
          title="Маркированный список"
        >
          • Список
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`px-2.5 py-1 rounded transition-colors ${
            editor.isActive('blockquote') ? 'bg-neutral-200 text-neutral-900' : 'hover:bg-neutral-200/60'
          }`}
          title="Цитата"
        >
          “ Цитата
        </button>
      </div>

      {/* Область ввода */}
      <div style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
