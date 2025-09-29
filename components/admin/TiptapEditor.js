import React, { useEffect, useState, useCallback } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { lowlight } from 'lowlight';


export default function TiptapEditor({ value, onChange }) {
  const [isUploading, setIsUploading] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false }),
      Link,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      CodeBlockLowlight.configure({ lowlight }),
    ],
    content: value || '',
    autofocus: true,
    onUpdate: ({ editor }) => {
      if (typeof onChange === 'function') {
        onChange(editor.getHTML());
      }
    },
  });

  // Обработчик загрузки изображений
  const handleImageUpload = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch('/api/upload/editor-image', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    setIsUploading(false);
    if (data.success && data.file?.url) {
      editor.chain().focus().setImage({ src: data.file.url }).run();
    } else {
      alert('Ошибка загрузки изображения: ' + (data.error || 'Unknown error'));
    }
  }, [editor]);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Содержимое (Tiptap)</label>
      <div className="mb-2 flex gap-2 items-center">
        <input type="file" accept="image/*" onChange={handleImageUpload} disabled={isUploading} />
        {isUploading && <span className="text-xs text-gray-500">Загрузка...</span>}
      </div>
      <div className="border rounded bg-white min-h-[300px] p-2">
        <EditorContent editor={editor} />
      </div>
      <input type="hidden" name="content" value={editor?.getHTML() || ''} />
    </div>
  );
}
