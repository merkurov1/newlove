import { extractYouTubeVideoId } from '@/lib/flow/youtube';
import { UNFRAMED_EPISODES } from '@/lib/unframed/episodes';

import { YOUTUBE_SHARED_PROJECTS } from './config';

/**
 * Project context is metadata, never an analytics filter.
 *
 * The YouTube channel is shared, so every report can read the whole channel.
 * This map only answers "which project published this video?" when the owner
 * asks about a specific episode.
 */
export type YouTubeProjectLink = {
  projectSlug: string;
  projectName: string;
  episodeLabel: string | null;
};

const KNOWN_LINKS = new Map<string, YouTubeProjectLink>();

for (const episode of UNFRAMED_EPISODES) {
  const videoId = extractYouTubeVideoId(episode.video.url);

  if (videoId) {
    KNOWN_LINKS.set(videoId, {
      projectSlug: 'unframed',
      projectName: 'UNFRAMED',
      episodeLabel: `Episode ${episode.number} — ${episode.title}`,
    });
  }
}

export function getYouTubeProjectLink(videoId: string | null): YouTubeProjectLink | null {
  if (!videoId) return null;
  return KNOWN_LINKS.get(videoId) ?? null;
}

export function getYouTubeSharedProjects(): Array<{ slug: string; name: string }> {
  return YOUTUBE_SHARED_PROJECTS.map((project) => ({ ...project }));
}

const TITLE_ALIASES: Array<{ pattern: RegExp; videoId: string }> = [
  { pattern: /spectral\s+tiger|спектральн[а-яё]*\s+тигр/i, videoId: 'TmC6Lr5K4R8' },
  {
    pattern: /step\s+out\s+of\s+the\s+physical\s+container|physical\s+container|эпизод\s+42/i,
    videoId: 'ZGhmmDVVwQg',
  },
];

export function findKnownVideoIds(value: string): string[] {
  return Array.from(
    new Set(
      TITLE_ALIASES.filter((alias) => alias.pattern.test(value)).map((alias) => alias.videoId)
    )
  );
}

export function findKnownVideoId(value: string): string | null {
  return findKnownVideoIds(value)[0] ?? null;
}
