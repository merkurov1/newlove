import { parseUrl } from '@/lib/flow/parseUrl';
import { checkRateLimit } from '@/lib/rateLimit';

function getLegacyClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const limited = checkRateLimit(getLegacyClientIp(req), {
    interval: 60 * 1000,
    maxRequests: 20,
    keyPrefix: 'link-preview',
  });
  if (limited) {
    res.status(limited.status);
    limited.headers.forEach((value, key) => res.setHeader(key, value));
    return res.json(await limited.json());
  }

  const url = req.query.url || req.body?.url;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url parameter is required' });
  }
  if (url.length > 2_048) {
    return res.status(413).json({ error: 'URL is too long' });
  }

  try {
    const data = await parseUrl(url);
    return res.status(200).json(data);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid URL' });
  }
}
