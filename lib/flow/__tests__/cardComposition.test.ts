import { describe, expect, it } from '@jest/globals';
import { flowCardLeadsWithMedia, resolveFlowCardComposition } from '../cardComposition';

describe('Flow card composition', () => {
  it('leads with the image when a post has both image and text', () => {
    const composition = resolveFlowCardComposition({
      hasText: true,
      images: 2,
      videos: 0,
      links: 0,
    });

    expect(composition).toBe('image-text');
    expect(flowCardLeadsWithMedia(composition)).toBe(true);
  });

  it('detects text-only, link and video posts', () => {
    expect(resolveFlowCardComposition({ hasText: true, images: 0, videos: 0, links: 0 })).toBe(
      'text'
    );
    expect(resolveFlowCardComposition({ hasText: false, images: 0, videos: 0, links: 1 })).toBe(
      'link'
    );
    expect(resolveFlowCardComposition({ hasText: true, images: 0, videos: 1, links: 0 })).toBe(
      'video-text'
    );
    expect(resolveFlowCardComposition({ hasText: true, images: 0, videos: 0, links: 2 })).toBe(
      'text-link'
    );
  });

  it('never makes text the leading element when media exists', () => {
    const withImage = resolveFlowCardComposition({
      hasText: true,
      images: 1,
      videos: 0,
      links: 0,
    });
    const withVideo = resolveFlowCardComposition({
      hasText: true,
      images: 0,
      videos: 1,
      links: 0,
    });

    expect(flowCardLeadsWithMedia(withImage)).toBe(true);
    expect(flowCardLeadsWithMedia(withVideo)).toBe(true);
  });
});
