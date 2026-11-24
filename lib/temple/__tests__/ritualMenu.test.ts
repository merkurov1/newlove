import {
  TEMPLE_RITUAL_LINKS,
  TEMPLE_RITUAL_PATHS,
} from '@/lib/temple/ritualMenu';

describe('Temple ritual menu', () => {
  it('keeps the canonical ritual links', () => {
    expect(TEMPLE_RITUAL_LINKS.map((ritual) => ritual.label)).toEqual([
      'Calm',
      'Let It Go',
      'Absolution',
      'Cast',
    ]);
    expect(TEMPLE_RITUAL_PATHS).toEqual([
      '/heartandangel/calm',
      '/heartandangel/letitgo',
      '/absolution',
      '/cast',
    ]);
  });

  it('never exposes Vigil or Tribute as separate menu items', () => {
    expect(TEMPLE_RITUAL_PATHS).not.toContain('/vigil');
    expect(TEMPLE_RITUAL_PATHS).not.toContain('/tribute');
    expect(
      TEMPLE_RITUAL_LINKS.map((ritual) => ritual.label)
    ).toEqual(expect.not.arrayContaining(['Vigil', 'Tribute']));
  });
});
