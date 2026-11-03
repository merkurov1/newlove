import { ParserRegistry, parserRegistry } from '../registry';

const HOUSE_HTML = `<!doctype html>
<html>
  <head>
    <meta property="og:title" content="GENERIC OG TITLE" />
    <meta property="og:image" content="https://images.example.com/og.jpg" />
    <script type="application/ld+json">
      {
        "@type": "VisualArtwork",
        "name": "JSON-LD TITLE",
        "creator": { "name": "JSON-LD ARTIST" },
        "artMedium": "Oil on canvas",
        "image": "https://images.example.com/jsonld.jpg",
        "offers": { "lowPrice": 1000, "highPrice": 2000, "priceCurrency": "GBP" }
      }
    </script>
  </head>
  <body>
    <h1 class="lot-title">HOUSE TITLE</h1>
    <div class="lot-detail__title">HOUSE TITLE</div>
    <div class="artist-name">HOUSE ARTIST</div>
    <div class="lot-artist-name">HOUSE ARTIST</div>
    <div class="artist-title">HOUSE ARTIST</div>
    <div class="lot-detail__artist">HOUSE ARTIST</div>
    <div class="lot-number">LOT 42</div>
    <div class="estimate">£4,000 – £6,000</div>
    <div class="lot-estimate">£4,000 – £6,000</div>
    <div class="medium">Oil on canvas</div>
    <div class="dimensions">100 x 80 cm</div>
    <div class="lot-image"><img src="https://images.example.com/house.jpg" /></div>
  </body>
</html>`;

const JSON_LD_ONLY_HTML = `<!doctype html>
<html>
  <head>
    <script type="application/ld+json">
      {
        "@type": "VisualArtwork",
        "name": "JSON ONLY TITLE",
        "creator": { "name": "JSON ONLY ARTIST" },
        "artMedium": "Acrylic on canvas",
        "dateCreated": "1968",
        "image": "https://images.example.com/json-only.jpg"
      }
    </script>
  </head>
  <body><div class="page-empty"></div></body>
</html>`;

describe('ParserRegistry', () => {
  const registry = new ParserRegistry();

  it.each([
    ['christies', 'https://www.christies.com/en/lot/lot-123'],
    ['sothebys', 'https://www.sothebys.com/en/buy/auction/2026/example/123'],
    ['phillips', 'https://www.phillips.com/detail/example/123'],
    ['bonhams', 'https://www.bonhams.com/auction/123/lot/42/example/'],
  ])('uses the %s house parser instead of generic JSON-LD', (house, url) => {
    const result = registry.parse(HOUSE_HTML, url);

    expect(result.parserName).toBe(house);
    expect(result.parserVersion).toBeTruthy();
    expect(result.source).toBe('house-parser');
    expect(result.title).toBe('HOUSE TITLE');
    expect(result.artist).toBe('HOUSE ARTIST');
    expect(result.lotNumber).toBe('LOT 42');
    expect(result.medium).toBe('Oil on canvas');
    expect(result.dimensions).toBe('100 x 80 cm');
    expect(result.auctionHouse).toBe(house);
    expect(result.imageUrl).toBe('https://images.example.com/og.jpg');
    expect(result.imageCandidates?.some((candidate) => candidate.url.includes('house.jpg') || candidate.url.includes('og.jpg'))).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('fills missing house fields from JSON-LD without overwriting house data', () => {
    const result = registry.parse(JSON_LD_ONLY_HTML, 'https://www.christies.com/en/lot/lot-123');

    expect(result.parserName).toBe('christies');
    expect(result.source).toBe('house-parser');
    expect(result.title).toBe('JSON ONLY TITLE');
    expect(result.artist).toBe('JSON ONLY ARTIST');
    expect(result.medium).toBe('Acrylic on canvas');
    expect(result.year).toBe(1968);
  });

  it('uses the generic fallback for an unknown auction house', () => {
    const result = registry.parse(HOUSE_HTML, 'https://example.com/lot/42');

    expect(result.auctionHouse).toBe('unknown');
    expect(result.source === 'fallback' || result.source === 'generic-json-ld').toBe(true);
    expect(result.imageUrl).toContain('images.example.com');
    expect(result.warnings?.length).toBeGreaterThan(0);
  });

  it('detects the four supported houses', () => {
    expect(registry.detectHouse('https://www.christies.com/lot')).toBe('christies');
    expect(registry.detectHouse('https://www.sothebys.com/lot')).toBe('sothebys');
    expect(registry.detectHouse('https://www.phillips.com/lot')).toBe('phillips');
    expect(registry.detectHouse('https://www.bonhams.com/lot')).toBe('bonhams');
    expect(registry.detectHouse('https://example.com/lot')).toBe('unknown');
  });

  it('exports a shared registry for the ingestion route', () => {
    expect(parserRegistry).toBeInstanceOf(ParserRegistry);
  });

  it('does not merge by artist/title alone into a new work (identity is a later stage)', () => {
    // Guardrail: Stage 1 must not silently group lots. This test documents that
    // the parser itself performs no identity merging.
    const first = registry.parse(HOUSE_HTML, 'https://www.christies.com/en/lot/lot-1');
    const second = registry.parse(HOUSE_HTML, 'https://www.sothebys.com/en/lot/lot-2');

    expect(first.title).toBe(second.title);
    expect(first.url).not.toBe(second.url);
  });
});
