// pages/api/link-preview.js
import { NextResponse } from 'next/server';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');
  if (!url) return NextResponse.json({}, { status: 400 });

  try {
    const res = await fetch(`https://jsonlink.io/api/extract?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error('Ошибка запроса к jsonlink.io');
    const data = await res.json();
    return NextResponse.json({
      title: data.title,
      description: data.description,
      image: data.images?.[0] || null,
      siteName: data.site_name || data.domain,
    });
  } catch {
    return NextResponse.json({}, { status: 500 });
  }
}
