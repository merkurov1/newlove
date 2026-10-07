import type { AuctionHouse, LotData } from "./types";

/**
 * Base class for auction house-specific parsers.
 * Each subclass implements parse() with domain-specific selectors and logic.
 */
export abstract class HouseParser {
  abstract readonly houseId: AuctionHouse;
  abstract readonly matches: string[];

  /**
   * Check if this parser supports the given URL
   */
  supports(url: string): boolean {
    const u = url.toLowerCase();
    return this.matches.some((m) => u.includes(m));
  }

  /**
   * Normalize whitespace and HTML entities
   */
  protected normalizeText(value?: string | null): string | null {
    if (!value) return null;
    return value
      .replace(/\s+/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  /**
   * Parse numeric value, handling both US (1,000.00) and EU (1.000,00) formats
   */
  protected parseNumber(value?: string | null): number | null {
    if (!value) return null;
    let cleaned = value.replace(/[^0-9.,-]/g, "").trim();
    if (!cleaned || cleaned === "-" || cleaned === ".") return null;

    // Detect format by position of separators
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      // EU format: 1.000,00
      cleaned = cleaned.replace(/\./g, "").replace(/,/, ".");
    } else {
      // US format: 1,000.00
      cleaned = cleaned.replace(/,/g, "");
    }

    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Extract year from text (looks for 4-digit numbers in common date ranges)
   */
  protected parseYear(value?: string | null): number | null {
    if (!value) return null;
    const match = value.match(/\b(1[0-9]{3}|19[0-9]{2}|20[0-9]{2})\b/);
    return match ? Number(match[1]) : null;
  }

  /**
   * Detect currency from text
   */
  protected detectCurrency(text?: string | null): string | undefined {
    if (!text) return undefined;
    const t = text.toUpperCase();

    if (t.includes("USD") || t.includes("$")) return "USD";
    if (t.includes("GBP") || t.includes("£")) return "GBP";
    if (t.includes("EUR") || t.includes("€")) return "EUR";
    if (t.includes("CHF")) return "CHF";
    if (t.includes("RUB") || t.includes("₽")) return "RUB";
    return "UNKNOWN";
  }

  /**
   * Parse estimate range from text like "$1,000 - $2,000" or "£5,000 to £10,000"
   */
  protected parseEstimate(value?: string | null) {
    if (!value) return null;
    const text = this.normalizeText(value);
    if (!text) return null;

    const currency = this.detectCurrency(text);

    // Try multiple range patterns
    const patterns = [
      text.match(/(\d[\d\s,\.]*)[–-–—]\s*(\d[\d\s,\.]*)/),
      text.match(/\b(\d[\d\s,\.]*)?\s+to\s+(\d[\d\s,\.]*)/i),
      text.match(/estimate[\s:]*([\d,\.\s–-–—\$£€]+)/i),
    ];

    for (const match of patterns) {
      if (!match) continue;
      const nums = [
        this.parseNumber(match[1]),
        match[2] ? this.parseNumber(match[2]) : null,
      ].filter((n): n is number => n !== null);

      if (nums.length > 0) {
        return {
          raw: text,
          currency,
          min: Math.min(...nums),
          max: Math.max(...nums),
        };
      }
    }

    return null;
  }

  /**
   * Pick first non-null/non-undefined value from arguments
   */
  protected pickFirst<T>(...values: Array<T | null | undefined>): T | null {
    for (const v of values) {
      if (v !== null && v !== undefined) return v;
    }
    return null;
  }

  /**
   * Parse HTML and return normalized LotData
   */
  abstract parse(html: string, url: string): LotData;
}
