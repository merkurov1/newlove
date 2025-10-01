
export type GalleryImage = { url: string; alt?: string };

export type EditorJsBlock =
  | { type: 'richText'; data: { html: string } }
  | { type: 'gallery'; data: { images: GalleryImage[] } }
  | { type: 'image'; data: { url: string; caption?: string } }
  | { type: 'code'; data: { code: string } };
