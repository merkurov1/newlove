/**
 * Lightweight recipe extraction for Pierrot replies.
 *
 * The model already returns Markdown. This parser does not call the model and
 * does not infer missing ingredients or steps. It only promotes a reply to a
 * recipe card when the reply contains both an ingredient section with at least
 * two real items and a method section with at least two real steps.
 */

export type RecipeIngredient = {
  raw: string;
  amount: string | null;
  name: string;
};

export type ParsedRecipe = {
  title: string | null;
  description: string | null;
  servings: string | null;
  time: string | null;
  ingredients: RecipeIngredient[];
  steps: string[];
  notes: string[];
};

export type ParsedRecipeResponse = {
  recipe: ParsedRecipe;
  before: string;
  after: string;
};

type SectionKind = 'ingredients' | 'steps' | 'notes' | 'other';

type Heading = {
  index: number;
  level: number;
  text: string;
  kind: SectionKind;
};

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLabel(value: string): string {
  return stripInlineMarkdown(value)
    .replace(/^[#>\s]+/, '')
    .replace(/[:\-–—]+\s*$/, '')
    .replace(/[.,;]+$/, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function sectionKind(text: string): SectionKind {
  const value = normalizeLabel(text);

  if (!value) return 'other';
  if (/^(?:время|time|servings?|порци|yield|выход)\b/.test(value)) return 'other';

  if (/(?:ингредиент|ingredients?|состав|you will need|what you need)/.test(value)) {
    return 'ingredients';
  }

  if (
    /(?:приготовлен|инструкц|метод|шаг|steps?|instructions?|method|directions?|preparation|how to (?:make|cook)|assembl|сборка)/.test(
      value
    )
  ) {
    return 'steps';
  }

  if (/(?:примечани|заметк|замен|совет|notes?|substitutions?|tips?|variations?)/.test(value)) {
    return 'notes';
  }

  return 'other';
}

function headingInfo(line: string): { text: string; level: number; kind: SectionKind } | null {
  const trimmed = line.trim();

  if (!trimmed) return null;
  // A list item may end with a colon ("- For the sauce:"), but it is content,
  // not a section heading.
  if (/^(?:[-*+•]|\d+[.)])\s+/.test(trimmed)) return null;

  const markdown = trimmed.match(/^(#{1,6})\s+(.+?)\s*#*$/);

  if (markdown) {
    const text = stripInlineMarkdown(markdown[2]);
    if (!text) return null;
    return { text, level: markdown[1].length, kind: sectionKind(text) };
  }

  const bold = trimmed.match(/^(?:\*\*|__)(.+?)(?:\*\*|__)\s*:?\s*$/);

  if (bold) {
    const text = stripInlineMarkdown(bold[1]);
    if (!text) return null;
    return { text, level: 2, kind: sectionKind(text) };
  }

  const plain = trimmed.match(/^([^:\n]{2,48}):\s*$/);

  if (plain) {
    const text = stripInlineMarkdown(plain[1]);
    if (!text) return null;
    return { text, level: 3, kind: sectionKind(text) };
  }

  return null;
}

function isSectionHeading(line: string): boolean {
  const info = headingInfo(line);
  return Boolean(info && info.kind !== 'other');
}

function collectHeadings(lines: string[]): Heading[] {
  const headings: Heading[] = [];

  lines.forEach((line, index) => {
    const info = headingInfo(line);
    if (!info) return;

    headings.push({ index, ...info });
  });

  return headings;
}

function isTerminatorLine(line: string): boolean {
  const value = normalizeLabel(line);

  return /^(?:источники|источник|sources?|ссылки|links?|литература|references?)\s*(?::|$)/.test(
    value
  );
}

function findTerminatorIndex(lines: string[], start: number): number | null {
  for (let index = start; index < lines.length; index += 1) {
    if (isTerminatorLine(lines[index])) return index;
  }

  return null;
}

function cleanItem(value: string): string {
  return stripInlineMarkdown(value)
    .replace(/^[-–—•]\s*/, '')
    .replace(/[;；]\s*$/, '')
    .trim();
}

function hasListMarker(lines: string[]): boolean {
  return lines.some((line) => /^(?:[-*+•]|\d+[.)])\s+/.test(line.trim()));
}

function parseListItems(lines: string[]): string[] {
  const items: string[] = [];
  let current = -1;

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) continue;
    if (isTerminatorLine(line)) break;
    if (isSectionHeading(line)) continue;

    const marker = line.match(/^(?:[-*+•]|\d+[.)])\s+(.*)$/);

    if (marker) {
      const value = cleanItem(marker[1]);
      if (value) {
        items.push(value);
        current = items.length - 1;
      }
      continue;
    }

    if (current >= 0) {
      const value = cleanItem(line);
      if (value) items[current] = `${items[current]} ${value}`.trim();
      continue;
    }

    const value = cleanItem(line);
    if (value) {
      items.push(value);
      current = items.length - 1;
    }
  }

  return items;
}

function parsePlainLines(lines: string[]): string[] {
  const items: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) continue;
    if (isTerminatorLine(line)) break;
    if (isSectionHeading(line)) continue;

    const value = cleanItem(line);
    if (value) items.push(value);
  }

  return items;
}

