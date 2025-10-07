import fetch from 'node-fetch';

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 7000 });
    const html = await res.text();
    
    // Примитивный парсер OG-метаданных
    const getMeta = (property: string) => {
      const regex = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
      const match = html.match(regex);
      return match ? match[1] : undefined;
    };
    const getMetaName = (name: string) => {
      const regex = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i');
      const match = html.match(regex);
      return match ? match[1] : undefined;
    };

    const title = getMeta('og:title') || getMetaName('title') || html.match(/<title>([^<]*)<\/title>/i)?.[1];
    const description = getMeta('og:description') || getMetaName('description');
    const image = getMeta('og:image');

    return {
      url,
      title,
      description,
      image,
    };
  } catch (e) {
    return null;
  }
}
