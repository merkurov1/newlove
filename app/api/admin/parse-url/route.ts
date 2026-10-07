import { ParserRegistry } from "../registry";

describe("ParserRegistry", () => {
  it("detects Christies URL", () => {
    const registry = new ParserRegistry();
    expect(registry.detectHouse("https://www.christies.com/en/lot/lot-1234567")).toBe("christies");
  });

  it("parses Christies HTML using house-specific logic", () => {
    const registry = new ParserRegistry();
    const html = `
      <html>
        <head>
          <meta property="og:image" content="https://cdn.example.com/art.jpg" />
        </head>
        <body>
          <div data-testid="lot-title">The Sun</div>
          <div data-testid="artist-name">Andy Warhol</div>
          <div data-testid="estimate">USD 100,000 - 150,000</div>
          <div data-testid="sale-price">$125,000</div>
        </body>
      </html>
    `;

    const result = registry.parse(html, "https://www.christies.com/en/lot/lot-1234567");

    expect(result?.auctionHouse).toBe("christies");
    expect(result?.title).toBe("The Sun");
    expect(result?.artist).toBe("Andy Warhol");
    expect(result?.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result?.source).toBe("house-parser");
  });

  it("uses fallback parser for unsupported domains", () => {
    const registry = new ParserRegistry();
    const html = `
      <html>
        <head>
          <title>Example Auction Lot</title>
          <meta property="og:image" content="https://cdn.example.com/fallback.jpg" />
        </head>
        <body>
          <h1>Moonlight</h1>
          <p>Artist: Jane Doe</p>
          <p>Estimate: $50,000 - $80,000</p>
        </body>
      </html>
    `;

    const result = registry.parse(html, "https://example.com/auction/lot-1");

    expect(result?.auctionHouse).toBe("unknown");
    expect(result?.source).toBe("fallback");
    expect(result?.title).toBe("Moonlight");
    expect(result?.confidence).toBeGreaterThanOrEqual(0.2);
  });
});
