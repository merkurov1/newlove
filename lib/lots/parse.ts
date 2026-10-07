import type {
  EstimateRange,
  ImageCandidate,
  LotData,
  NormalizedPrice,
} from "./types";

export type { LotData, ImageCandidate, NormalizedPrice };

function getMetaContent(
  html: string,
  propertyOrName: string
): string | undefined {
  const escaped = propertyOrName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const metaRegex = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );

  const match = html.match(metaRegex);
  if (match?.[1]) {
    return match[1].trim();
  }

  const reverseMetaRegex = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
    "i"
  );

  const reverseMatch = html.match(reverseMetaRegex);

  return reverseMatch?.[1]?.trim();
}

function parsePriceString(
  priceStr?: string | null
): NormalizedPrice | undefined {
  if (!priceStr) {
    return undefined;
  }

  const result: NormalizedPrice = {
    raw: priceStr.trim(),
  };

  if (/\$|USD/i.test(priceStr)) {
    result.currency = "USD";
  } else if (/€|EUR/i.test(priceStr)) {
    result.currency = "EUR";
  } else if (/£|GBP/i.test(priceStr)) {
    result.currency = "GBP";
  } else if (/CHF/i.test(priceStr)) {
    result.currency = "CHF";
  } else if (/₽|RUB/i.test(priceStr)) {
    result.currency = "RUB";
  }

  const numbers = priceStr
    .replace(/,/g, "")
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number)
    .filter(Number.isFinite);

  if (!numbers?.length) {
    return result;
  }

  if (numbers.length === 1) {
    result.realized = numbers[0];
  } else {
    result.amountMin = Math.min(numbers[0], numbers[1]);
    result.amountMax = Math.max(numbers[0], numbers[1]);
  }

  return result;
}

function parseEstimateString(
  estimateStr?: string | null
): EstimateRange | undefined {
  if (!estimateStr) {
    return undefined;
  }

  const result: EstimateRange = {
    raw: estimateStr.trim(),
  };

  if (/\$|USD/i.test(estimateStr)) {
    result.currency = "USD";
  } else if (/€|EUR/i.test(estimateStr)) {
    result.currency = "EUR";
  } else if (/£|GBP/i.test(estimateStr)) {
    result.currency = "GBP";
  } else if (/CHF/i.test(estimateStr)) {
    result.currency = "CHF";
  } else if (/₽|RUB/i.test(estimateStr)) {
    result.currency = "RUB";
  }

  const numbers = estimateStr
    .replace(/,/g, "")
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number)
    .filter(Number.isFinite);

  if (!numbers?.length) {
    return result;
  }

  result.min = numbers[0];
  result.max = numbers.length > 1 ? numbers[1] : numbers[0];

  if (
    result.min !== null &&
    result.max !== null &&
    result.min > result.max
  ) {
    [result.min, result.max] = [result.max, result.min];
  }

  return result;
}

function extractJsonLd(html: string): any[] {
  const jsonLdBlocks: any[] = [];

  const regex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);

      if (Array.isArray(parsed)) {
        jsonLdBlocks.push(...parsed);
      } else if (parsed && typeof parsed === "object") {
        if (
          parsed["@graph"] &&
          Array.isArray(parsed["@graph"])
        ) {
          jsonLdBlocks.push(...parsed["@graph"]);
        } else {
          jsonLdBlocks.push(parsed);
        }
      }
    } catch {
      // Ignore invalid JSON-LD blocks.
    }
  }

  return jsonLdBlocks;
}

function getImageUrl(image: unknown): string | undefined {
  if (!image) {
    return undefined;
  }

  if (typeof image === "string") {
    return image;
  }

  if (Array.isArray(image)) {
    return getImageUrl(image[0]);
  }

  if (typeof image === "object") {
    const value = image as Record<string, unknown>;

    if (typeof value.contentUrl === "string") {
      return value.contentUrl;
    }

    if (typeof value.url === "string") {
      return value.url;
    }
  }

  return undefined;
}

function getPersonName(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    return value.trim() || undefined;
  }

  if (Array.isArray(value)) {
    return getPersonName(value[0]);
  }

  if (typeof value === "object") {
    const object = value as Record<string, unknown>;

    if (typeof object.name === "string") {
      return object.name.trim() || undefined;
    }
  }

  return undefined;
}

