/**
 * The shared Temple ritual menu.
 *
 * Vigil and Tribute are intentionally absent: Vigil is entered through the
 * living heart, and Tribute is entered through the in-place support flow.
 * Keeping the list in one module makes that rule apply to the Temple home and
 * the Telegram threshold without duplicating route arrays.
 */
export const TEMPLE_RITUAL_LINKS = [
  {
    label: 'Calm',
    href: '/heartandangel/calm',
  },
  {
    label: 'Let It Go',
    href: '/heartandangel/letitgo',
  },
  {
    label: 'Absolution',
    href: '/absolution',
  },
  {
    label: 'Cast',
    href: '/cast',
  },
] as const;

export type TempleRitualLink = (typeof TEMPLE_RITUAL_LINKS)[number];

export const TEMPLE_RITUAL_PATHS = TEMPLE_RITUAL_LINKS.map(
  (ritual) => ritual.href
);
