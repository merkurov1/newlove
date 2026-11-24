/**
 * Owner-supplied artwork for the Temple homepage triptych.
 *
 * These are the three files uploaded to the public `heartandangel/Temple`
 * folder for this iteration. They must be rendered as-is: the homepage never
 * draws, recolours or generates replacement stained-glass artwork.
 *
 * Keep the URLs literal so the composition can be audited against the owner's
 * supplied assets without guessing which media file is on screen.
 */
export const TEMPLE_HOME_ASSETS = {
  heart:
    'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Temple/IMG_1775.png',
  left: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Temple/IMG_1776.jpeg',
  right:
    'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Temple/IMG_1777.jpeg',
} as const;

export type TempleHomeAsset = keyof typeof TEMPLE_HOME_ASSETS;
