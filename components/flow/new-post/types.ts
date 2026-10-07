export type YouTubeMetadata = {
  video_id?: string;
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  provider_name?: string;
};

export type Item = {
  id: string;
  type: string;
  status: string;
  visibility: string;
  lang: string;
  slug: string | null;
  title: string | null;
  body_md: string | null;
  source_url: string | null;
  ai_allowed: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

export type NewPostModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: (item: Item) => void;
  itemId?: string | null;
};

export type SaveState =
  | "idle"
  | "saving"
  | "saved"
  | "error"
  | "clearing";

export type LinkPreview = {
  url?: string;
  title?: string;
  description?: string;
  image?: string;
  site_name?: string;
  favicon?: string;
  domain?: string;
};

export type ComposerMode =
  | "text"
  | "link"
  | "video"
  | "photo";