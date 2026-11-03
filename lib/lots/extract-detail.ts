import type * as Cheerio from "cheerio";

export interface LotDetailFields {
  title?: string | null;
  artist?: string | null;
  year?: number | null;
  medium?: string | null;
  dimensions?: string | null;
  signature?: string | null;
  description?: string | null;
  lotNumber?: string | null;
  auctionDate?: string | null;
  provenance: string[];
  exhibitions: string[];
  literature: string[];
}

const MAX_SECTION_CHARS = 8_000;
const MAX_ITEMS = 24;
const MAX_LABEL_CHARS = 64;

const LABELS = {
  provenance: [
    "provenance",
    "provenienz",
    "provenance:",
    "previous owners",
    "collection",
  ],
  exhibitions: [
    "exhibited",
    "exhibition",
    "exhibitions",
    "exhibition history",
    "exhibited:",
  ],
  literature: [
    "literature",
    "bibliography",
    "catalogue",
    "catalogues",
    "literature:",
  ],
  signature: ["signed", "signature", "signed and dated", "signed/dated"],
  medium: ["medium", "materials", "technique", "media"],
  dimensions: ["dimensions", "size", "measurements"],
  lotNumber: ["lot", "lot number", "lot no", "lot no."],
  auctionDate: ["sale date", "auction date", "date of sale"],
  details: ["details", "catalogue details", "lot details", "provenance & literature"],
  title: ["title"],
  artist: ["artist", "maker"],
};

function normalizeText(value?: string | null): string | null {
  if (!value) return null;

  const normalized = value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized || null;
}

function normalizeLabel(value?: string | null): string {
  return (value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[：:]\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function blockText($: Cheerio.CheerioAPI, element: unknown): string {
  const $element = $(element as never);
  const clone = $element.clone();

  clone.find("br").replaceWith("\n");
  clone.find("p, div, li, tr").each((_, child) => {
    const $child = $(child);
    $child.append("\n");
  });

  return decodeHtmlEntities(clone.text())
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_SECTION_CHARS);
}

function splitItems(value?: string | null): string[] {
  const text = normalizeText(value);
  if (!text) return [];

  const byLine = text
    .split(/\n+|•|\u2022|\u00b7/g)
    .map((item) => normalizeText(item))
    .filter((item): item is string => Boolean(item && item.length > 1));

  // If the source is one long paragraph without line breaks, keep it as one
  // provenance/literature item instead of inventing a split.
  return byLine.slice(0, MAX_ITEMS);
}

function readJsonLd($: Cheerio.CheerioAPI): any[] {
  const values: any[] = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).text().trim();
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed)) {
        values.push(...parsed);
      } else if (parsed?.["@graph"] && Array.isArray(parsed["@graph"])) {
        values.push(...parsed["@graph"]);
      } else if (parsed && typeof parsed === "object") {
        values.push(parsed);
      }
    } catch {
      // Malformed JSON-LD is ignored; raw HTML remains in parse logs.
    }
  });

  return values;
}

function collectJsonLdObjects(values: any[]): any[] {
  const result: any[] = [];
  const seen = new Set<unknown>();

  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object" || depth > 8) return;
    if (seen.has(value)) return;
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }

    const record = value as Record<string, unknown>;

    if (record["@type"]) {
      result.push(record);
    }

    for (const [key, child] of Object.entries(record)) {
      if (key === "@type" || key === "@context") continue;
      visit(child, depth + 1);
    }
  };

  for (const value of values) visit(value, 0);

  return result;
}

function findArtworkJsonLd(values: any[]): any | null {
  const objects = collectJsonLdObjects(values);
  const priority = ["VisualArtwork", "Product", "IndividualProduct", "CreativeWork"];

  for (const type of priority) {
    const found = objects.find((value) => {
      const valueType = value?.["@type"];
      if (Array.isArray(valueType)) return valueType.includes(type);
      return valueType === type;
    });

    if (found) return found;
  }

  return null;
}

function personName(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return normalizeText(value);
  if (Array.isArray(value)) return personName(value[0]);
  if (typeof value === "object" && typeof (value as any).name === "string") {
    return normalizeText((value as any).name);
  }
  return null;
}

