import { TEMPLE_HOME_ASSETS } from '@/lib/temple/homeAssets';

const TEMPLE_FOLDER =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Temple/';

describe('Temple home artwork', () => {
  it('uses the exact owner-supplied files from the Temple folder', () => {
    expect(TEMPLE_HOME_ASSETS).toEqual({
      heart: `${TEMPLE_FOLDER}IMG_1775.png`,
      left: `${TEMPLE_FOLDER}IMG_1776.jpeg`,
      right: `${TEMPLE_FOLDER}IMG_1777.jpeg`,
    });
  });
});
