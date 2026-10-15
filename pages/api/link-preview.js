import { parseUrl } from '@/lib/flow/parseUrl';

export default async function handler(req, res) {
  const url = req.query.url || req.body?.url;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url parameter is required' });
  }

  try {
    const data = await parseUrl(url);
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to parse link' });
  }
}