function parseParagraphs(lines: string[]): string[] {
  const paragraphs: string[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (!buffer.length) return;
    const value = buffer.join(' ').replace(/\s+/g, ' ').trim();
    if (value) paragraphs.push(value);
    buffer = [];
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) {
      flush();
      continue;
    }

    if (isTerminatorLine(line)) {
      flush();
      break;
    }

    if (isSectionHeading(line)) {
      flush();
      continue;
    }

    buffer.push(cleanItem(line));
  }

  flush();
  return paragraphs;
}

function isIntroLine(value: string): boolean {
  return /^(?:follow these|instructions?|method|steps?|how to|приготовление|инструкция|способ)\b[:\s]*$/i.test(
    value.trim()
  );
}

const AMOUNT_PATTERN =
  /^([\d.,/\u00BC-\u00BE\u2150-\u215E]+(?:\s*[–—-]\s*[\d.,/]+)?\s*(?:г|гр|кг|мг|мл|л|шт|штук|ч\.?\s*л\.?|ст\.?\s*л\.?|стакан[а-я]*|щепот[а-я]*|g|kg|mg|ml|l|oz|lb|lbs?|cups?|tbsp|tsp|pcs?|pieces?|cloves?|pinch(?:es)?)?)\s+(.+)$/i;

function parseIngredient(raw: string): RecipeIngredient {
  const value = cleanItem(raw);
  const match = value.match(AMOUNT_PATTERN);

  if (!match) return { raw: value, amount: null, name: value };

  const amount = match[1].trim();
  const name = match[2].trim();

  if (!amount || !name) return { raw: value, amount: null, name: value };

  return { raw: value, amount, name };
}

function isGenericTitle(value: string): boolean {
  const normalized = normalizeLabel(value);

  return new Set([
    'рецепт',
    'рецепты',
    'recipe',
    'recipes',
    'ответ',
    'answer',
    'food',
    'еда',
    'кухня',
    'menu',
    'меню',
  ]).has(normalized);
}

