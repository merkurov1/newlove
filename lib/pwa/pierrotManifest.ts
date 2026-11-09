export const PIERROT_PWA_SCOPE = '/admin/pierrot';
export const PIERROT_PWA_START_URL = '/admin/pierrot';
export const PIERROT_PWA_THEME = '#F8F6F1';

export function buildPierrotManifest() {
  return {
    name: 'Pierrot',
    short_name: 'Pierrot',
    description: 'Owner workspace for merkurov.love',
    id: PIERROT_PWA_START_URL,
    start_url: PIERROT_PWA_START_URL,
    scope: PIERROT_PWA_SCOPE,
    display: 'standalone',
    orientation: 'any',
    theme_color: PIERROT_PWA_THEME,
    background_color: PIERROT_PWA_THEME,
    lang: 'ru',
    icons: [
      {
        src: '/pierrot/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pierrot/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pierrot/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  } as const;
}