function toDimension(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string" || typeof value === "number") {
    return normalizeText(String(value));
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const numeric = record.value ?? record.minValue;
    if (numeric !== undefined && numeric !== null) {
      const unit = typeof record.unitCode === "string" ? record.unitCode : "";
      return normalizeText(`${numeric}${unit ? ` ${unit}` : ""}`);
    }
  }

  return null;
}

function jsonLdDetails(values: any[]): LotDetailFields {
  const artwork = findArtworkJsonLd(values);
  const result: LotDetailFields = {
    provenance: [],
    exhibitions: [],
    literature: [],
  };

  if (!artwork) return result;

  result.title = normalizeText(artwork.name || artwork.title);
  result.artist =
    personName(artwork.artist) ||
    personName(artwork.creator) ||
    personName(artwork.author);

  // Sotheby's Product names use "Artist | Title | Sale". Split them only when
  // the structured data provides no explicit creator.
  if (!result.artist && result.title?.includes("|")) {
    const parts = result.title
      .split("|")
      .map((part) => normalizeText(part))
      .filter((part): part is string => Boolean(part));

    if (parts.length >= 2) {
      result.artist = parts[0];
      result.title = parts[1];
    }
  }

  result.description = normalizeText(artwork.description);
  result.medium = normalizeText(
    artwork.artMedium || artwork.material || artwork.medium,
  );

  const dateCreated = artwork.dateCreated || artwork.datePublished;
  if (typeof dateCreated === "string") {
    const year = dateCreated.match(/\b(18|19|20)\d{2}\b/);
    result.year = year ? Number(year[0]) : null;
    result.auctionDate = normalizeText(dateCreated);
  }

  const height = toDimension(artwork.height);
  const width = toDimension(artwork.width);
  if (height || width) {
    result.dimensions = normalizeText(
      [height, width].filter(Boolean).join(" × "),
    );
  }

  if (Array.isArray(artwork.additionalProperty)) {
    for (const property of artwork.additionalProperty) {
      const name = normalizeLabel(property?.name);
      const value = normalizeText(property?.value);
      if (!name || !value) continue;

      if (name.includes("provenance")) result.provenance.push(value);
      else if (name.includes("exhibition")) result.exhibitions.push(value);
      else if (name.includes("literature") || name.includes("bibliograph")) {
        result.literature.push(value);
      } else if (name.includes("signature") || name === "signed") {
        result.signature = value;
      } else if (name.includes("lot")) {
        result.lotNumber = value;
      }
    }
  }

  return result;
}

function isHeadingLike($: Cheerio.CheerioAPI, element: unknown): boolean {
  const $element = $(element as never);
  const tag = (($element.prop("tagName") as string) || "").toLowerCase();
  if (["h1", "h2", "h3", "h4", "h5", "h6", "dt", "th"].includes(tag)) {
    return true;
  }

  const text = normalizeLabel($element.text());
  return Boolean(
    text &&
      text.length <= MAX_LABEL_CHARS &&
      Object.values(LABELS).some((labels) =>
        labels.some((label) => text === normalizeLabel(label)),
      ),
  );
}

function findLabelNode(
  $: Cheerio.CheerioAPI,
  labels: string[],
): unknown | null {
  const normalizedLabels = labels.map(normalizeLabel);
  let found: unknown | null = null;

  $("dt, th, strong, b, h2, h3, h4, h5, span, p, div, li").each(
    (_, element) => {
      if (found) return false;

      const $element = $(element);
      const text = normalizeLabel($element.text());

      if (!text || text.length > MAX_LABEL_CHARS) return;

      const matches = normalizedLabels.some(
        (label) => text === label || text === `${label}:`,
      );

      if (matches) {
        found = element;
        return false;
      }

      return;
    },
  );

  return found;
}