function cleanTitle(value: string): string {
  return stripInlineMarkdown(value)
    .replace(/^(?:рецепт|recipe)\s*[:\-–—]\s*/i, '')
    .replace(/^[#>\s]+/, '')
    .replace(/[:\-–—\s]+$/, '')
    .trim();
}

function findTitle(
  lines: string[],
  headings: Heading[],
  ingredientsIndex: number
): { title: string | null; startIndex: number; titleIndex: number | null } {
  const before = headings.filter((heading) => heading.index < ingredientsIndex);
  const previous = before[before.length - 1];

  if (previous) {
    const cleaned = cleanTitle(previous.text);

    if (
      cleaned &&
      !isGenericTitle(cleaned) &&
      previous.kind !== 'ingredients' &&
      previous.kind !== 'steps' &&
      previous.kind !== 'notes'
    ) {
      return {
        title: cleaned,
        startIndex: previous.index,
        titleIndex: previous.index,
      };
    }

    if (isGenericTitle(cleaned)) {
      // "## Рецепт" followed by a plain title line and then ingredients.
      for (let index = ingredientsIndex - 1; index > previous.index; index -= 1) {
        const candidate = lines[index]?.trim();
        if (!candidate) continue;
        if (headingInfo(candidate)) break;
        if (/^(?:[-*+•]|\d+[.)])\s+/.test(candidate)) break;

        const title = cleanTitle(candidate);
        if (title && title.length <= 80 && !/[.!?]$/.test(candidate) && !isGenericTitle(title)) {
          return { title, startIndex: index, titleIndex: index };
        }
        break;
      }
    }
  }

  // A plain "Recipe: name" line immediately before the ingredients.
  for (let index = ingredientsIndex - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    if (!line) continue;

    const explicit = line.match(/^(?:\*\*|__)?(?:рецепт|recipe)\s*[:\-–—]\s*(.+?)(?:\*\*|__)?$/i);

    if (explicit) {
      const title = cleanTitle(explicit[1]);
      if (title) return { title, startIndex: index, titleIndex: index };
    }

    break;
  }

  return { title: null, startIndex: ingredientsIndex, titleIndex: null };
}

function descriptionFor(
  lines: string[],
  titleIndex: number | null,
  ingredientsIndex: number
): string | null {
  if (titleIndex === null) return null;

  const parts = lines
    .slice(titleIndex + 1, ingredientsIndex)
    .map((line) => line.trim())
    .filter((line) => line && !headingInfo(line) && !isTerminatorLine(line))
    .map((line) => stripInlineMarkdown(line))
    .filter(Boolean);

  if (!parts.length) return null;

  const text = parts.join(' ').replace(/\s+/g, ' ').trim();

  return text.length >= 8 ? text.slice(0, 400) : null;
}

function findServings(lines: string[], start: number, end: number): string | null {
  const text = lines
    .slice(start, end)
    .map((line) => stripInlineMarkdown(line))
    .join('\n');
  const patterns = [
    /(?:на|for)\s+(\d+(?:\s*[–—-]\s*\d+)?)\s*(?:порци[йия]|servings?|people|persons?)/i,
    /(?:порций|порции|servings?|serves)\s*[:\-–—]?\s*(\d+(?:\s*[–—-]\s*\d+)?)/i,
    /(?:рассчитан[оа]?\s+на)\s*[:\-–—]?\s*(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].replace(/\s+/g, ' ').trim();
  }

  return null;
}

function findTime(lines: string[], start: number, end: number): string | null {
  const text = lines
    .slice(start, end)
    .map((line) => stripInlineMarkdown(line))
    .join('\n');
  const match = text.match(
    /(?:^|\n)\s*(?:время(?:\s+приготовления)?|prep(?:aration)?\s*time|cook(?:ing)?\s*time|total(?:\s*time)?|всего)\s*[:\-–—]?\s*(?:\n\s*)?([^\n]{1,50})/i
  );

  if (!match) return null;

  const value = stripInlineMarkdown(match[1])
    .replace(/[.;,]+$/, '')
    .trim();

  if (!value || !/\d/.test(value)) return null;

  return value;
}

function parseIngredientSection(lines: string[]): RecipeIngredient[] {
  const items = hasListMarker(lines) ? parseListItems(lines) : parsePlainLines(lines);

  return items
    .map((item) => item.trim())
    .filter(
      (item) =>
        item.length >= 2 &&
        item.length <= 240 &&
        !/[:：]$/.test(item) &&
        !/^(?:ингредиенты|ingredients|состав)\s*:?$/i.test(item)
    )
    .slice(0, 40)
    .map(parseIngredient);
}

function parseStepSection(lines: string[]): string[] {
  let items = hasListMarker(lines) ? parseListItems(lines) : parseParagraphs(lines);

  // Some replies put each step on its own line without a list marker. Only
  // accept that form when every accepted line is a complete sentence, so a
  // soft-wrapped paragraph is not split into fake steps.
  if (items.length < 2 && !hasListMarker(lines)) {
    const sentenceLines = parsePlainLines(lines).filter((line) => /[.!?;:]$/.test(line));

    if (sentenceLines.length >= 2) items = sentenceLines;
  }

  return items
    .map((item) => item.trim())
    .filter((item) => item.length >= 3 && !isIntroLine(item))
    .slice(0, 30);
}

function parseNotesSection(lines: string[]): string[] {
  const items = hasListMarker(lines) ? parseListItems(lines) : parseParagraphs(lines);

  return items
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 12);
}

