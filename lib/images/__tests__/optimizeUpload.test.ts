/** @jest-environment node */

import sharp from 'sharp';
import { optimizeUploadImage } from '../optimizeUpload';

describe('Flow upload image optimization', () => {
  it('resizes a large JPEG before storage', async () => {
    const source = await sharp({
      create: {
        width: 2600,
        height: 1700,
        channels: 3,
        background: '#b7791f',
      },
    })
      .jpeg({ quality: 100 })
      .toBuffer();

    const result = await optimizeUploadImage(source, 'image/jpeg');

    expect(result.optimized).toBe(true);
    expect(result.width).toBe(2000);
    expect(result.height).toBeLessThan(1700);
    expect(result.buffer.length).toBeLessThan(source.length);
    expect(result.mimeType).toBe('image/jpeg');
  });

  it('leaves animated GIFs untouched', async () => {
    const source = Buffer.from('GIF89a');
    const result = await optimizeUploadImage(source, 'image/gif');
    expect(result.optimized).toBe(false);
    expect(result.buffer).toBe(source);
  });
});
