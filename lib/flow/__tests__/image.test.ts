import {
  canUseNextImage,
  flowImageSrc,
  isSupabaseStorageUrl,
  withSupabaseImageTransform,
} from '../image';

describe('Flow image delivery helpers', () => {
  it('adds a bounded Supabase transform once', () => {
    const source =
      'https://abc.supabase.co/storage/v1/object/public/media/flow/photo.jpg';
    const transformed = withSupabaseImageTransform(source, 900, 78);

    expect(transformed).toContain('width=900');
    expect(transformed).toContain('quality=78');
    expect(withSupabaseImageTransform(transformed, 400, 60)).toBe(transformed);
  });

  it('does not rewrite external images or original URLs', () => {
    const external = 'https://cdn.bsky.app/img/avatar/plain/did/abc.jpg';
    expect(isSupabaseStorageUrl(external)).toBe(false);
    expect(flowImageSrc(external)).toBe(external);
  });

  it('allows configured remote hosts for next/image', () => {
    expect(canUseNextImage('/images/flow.jpg')).toBe(true);
    expect(canUseNextImage('https://cdn.bsky.app/img/feed.jpg')).toBe(true);
    expect(canUseNextImage('https://i.ytimg.com/vi/abc/hqdefault.jpg')).toBe(true);
    expect(canUseNextImage('https://unknown.example.org/image.jpg')).toBe(false);
  });

  it('bypasses next/image for SVG and GIF', () => {
    expect(canUseNextImage('/images/logo.svg')).toBe(false);
    expect(canUseNextImage('https://cdn.bsky.app/image.gif')).toBe(false);
  });
});
