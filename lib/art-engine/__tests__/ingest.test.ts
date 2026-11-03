import {
  buildLotRow,
  canonicalUrlFromHtml,
  normalizeSourceUrl,
  toExtractedSpecs,
} from '../ingest';

describe('Art Engine ingestion helpers', () => {
  it('normalizes tracking parameters without changing the lot identity', () => {
    const normalized = normalizeSourceUrl(
      'https://www.christies.com/en/lot/lot-6606657?ldp_breadcrumb=back&utm_source=newsletter#top',
    );

    expect(normalized).toBe('https://christies.com/en/lot/lot-6606657');
  });

  it('extracts a canonical URL from the page', () => {
    expect(
      canonicalUrlFromHtml(
        '<link rel="canonical" href="https://www.sothebys.com/en/buy/auction/2026/example/lot" />',
        'https://www.sothebys.com/en/buy/auction/2026/example/lot?locale=en',
      ),
    ).toBe('https://sothebys.com/en/buy/auction/2026/example/lot');
  });

  it('builds a lot row while preserving existing fields and publication state', () => {
    const row = buildLotRow({
      lot: {
        artist: 'Alma Thomas',
        title: 'Untitled',
        year: 1968,
        medium: 'Acrylic on canvas',
        dimensions: '100 x 80 cm',
        estimate: { raw: '£4,000–£6,000', currency: 'GBP', min: 4000, max: 6000 },
        provenance: ['Private collection', 'Thence by descent'],
        auctionHouse: 'sothebys',
        lotNumber: '42',
      },
      image: {
        storedPath: 'parsed/lot-abc.jpg',
        originalUrl: 'https://images.example.com/original.jpg',
      },
      vault: { schema_version: 1 },
      sourceUrl: 'https://sothebys.com/en/buy/auction/2026/example/lot',
      existing: {
        id: 'existing-id',
        status: 'published',
        ai_content: { curatorial_essay: 'Already written' },
        auction_house: "Sotheby's",
      },
    });

    expect(row.artist).toBe('Alma Thomas');
    expect(row.title).toBe('Untitled');
    expect(row.year).toBe('1968');
    expect(row.image_path).toBe('parsed/lot-abc.jpg');
    expect(row.status).toBe('published');
    expect(row.ai_content).toEqual({ curatorial_essay: 'Already written' });
    expect(row.provenance).toContain('Private collection');
    expect(row.estimate_low).toBe(4000);
    expect(row.estimate_high).toBe(6000);
  });

  it('does not overwrite existing fields with empty extraction', () => {
    const row = buildLotRow({
      lot: { artist: '', title: '', imageUrl: null },
      image: null,
      vault: { schema_version: 1 },
      sourceUrl: 'https://christies.com/lot/1',
      existing: {
        artist: 'Existing Artist',
        title: 'Existing Title',
        image_path: 'parsed/existing.jpg',
        status: 'draft',
      },
    });

    expect(row.artist).toBe('Existing Artist');
    expect(row.title).toBe('Existing Title');
    expect(row.image_path).toBe('parsed/existing.jpg');
  });

  it('builds the legacy specs object expected by the client', () => {
    const specs = toExtractedSpecs({
      medium: 'Oil on canvas',
      dimensions: '100 x 80 cm',
      estimate: { raw: '£4,000–£6,000' },
      auctionHouse: 'christies',
      lotNumber: '42',
      signature: 'Signed and dated 1968',
    });

    expect(specs.medium).toBe('Oil on canvas');
    expect(specs.estimate).toContain('4,000');
    expect(specs.auction_house).toBe("Christie's");
    expect(specs.signature).toContain('1968');
  });
});
