import React, { useCallback, useRef } from 'react';
import SimpleMdeReact from 'react-simplemde-editor';
import 'easymde/dist/easymde.min.css';

export default function TiptapEditor({ value, onChange }) {
  const mdeRef = useRef();

  // Загрузка изображения через Supabase
  const handleImageUpload = useCallback(async (file, onSuccess, onError) => {
    const formData = new FormData();
    formData.append('image', file);
    try {
      const res = await fetch('/api/upload/editor-image', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.file?.url) {
        onSuccess(data.file.url);
      } else {
        onError(data.error || 'Ошибка загрузки');
      }
    } catch (e) {
      onError(e.message);
    }
  }, []);

  // Настройка SimpleMDE для вставки изображений
  const getMdeOptions = useCallback(() => ({
    spellChecker: false,
    autosave: { enabled: false },
    placeholder: 'Введите текст...',
    previewRender: (plainText) => {
      // Можно добавить markdown-it для расширенного рендера
      return window.marked ? window.marked(plainText) : plainText;
    },
    toolbar: [
      'bold', 'italic', 'heading', '|', 'quote', 'unordered-list', 'ordered-list', '|',
      'link', {
        name: 'image',
        action: function customImageUpload(editor) {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.onchange = () => {
            const file = input.files[0];
            if (!file) return;
            handleImageUpload(file, (url) => {
              const cm = editor.codemirror;
              const pos = cm.getCursor();
              cm.replaceRange(`![](${url})`, pos);
            }, (err) => {
              alert('Ошибка загрузки: ' + err);
            });
          };
          input.click();
        },
        className: 'fa fa-image',
        title: 'Загрузить изображение',
      }, '|', 'table', 'code', 'preview', 'side-by-side', 'fullscreen', 'guide'
    ],
    renderingConfig: {
      codeSyntaxHighlighting: true,
    },
  }), [handleImageUpload]);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Содержимое (Markdown)</label>
      <SimpleMdeReact
        id="content-editor"
        value={value || ''}
        onChange={onChange}
        options={getMdeOptions()}
        getMdeInstance={(instance) => { mdeRef.current = instance; }}
      />
      <textarea name="content" value={value || ''} readOnly hidden />
    </div>
  );
}
