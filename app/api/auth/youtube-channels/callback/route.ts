import { handleYouTubeChannelsCallback } from '@/lib/youtube/channelsCallback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handleYouTubeChannelsCallback(request);
}
