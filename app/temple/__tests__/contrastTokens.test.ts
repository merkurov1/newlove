/**
 * Contrast audit for the Temple's text tokens.
 *
 * The surfaces use a small set of literal colours. This test records the
 * measured pairs so a future palette edit that drops below WCAG AA fails here
 * before it reaches a device. Large display type may use 3:1; every pair below
 * is normal-sized text and therefore held to 4.5:1.
 */

function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) =>
    parseInt(value.slice(offset, offset + 2), 16)
  );

  const [r, g, b] = channels.map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.03928
      ? srgb / 12.92
      : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);

  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const NORMAL_TEXT_PAIRS: Array<[name: string, foreground: string, background: string]> = [
  ['Temple faint ink on canvas', '#716558', '#f6f1e8'],
  ['Temple muted ink on canvas', '#665b4f', '#f6f1e8'],
  ['Temple ink on canvas', '#251f1a', '#f6f1e8'],
  ['Temple gold on canvas', '#7d5e2c', '#f6f1e8'],
  ['Temple error on canvas', '#8d2f28', '#f6f1e8'],
  ['Vigil ink on chapel', '#f3e9d7', '#13100d'],
  ['Vigil muted on chapel', '#b9aa95', '#13100d'],
  ['Vigil faint on chapel', '#95846e', '#13100d'],
  ['Vigil gold on chapel', '#e7b766', '#13100d'],
  ['Absolution body on night', '#a8a29e', '#141210'],
  ['Absolution certificate label', '#57534e', '#f8f2e6'],
  ['Cast page muted on parchment', '#665b4f', '#f6f1e8'],
  ['Cast page faint on parchment', '#716558', '#f6f1e8'],
  ['Cast lamplight ink on stone', '#f6f1e8', '#1c1713'],
  ['Cast lamplight muted on stone', '#cfc0a8', '#1c1713'],
  ['Cast lamplight faint on stone', '#b8a78f', '#1c1713'],
  ['Cast lamplight gold on stone', '#e4bc72', '#1c1713'],
  ['Cast lamplight error on stone', '#f0a79f', '#1c1713'],
  ['Chronicles ink on stone', '#f6f1e8', '#443521'],
  ['Chronicles muted on stone', '#cfc0a8', '#443521'],
  ['Chronicles faint on stone', '#b8a78f', '#443521'],
  ['Chronicles gold on stone', '#e4bc72', '#443521'],
  ['Chronicles focus on stone', '#a9c8f0', '#443521'],
];

describe('Temple contrast tokens', () => {
  it.each(NORMAL_TEXT_PAIRS)(
    '%s meets WCAG AA for normal text',
    (_name, foreground, background) => {
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
  );
});
