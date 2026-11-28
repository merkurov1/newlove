/**
 * Bilingual insight parser for Pierrot Context Architecture.
 * Parses raw AI outputs into structured Russian and English perspectives.
 */

export type BilingualInsight = {
  ru: string | null;
  en: string | null;
  singleText: string | null;
  isBilingual: boolean;
};

function cleanPart(text: string): string {
  return text
    .replace(/^\s*[-—–]+\s*/, '')
    .replace(/\s*[-—–]+\s*$/, '')
    .trim();
}

export function parseBilingualContent(raw: string | null | undefined): BilingualInsight {
  if (!raw || !raw.trim()) {
    return { ru: null, en: null, singleText: null, isBilingual: false };
  }

  const clean = raw.trim();

  // 1. Tag-based matching: [RU] / [EN] / RU: / EN: / ### RU / ### EN / **RU** / **EN**
  const ruMatch = clean.match(
    /(?:\[RU\]|\*\*RU\*\*|###\s*RU|RU:)([\s\S]*?)(?=(?:\[EN\]|\*\*EN\*\*|###\s*EN|EN:)|$)/i
  );
  const enMatch = clean.match(
    /(?:\[EN\]|\*\*EN\*\*|###\s*EN|EN:)([\s\S]*?)(?=(?:\[RU\]|\*\*RU\*\*|###\s*RU|RU:)|$)/i
  );

  // Keep partial-language tagged output intact. Older/fallback generations may
  // contain only one tagged section; that section is still the whole comment
  // and must not be dropped or shown with its technical marker.
  if (ruMatch || enMatch) {
    const cleanRu = ruMatch ? cleanPart(ruMatch[1]) : null;
    const cleanEn = enMatch ? cleanPart(enMatch[1]) : null;

    if (cleanRu && cleanEn) {
      return { ru: cleanRu, en: cleanEn, singleText: null, isBilingual: true };
    }

    if (cleanRu || cleanEn) {
      return {
        ru: cleanRu || null,
        en: cleanEn || null,
        singleText: cleanRu || cleanEn || null,
        isBilingual: false,
      };
    }
  }

  // 2. Divider-based matching: text separated by ---
  if (clean.includes('---')) {
    const parts = clean
      .split(/\n\s*---\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 2) {
      const isPart0Cyrillic = /[а-яё]/i.test(parts[0]);
      const isPart1Cyrillic = /[а-яё]/i.test(parts[1]);

      if (isPart0Cyrillic && !isPart1Cyrillic) {
        return {
          ru: cleanPart(parts[0]),
          en: cleanPart(parts[1]),
          singleText: null,
          isBilingual: true,
        };
      } else if (!isPart0Cyrillic && isPart1Cyrillic) {
        return {
          ru: cleanPart(parts[1]),
          en: cleanPart(parts[0]),
          singleText: null,
          isBilingual: true,
        };
      }
    }
  }

  // 3. Two paragraphs where one is Cyrillic and one is Latin
  const paragraphs = clean
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 2) {
    const p0Cyr = /[а-яё]/i.test(paragraphs[0]);
    const p1Cyr = /[а-яё]/i.test(paragraphs[1]);
    const p0Lat = /[a-z]/i.test(paragraphs[0]);
    const p1Lat = /[a-z]/i.test(paragraphs[1]);

    if (p0Cyr && !p1Cyr && p1Lat) {
      return {
        ru: cleanPart(paragraphs[0]),
        en: cleanPart(paragraphs[1]),
        singleText: null,
        isBilingual: true,
      };
    }
    if (!p0Cyr && p0Lat && p1Cyr) {
      return {
        ru: cleanPart(paragraphs[1]),
        en: cleanPart(paragraphs[0]),
        singleText: null,
        isBilingual: true,
      };
    }
  }

  // Fallback: single language
  const isCyrillic = /[а-яё]/i.test(clean);
  if (isCyrillic) {
    return { ru: clean, en: null, singleText: clean, isBilingual: false };
  } else {
    return { ru: null, en: clean, singleText: clean, isBilingual: false };
  }
}
