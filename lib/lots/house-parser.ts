import type {
  AuctionHouse,
  EstimateRange,
  LotData,
  NormalizedPrice,
} from "./types";

export abstract class HouseParser {
  abstract readonly houseId: AuctionHouse;
  abstract readonly matches: string[];

  abstract parse(html: string, url: string): LotData;

  supports(url: string): boolean {
    const lower = url.toLowerCase();
    return this.matches.some((match) => lower.includes(match));
  }

  protected normalizeText(value?: string | null): string | null {
    if (!value) return null;

    const normalized = value
      .replace(/\s+/g, " ")
      .replace(/\u00a0/g, " ")
      .trim();

    return normalized || null;
  }

  protected parseYear(value?: string | null): number | null {
    if (!value) return null;

    const match = value.match(/\b(18|19|20)\d{2}\b/);
    return match ? Number(match[0]) : null;
  }

  protected detectCurrency(
    value?: string | null
  ): string | undefined {
    if (!value) return undefined;

    if (/\bUSD\b|\$/i.test(value)) return "USD";
    if (/\bGBP\b|£/i.test(value)) return "GBP";
    if (/\bEUR\b|€/i.test(value)) return "EUR";
    if (/\bCHF\b/i.test(value)) return "CHF";
    if (/\bRUB\b|₽/i.test(value)) return "RUB";

    return undefined;
  }

  protected parseNumber(
    value?: string | null
  ): number | null {
    if (!value) return null;

    const numbers = value
      .replace(/,/g, "")
      .match(/\d+(?:\.\d+)?/g)
      ?.map(Number)
      .filter(Number.isFinite);

    if (!numbers?.length) return null;

    return numbers[0];
  }

  protected parseEstimate(
    value?: string | null
  ): EstimateRange | null {
    const raw = this.normalizeText(value);

    if (!raw) return null;

    const currency = this.detectCurrency(raw);

    const numbers = raw
      .replace(/,/g, "")
      .match(/\d+(?:\.\d+)?/g)
      ?.map(Number)
      .filter(Number.isFinite);

    if (!numbers?.length) {
      return {
        raw,
        currency,
      };
    }

    if (numbers.length === 1) {
      return {
        raw,
        currency,
        min: numbers[0],
        max: numbers[0],
      };
    }

    return {
      raw,
      currency,
      min: Math.min(numbers[0], numbers[1]),
      max: Math.max(numbers[0], numbers[1]),
    };
  }

  protected parsePrice(
    value?: string | null
  ): NormalizedPrice | null {
    const raw = this.normalizeText(value);

    if (!raw) return null;

    const currency = this.detectCurrency(raw);

    const numbers = raw
      .replace(/,/g, "")
      .match(/\d+(?:\.\d+)?/g)
      ?.map(Number)
      .filter(Number.isFinite);

    if (!numbers?.length) {
      return {
        raw,
        currency,
      };
    }

    if (numbers.length === 1) {
      return {
        raw,
        currency,
        realized: numbers[0],
      };
    }

    return {
      raw,
      currency,
      amountMin: Math.min(numbers[0], numbers[1]),
      amountMax: Math.max(numbers[0], numbers[1]),
    };
  }
}