/**
 * Returns a recipe only when the response contains a complete, bordered
 * structure. A mere mention of the word "recipe" never produces a card.
 */
export function parseRecipeResponse(content: string): ParsedRecipeResponse | null {
  if (typeof content !== 'string' || content.trim().length < 60) return null;

  const lines = content.replace(/\r\n?/g, '\n').split('\n');

  // Tables are legitimate Markdown, but the card layout would flatten their
  // columns into misleading ingredients or steps. Keep the normal rendering.
  if (lines.some((line) => /^\s*\|.*\|\s*$/.test(line))) return null;

  const headings = collectHeadings(lines);

  const ingredientsHeading = headings.find((heading) => heading.kind === 'ingredients');

  if (!ingredientsHeading) return null;

  const stepsHeading = headings.find(
    (heading) => heading.index > ingredientsHeading.index && heading.kind === 'steps'
  );

  if (!stepsHeading) return null;

  const afterSteps = headings.find((heading) => heading.index > stepsHeading.index);
  const notesHeading = afterSteps?.kind === 'notes' ? afterSteps : null;
  const stepsEnd = afterSteps ? afterSteps.index : lines.length;
  const notesEnd = notesHeading
    ? (headings.find((heading) => heading.index > notesHeading.index)?.index ?? lines.length)
    : null;

  const stepsStart = stepsHeading.index + 1;
  const stepsSliceEnd = notesHeading ? notesHeading.index : stepsEnd;
  const stepsTerminator = findTerminatorIndex(lines, stepsStart);
  const effectiveStepsEnd =
    stepsTerminator !== null && stepsTerminator < stepsSliceEnd ? stepsTerminator : stepsSliceEnd;

  const notesStart = notesHeading ? notesHeading.index + 1 : 0;
  const notesSliceEnd = notesEnd ?? lines.length;
  const notesTerminator = notesHeading ? findTerminatorIndex(lines, notesStart) : null;
  const effectiveNotesEnd =
    notesTerminator !== null && notesTerminator < notesSliceEnd ? notesTerminator : notesSliceEnd;

  const title = findTitle(lines, headings, ingredientsHeading.index);
  const ingredients = parseIngredientSection(
    lines.slice(ingredientsHeading.index + 1, stepsHeading.index)
  );
  const steps = parseStepSection(lines.slice(stepsStart, effectiveStepsEnd));

  // A card is only justified by a real structure. One ingredient and one
  // sentence are not a recipe.
  if (ingredients.length < 2 || steps.length < 2) return null;

  const notes = notesHeading ? parseNotesSection(lines.slice(notesStart, effectiveNotesEnd)) : [];
  const recipeEnd = notesHeading ? effectiveNotesEnd : effectiveStepsEnd;

  return {
    recipe: {
      title: title.title,
      description: descriptionFor(lines, title.titleIndex, ingredientsHeading.index),
      servings: findServings(lines, title.startIndex, recipeEnd),
      time: findTime(lines, title.startIndex, recipeEnd),
      ingredients,
      steps,
      notes,
    },
    before: lines.slice(0, title.startIndex).join('\n').trim(),
    after: lines.slice(recipeEnd).join('\n').trim(),
  };
}

export function formatRecipeForClipboard(recipe: ParsedRecipe): string {
  const lines: string[] = [];

  if (recipe.title) {
    lines.push(recipe.title, '');
  }

  if (recipe.description) {
    lines.push(recipe.description, '');
  }

  if (recipe.servings || recipe.time) {
    lines.push(
      [
        recipe.servings ? `Servings: ${recipe.servings}` : '',
        recipe.time ? `Time: ${recipe.time}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      ''
    );
  }

  if (recipe.ingredients.length) {
    lines.push('Ingredients');
    for (const ingredient of recipe.ingredients) {
      lines.push(`- ${ingredient.raw}`);
    }
    lines.push('');
  }

  if (recipe.steps.length) {
    lines.push('Method');
    recipe.steps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
    lines.push('');
  }

  if (recipe.notes.length) {
    lines.push('Notes');
    for (const note of recipe.notes) {
      lines.push(`- ${note}`);
    }
  }

  return lines.join('\n').trim();
}