export function parseLotHtml(
  html: string,
  url: string,
  house?: string,
  options?: { debug?: boolean }
): LotData {
  const candidates: ImageCandidate[] = [];

  const result: LotData = {
    house: house || "",
    imageCandidates: candidates,
    url,
  };

  const jsonLdItems = extractJsonLd(html);

  const artwork = jsonLdItems.find((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }

    const type = item["@type"];

    return (
      type === "VisualArtwork" ||
      type === "Product" ||
      type === "IndividualProduct" ||
      type === "ItemPage"
    );
  });

  if (artwork) {
    result.title = artwork.name || artwork.title;
    result.description = artwork.description;

    result.artist =
      getPersonName(artwork.artist) ||
      getPersonName(artwork.creator);

    if (artwork.image) {
      const finalImg = getImageUrl(artwork.image);

      if (finalImg) {
        result.imageUrl = finalImg;

        candidates.push({
          url: finalImg,
          source: "json-ld",
        });
      }
    }

    if (artwork.offers) {
      const offer = Array.isArray(artwork.offers)
        ? artwork.offers[0]
        : artwork.offers;

      if (offer && typeof offer === "object") {
        const offerObject = offer as Record<string, unknown>;

        const priceVal =
          offerObject.price ??
          offerObject.lowPrice;

        const currency =
          typeof offerObject.priceCurrency === "string"
            ? offerObject.priceCurrency
            : "";

        if (priceVal !== undefined && priceVal !== null) {
          const priceString =
            `${currency} ${String(priceVal)}`.trim();

          result.price = parsePriceString(priceString);
        }

        if (
          offerObject.lowPrice !== undefined ||
          offerObject.highPrice !== undefined
        ) {
          const lowPrice =
            offerObject.lowPrice !== undefined
              ? Number(offerObject.lowPrice)
              : undefined;

          const highPrice =
            offerObject.highPrice !== undefined
              ? Number(offerObject.highPrice)
              : lowPrice;

          result.estimate = {
            raw: `${currency} ${
              lowPrice ?? ""
            }${
              highPrice !== undefined &&
              highPrice !== lowPrice
                ? ` - ${highPrice}`
                : ""
            }`.trim(),
            currency: currency || undefined,
            min: Number.isFinite(lowPrice)
              ? lowPrice
              : undefined,
            max: Number.isFinite(highPrice)
              ? highPrice
              : undefined,
          };
        }
      }
    }
  }

  if (!result.title) {
    result.title =
      getMetaContent(html, "og:title") ||
      getMetaContent(html, "twitter:title");
  }

  if (!result.description) {
    result.description =
      getMetaContent(html, "og:description") ||
      getMetaContent(html, "description");
  }

  const ogImage =
    getMetaContent(html, "og:image") ||
    getMetaContent(html, "twitter:image");

  if (
    ogImage &&
    !candidates.some((candidate) => candidate.url === ogImage)
  ) {
    candidates.push({
      url: ogImage,
      source: "og:image",
    });

    if (!result.imageUrl) {
      result.imageUrl = ogImage;
    }
  }

  if (!result.title) {
    const titleMatch = html.match(
      /<title[^>]*>([\s\S]*?)<\/title>/i
    );

    if (titleMatch?.[1]) {
      result.title = titleMatch[1]
        .replace(/\s+/g, " ")
        .trim();
    }
  }

  /*
   * Some auction pages expose only a textual estimate
   * outside JSON-LD. Preserve it as a normalized EstimateRange.
   */
  if (!result.estimate) {
    const estimateMatch = html.match(
      /(?:estimate|estimated value)[\s:>-]+([^<]{1,120})/i
    );

    if (estimateMatch?.[1]) {
      result.estimate = parseEstimateString(
        estimateMatch[1]
      );
    }
  }

  /*
   * Do not create `normalizedPrice`.
   *
   * LotData.price is already NormalizedPrice.
   * LotData.estimate is already EstimateRange.
   */

  if (options?.debug) {
    result.raw = {
      ...(result.raw || {}),
      parser: "json-ld",
      jsonLdItems: jsonLdItems.length,
    };
  }

  result.imageCandidates = candidates;

  return result;
}