import { parseUrl } from '@/lib/flow/parseUrl';

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  try {
    const data = await parseUrl(url);
    if (!data) return null;
    return {
      url: data.url,
      title: data.title ?? undefined,
      description: data.description ?? undefined,
      image: data.image ?? undefined,
    };
  } catch (e) {
    return null;
  }
}
