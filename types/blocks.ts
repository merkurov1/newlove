
export type GalleryImage = { url: string; alt?: string };

export type EditorJsBlock =
  // Стандартные типы Editor.js
  | { type: 'paragraph'; data: { text: string } }
  | { type: 'header'; data: { text: string; level: number } }
  | { type: 'list'; data: { style: 'ordered' | 'unordered'; items: string[] } }
  | { type: 'code'; data: { code: string } }
  | { type: 'image'; data: { file?: { url: string }; url?: string; caption?: string } }
  // Кастомные типы (обратная совместимость)
  | { type: 'richText'; data: { html: string } }
  | { type: 'gallery'; data: { images: GalleryImage[] } }
  | { type: 'columns'; data: { columns: Array<{ html: string }> } }
  | { type: 'quote'; data: { text: string; author?: string; source?: string } }
  | { type: 'video'; data: { url: string; caption?: string; platform?: 'youtube' | 'vimeo' | 'other' } }
  | { type: 'link'; data: { link: string; meta?: { title?: string; url?: string } } };

