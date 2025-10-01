export type GalleryImage = { url: string; alt?: string };

export type Block =
  | { type: 'richText'; html: string }
  | { type: 'gallery'; images: GalleryImage[] }
  | { type: 'codeBlock'; code: string; language: string };
