import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const VISITOR_FILES = [
  'app/temple/TempleClient.tsx',
  'app/temple/TempleLogs.client.tsx',
  'app/temple/support/TempleSupportClient.tsx',
  'app/temple/support/page.tsx',
  'app/vigil/VigilExperience.tsx',
  'app/vigil/useVigilController.ts',
  'app/absolution/AbsolutionClient.tsx',
  'app/cast/CastClient.tsx',
  'app/cast/page.tsx',
  'app/cast/layout.tsx',
  'components/TempleTopBar.tsx',
  'components/temple/AbsolutionModal.tsx',
  'components/temple/AddToHomePrompt.tsx',
  'components/temple/RitualModal.tsx',
  'components/temple/SharedVigil.tsx',
  'components/temple/TempleChronicles.tsx',
];

/**
 * A tiny visible-string guard. It does not try to parse JSX: it only ensures
 * that phrases which exposed implementation details or guilt in the previous
 * Temple voice cannot quietly return.
 */
const RETIRED_PHRASES = [
  'Left without a trace',
  'Protocol ID',
  'Core Error',
  'CORE ACCESS GRANTED',
  'Psychological Protocol',
  'Cast Protocol',
  'Persist Result in Archive',
  'Protocol secured to your email',
  'trace could not be recorded',
  'Temple trace recorded',
  'recording trace',
  'eligible ritual traces',
  'Vigil state unavailable',
  'Telegram launch data',
  'Transmitting Spark',
  'Vigil claim failed',
  'secure Stripe checkout',
  'webhook',
];

describe('Temple visitor copy inventory', () => {
  it.each(VISITOR_FILES)('%s does not contain retired internal copy', (file) => {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');

    for (const phrase of RETIRED_PHRASES) {
      expect(source).not.toContain(phrase);
    }
  });

  it('keeps the gentler language for a short visit and empty chronicle', () => {
    const temple = fs.readFileSync(
      path.join(ROOT, 'app/temple/TempleClient.tsx'),
      'utf8'
    );
    const chronicles = fs.readFileSync(
      path.join(ROOT, 'components/temple/TempleChronicles.tsx'),
      'utf8'
    );

    expect(temple).toContain('Your visit stays with the Temple');
    expect(temple).toContain('No traces yet. The first ritual will leave a mark.');
    expect(chronicles).toContain('The chronicle is still empty.');
    expect(chronicles).toContain('Rituals kept');
  });
});
