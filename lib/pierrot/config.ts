/**
 * Single source of truth for the homepage composer behaviour.
 *
 * Text at or below the threshold stays in the compact composer. Text above
 * it expands the full conversation surface exactly once per crossing.
 */
export const PIERROT_COMPOSER_EXPAND_THRESHOLD = 100;

/**
 * Future Pierrot avatar. Leave empty to use the typographic "P" placeholder;
 * set a public image path when the final portrait is available.
 */
export const PIERROT_AVATAR_SRC = '/pierrot/pierrot-avatar-512.jpg';

export function shouldExpandPierrotComposer(value: string): boolean {
  return value.length > PIERROT_COMPOSER_EXPAND_THRESHOLD;
}
