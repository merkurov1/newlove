/**
 * Some auction houses render the lot header as a JavaScript object rather than
 * semantic HTML. Christie's, for example, embeds:
 *
 *   window.chrComponents.lotHeader_... = { ..., "lots": [ { ... } ] }
 *
 * This helper extracts one balanced JSON array/object without evaluating any
 * JavaScript.
 */

export function extractBalancedJson(
  text: string,
  startIndex: number,
): string | null {
  if (startIndex < 0 || startIndex >= text.length) return null;

  const opener = text[startIndex];
  if (opener !== "[" && opener !== "{") return null;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "[" || char === "{") {
      stack.push(char);
      continue;
    }

    if (char === "]" || char === "}") {
      const expected = char === "]" ? "[" : "{";
      if (stack.pop() !== expected) return null;

      if (stack.length === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

export interface EmbeddedLotHeader {
  title: string | null;
  artist: string | null;
  lotNumber: string | null;
  estimateRaw: string | null;
  priceRaw: string | null;
  imageUrl: string | null;
  dimensions: string | null;
  auctionHouse: string | null;
}

export function extractChristiesEmbeddedLot(
  html: string,
): EmbeddedLotHeader | null {
  const marker = '"lots":[';
  const markerIndex = html.indexOf(marker);

  if (markerIndex < 0) return null;

  const arrayStart = html.indexOf("[", markerIndex);
  const raw = extractBalancedJson(html, arrayStart);

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed) || !parsed.length) return null;

    const lot = parsed[0] || {};
    const firstAsset = Array.isArray(lot.lot_assets)
      ? lot.lot_assets.find((asset: any) => asset?.image_url)
      : null;

    return {
      title: clean(lot.title_secondary_txt),
      artist: clean(lot.title_primary_txt),
      lotNumber: clean(lot.lot_id_txt),
      estimateRaw: clean(lot.estimate_txt),
      priceRaw: clean(lot.price_realised_txt),
      imageUrl: clean(firstAsset?.image_url),
      dimensions: clean(firstAsset?.measurements_txt),
      auctionHouse: "Christie's",
    };
  } catch {
    return null;
  }
}

export interface EmbeddedSothebysLot {
  title: string | null;
  artist: string | null;
  lotNumber: string | null;
  estimateLow: number | null;
  estimateHigh: number | null;
  estimateRaw: string | null;
  currency: string | null;
  imageUrl: string | null;
}

export function extractSothebysEmbeddedLot(
  html: string,
): EmbeddedSothebysLot | null {
  const match = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );

  if (!match?.[1]) return null;

  try {
    const data = JSON.parse(match[1]);
    const pageProps = data?.props?.pageProps || {};
    const lotId = pageProps.lotId;
    const cache = pageProps.apolloCache || {};

    if (!lotId) return null;

    const candidates: any[] = [];

    const visit = (value: unknown) => {
      if (!value || typeof value !== "object") return;

      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }

      const record = value as Record<string, any>;

      if (
        record.lotId === lotId &&
        (record.__typename === "LotV2" ||
          record.estimateV2 ||
          record.lotNumber)
      ) {
        candidates.push(record);
      }

      for (const child of Object.values(record)) visit(child);
    };

    visit(cache);

    const lot =
      candidates.find((candidate) => candidate.__typename === "LotV2") ||
      candidates.find((candidate) => candidate.estimateV2) ||
      candidates[0];

    if (!lot) return null;

    const auctionRef = lot.auction?.__ref;
    const auction =
      auctionRef && cache[auctionRef] ? cache[auctionRef] : {};

    const low = Number(lot.estimateV2?.lowEstimate?.amount);
    const high = Number(lot.estimateV2?.highEstimate?.amount);
    const media = lot['media({"imageSizes":["ExtraSmall","Small","Medium","Large","ExtraLarge","ExtraExtraLarge"]})'];
    const firstImage = Array.isArray(media?.images)
      ? media.images[0]
      : null;
    const rendition =
      Array.isArray(firstImage?.renditions) && firstImage.renditions.length
        ? firstImage.renditions[0]
        : null;

    return {
      title: clean(lot.title),
      artist: clean(lot.creatorsDisplayTitle),
      lotNumber: clean(lot.lotNumber?.lotDisplayNumber),
      estimateLow: Number.isFinite(low) ? low : null,
      estimateHigh: Number.isFinite(high) ? high : null,
      estimateRaw:
        Number.isFinite(low) && Number.isFinite(high)
          ? `${low.toLocaleString("en-US")} – ${high.toLocaleString("en-US")}`
          : null,
      currency: clean(auction.currency || auction.currencyV2),
      imageUrl: clean(rendition?.url),
    };
  } catch {
    return null;
  }
}

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const normalized = value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized || null;
}
