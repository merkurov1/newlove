export type RichTextBlock = {
  type: 'richText';
  html: string;
};

export type GalleryImage = {
  src: string;
  alt?: string;
};

export type GalleryBlock = {
  type: 'gallery';
  images: GalleryImage[];
};

export type CodeBlock = {
  type: 'codeBlock';
  language: string;
  code: string;
};

export type ContentBlock = RichTextBlock | GalleryBlock | CodeBlock;