function nextContent(
  $: Cheerio.CheerioAPI,
  node: unknown,
): string | null {
  const $node = $(node as never);
  const tag = (($node.prop("tagName") as string) || "").toLowerCase();

  if (tag === "dt" || tag === "th") {
    const $value = $node.next("dd, td");
    if ($value.length) return blockText($, $value.get(0));
  }

  let $next = $node.next();
  if (!$next.length && $node.parent().length) {
    $next = $node.parent().next();
  }

  if (!$next.length) {
    const parentText = blockText($, $node.parent().get(0));
    const label = normalizeText($node.text());
    if (parentText && label) {
      const withoutLabel = parentText.replace(label, "").trim();
      return withoutLabel || null;
    }
  }

  const chunks: string[] = [];
  let inspected = 0;

  $next.each((_, element) => {
    if (inspected >= 6) return false;
    if (isHeadingLike($, element)) return false;

    const text = blockText($, element);
    if (text) chunks.push(text);
    inspected += 1;
    return;
  });

  return chunks.length ? chunks.join("\n") : null;
}

function readSection(
  $: Cheerio.CheerioAPI,
  labels: string[],
): string | null {
  const node = findLabelNode($, labels);
  if (!node) return null;
  return nextContent($, node);
}

function domDetails($: Cheerio.CheerioAPI): LotDetailFields {
  const provenance = splitItems(readSection($, LABELS.provenance));
  const exhibitions = splitItems(readSection($, LABELS.exhibitions));
  const literature = splitItems(readSection($, LABELS.literature));
  const signature = normalizeText(readSection($, LABELS.signature));
  const medium = normalizeText(readSection($, LABELS.medium));
  const dimensions = normalizeText(readSection($, LABELS.dimensions));
  const lotNumber = normalizeText(readSection($, LABELS.lotNumber));
  const auctionDate = normalizeText(readSection($, LABELS.auctionDate));

  return {
    provenance,
    exhibitions,
    literature,
    signature,
    medium,
    dimensions,
    lotNumber,
    auctionDate,
  };
}

