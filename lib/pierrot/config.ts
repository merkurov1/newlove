/**
 * Single source of truth for the homepage composer behaviour.
 *
 * Text at or below the threshold stays in the compact composer. Text above
 * it expands the full conversation surface exactly once per crossing.
 */
export const PIERROT_COMPOSER_EXPAND_THRESHOLD = 100;

/** Self-hosted Pierrot portrait shared by the workspace and Flow reader. */
export const PIERROT_AVATAR_SRC = '/pierrot/pierrot-avatar-512.jpg';

export function shouldExpandPierrotComposer(value: string): boolean {
  return value.length > PIERROT_COMPOSER_EXPAND_THRESHOLD;
}
