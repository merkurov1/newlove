
import React from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';



export default function TiptapEditor({ value, onChange }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link,
    ],
    content: value || '',
    autofocus: true,
    onUpdate: ({ editor }) => {
      if (typeof onChange === 'function') {
        onChange(editor.getHTML());
      }
    },
  });

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Содержимое (Tiptap)</label>
      <div className="border rounded bg-white min-h-[300px] p-2">
        <EditorContent editor={editor} />
      </div>
      <input type="hidden" name="content" value={editor?.getHTML() || ''} />
    </div>
  );
}