function linesFromText(value?: string | null): string[] {
  if (!value) return [];

  return value
    .replace(/\r/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .split(/\n+/g)
    .map((line) => normalizeText(line))
    .filter((line): line is string => Boolean(line));
}

function metaDescriptionLines($: Cheerio.CheerioAPI): string[] {
  const raw = $('meta[name="description"]').attr("content") || "";
  if (!raw.trim()) return [];

  const decoded = decodeHtmlEntities(raw);

  if (/<p[\s>]/i.test(decoded)) {
    const $fragment = $("<div>").html(decoded);
    const paragraphs = $fragment
      .find("p")
      .map((_, element) => normalizeText($(element).text()) || "")
      .get()
      .filter(Boolean);

    if (paragraphs.length) return paragraphs;
  }

  return linesFromText(decoded.replace(/<[^>]+>/g, "\n"));
}

const MEDIUM_TERMS =
  /(oil|acrylic|watercolou?r|gouache|tempera|ink|pencil|charcoal|pastel|bronze|marble|wood|canvas|paper|linen|board|panel|etching|lithograph|screenprint|silkscreen|photograph|mixed media|enamel|resin|steel|aluminium|aluminum|bark cloth|plaster|ceramic|glass|textile|embroidery)/i;

const FRACTION_CHARS = "⅛⅜⅝⅞";

function parseDescriptionText(value?: string | null): {
  signature: string | null;
  medium: string | null;
  dimensions: string | null;
  year: number | null;
} {
  const text = normalizeText(value);
  if (!text) {
    return { signature: null, medium: null, dimensions: null, year: null };
  }

  const yearMatch = text.match(
    /\b(?:painted|executed|created|made|dated)\s+(?:in\s+|circa\s+)?((?:18|19|20)\d{2})\b/i,
  );

  const dimensionsMatch = text.match(
    new RegExp(
      `\\d+(?:[.,]\\d+)?(?:\\s*[${FRACTION_CHARS}])?\\s*(?:by|x|×)\\s*\\d+(?:[.,]\\d+)?(?:\\s*[${FRACTION_CHARS}])?\\s*(?:in|cm|mm)\\.?`,
      "i",
    ),
  );

  const mediumMatch = text.match(
    /\b(oil|acrylic|watercolou?r|gouache|tempera|ink|pencil|charcoal|pastel|bronze|marble|canvas|paper|linen|board|panel|etching|lithograph|screenprint|silkscreen|photograph|mixed media|enamel|resin|steel|aluminium|aluminum|bark cloth|plaster|ceramic|glass|textile|embroidery)\b[^0-9]{0,100}/i,
  );

  const signatureMatch = text.match(
    /\b(signed|stamped|bearing|inscribed|titled|numbered|monogrammed)\b[^0-9]{0,140}?(?=(?:oil|acrylic|watercolou?r|gouache|tempera|ink|pencil|charcoal|pastel|bronze|marble|canvas|paper|linen|board|panel|etching|lithograph|screenprint|silkscreen|photograph|mixed media|enamel|resin|steel|aluminium|aluminum|bark cloth|plaster|ceramic|glass|textile|embroidery)|\d)/i,
  );

  return {
    signature: normalizeText(signatureMatch?.[0]),
    medium: normalizeText(mediumMatch?.[0]),
    dimensions: normalizeText(dimensionsMatch?.[0]),
    year: yearMatch ? Number(yearMatch[1]) : null,
  };
}

function parseCatalogueLines(lines: string[]): {
  signature: string | null;
  medium: string | null;
  dimensions: string | null;
  year: number | null;
} {
  let signature: string | null = null;
  let medium: string | null = null;
  let dimensions: string | null = null;
  let year: number | null = null;

  for (const line of lines) {
    if (
      !signature &&
      /^(signed|signed,|stamped|bearing|inscribed|titled|numbered|monogrammed)\b/i.test(
        line,
      )
    ) {
      signature = line;
    }

    if (
      !dimensions &&
      /\d+(?:[.,]\d+)?\s*(?:x|×|by)\s*\d+(?:[.,]\d+)?/i.test(line) &&
      /\b(?:cm|in|mm|inches|centimetres|centimeters)\b/i.test(line)
    ) {
      dimensions = line;
    }

    if (!year) {
      const match = line.match(
        /\b(?:painted|executed|created|made|dated)\s+(?:in\s+|circa\s+)?((?:18|19|20)\d{2})\b/i,
      );
      if (match) year = Number(match[1]);
    }

    if (
      !medium &&
      !signature?.includes(line) &&
      MEDIUM_TERMS.test(line) &&
      !/\b(?:estimate|provenance|literature|exhibited|sale|lot)\b/i.test(line)
    ) {
      medium = line;
    }
  }

  return { signature, medium, dimensions, year };
}

/**
 * Extracts catalogue fields that are commonly exposed as labels or JSON-LD.
 * This is deliberately conservative: missing fields remain null/empty instead
 * of being inferred from unrelated page text.
 */
export function extractLotDetails(
  $: Cheerio.CheerioAPI,
  jsonLdValues?: any[],
): LotDetailFields {
  const json = jsonLdDetails(jsonLdValues || readJsonLd($));
  const dom = domDetails($);

  const catalogue = parseCatalogueLines([
    ...linesFromText(readSection($, LABELS.details)),
    ...metaDescriptionLines($),
  ]);
  const descriptionCatalogue = parseDescriptionText(json.description);

  return {
    title: json.title || null,
    artist: json.artist || null,
    year:
      json.year ||
      descriptionCatalogue.year ||
      catalogue.year ||
      null,
    description: json.description || null,
    medium:
      json.medium ||
      dom.medium ||
      descriptionCatalogue.medium ||
      catalogue.medium ||
      null,
    dimensions:
      json.dimensions ||
      dom.dimensions ||
      descriptionCatalogue.dimensions ||
      catalogue.dimensions ||
      null,
    signature:
      json.signature ||
      dom.signature ||
      descriptionCatalogue.signature ||
      catalogue.signature ||
      null,
    lotNumber: json.lotNumber || dom.lotNumber || null,
    auctionDate: json.auctionDate || dom.auctionDate || null,
    provenance: json.provenance.length ? json.provenance : dom.provenance,
    exhibitions: json.exhibitions.length ? json.exhibitions : dom.exhibitions,
    literature: json.literature.length ? json.literature : dom.literature,
  };
}
