/**
 * Shared composition rules for Flow cards.
 *
 * Both the public /flow page and the owner Flow workspace use this helper so a
 * post with media and text is always rendered in the same order: media first,
 * title/body after it. Links remain the primary surface of link-only posts.
 */
export type FlowCardComposition =
  'image-text' | 'image' | 'video-text' | 'video' | 'text-link' | 'text' | 'link' | 'empty';

export function resolveFlowCardComposition(input: {
  hasText: boolean;
  images: number;
  videos: number;
  links: number;
}): FlowCardComposition {
  if (input.images > 0) return input.hasText ? 'image-text' : 'image';
  if (input.videos > 0) return input.hasText ? 'video-text' : 'video';
  if (input.hasText) return input.links > 0 ? 'text-link' : 'text';
  if (input.links > 0) return 'link';
  return 'empty';
}

export function flowCardLeadsWithMedia(composition: FlowCardComposition): boolean {
  return (
    composition === 'image-text' ||
    composition === 'image' ||
    composition === 'video-text' ||
    composition === 'video'
  );
}
