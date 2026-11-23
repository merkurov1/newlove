/** @jest-environment node */

import { readFileSync } from 'fs';
import path from 'path';

describe('Vercel Git deployment policy', () => {
  it('never auto-deploys main to production while keeping previews for other branches', () => {
    const config = JSON.parse(readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8')) as {
      git?: { deploymentEnabled?: Record<string, boolean> };
    };

    expect(config.git?.deploymentEnabled?.main).toBe(false);
    expect(config.git?.deploymentEnabled?.['*']).toBe(true);
  });
});
