/** @jest-environment node */

import {
  buildEssayUserPayload,
  generateCuratorialEssay,
  sanitizeEssay,
} from '../essay';
import type { NormalizedExtraction } from '../types';

const extraction: NormalizedExtraction = {
  title: 'Elephants',
  artist: 'Michael Armitage',
  artistDates: 'b. 1984',
  auctionHouse: "Christie's",
  year: 2015,
  medium: 'oil on lubugo bark cloth',
  dimensions: '170 x 221 cm',
  signature: "signed, titled and dated 'elephants 2015 Michael Armitage'",
  description: 'Two elephants against a green and purple ground.',
  lotEssay: 'A documented lot essay about the painting.',
  catalogueNote: null,
  conditionReport: null,
  conditionReportStatus: 'unknown',
  provenance: ['White Cube, London'],
  exhibitions: [],
  literature: [],
  lotNumber: '3',
  auctionDate: '2026-10-14',
  estimate: { raw: 'GBP 500,000 – 700,000', currency: 'GBP', min: 500000, max: 700000 },
  price: { raw: 'GBP 1,126,400', currency: 'GBP', realized: 1126400 },
  currency: 'GBP',
};

describe('Selection essay helpers', () => {
  it('passes only supported facts and the Wikipedia extract to the model', () => {
    const payload = buildEssayUserPayload({
      extraction,
      wikipedia: {
        status: 'found',
        artist: 'Michael Armitage',
        title: 'Michael Armitage',
        url: 'https://en.wikipedia.org/wiki/Michael_Armitage',
        extract: 'Michael Armitage is a Kenyan-born British painter.',
        warnings: [],
      },
      sourceUrl: 'https://www.christies.com/lot/1',
    });

    expect(payload).toContain('Elephants');
    expect(payload).toContain('oil on lubugo bark cloth');
    expect(payload).toContain('Michael Armitage is a Kenyan-born British painter.');
    expect(payload).not.toContain('market analysis');
  });

  it('removes markdown fences and headings from the generated essay', () => {
    expect(
      sanitizeEssay('```markdown\n# Heading\n\nThe painting is quiet.\n```'),
    ).toBe('The painting is quiet.');
  });

  it('generates and sanitizes an essay through the injected client', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content:
              'The painting holds its distance.\n\nIts surface is worked and reworked.',
          },
        },
      ],
    });

    const result = await generateCuratorialEssay(
      {
        extraction,
        wikipedia: null,
      },
      {
        client: { chat: { completions: { create } } },
        model: 'test-model',
      },
    );

    expect(result.essay).toContain('The painting holds its distance.');
    expect(result.model).toBe('test-model');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('keeps the error visible when the model fails', async () => {
    const create = jest.fn().mockRejectedValue(new Error('model unavailable'));

    await expect(
      generateCuratorialEssay(
        { extraction, wikipedia: null },
        { client: { chat: { completions: { create } } } },
      ),
    ).rejects.toThrow('model unavailable');
  });
});
