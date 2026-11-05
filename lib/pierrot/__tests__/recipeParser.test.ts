import { formatRecipeForClipboard, parseRecipeResponse } from '../recipeParser';

const RUSSIAN_RECIPE = `## Паста карбонара

Быстрый ужин на двоих.

### Ингредиенты
- 200 г спагетти
- 100 г панчетты
- 2 яйца
- 50 г пармезана

### Приготовление
1. Отварите спагетти до готовности.
2. Обжарьте панчетту без масла.
3. Смешайте яйца с пармезаном.
4. Соедините всё и подавайте сразу.

### Примечания
- Панчетту можно заменить беконом.`;

const ENGLISH_RECIPE = `## Mushroom soup

A quiet autumn soup.

**Servings:** 4
**Prep time:** 15 minutes

### Ingredients
- 400 g mushrooms
- 1 onion
- 2 tbsp butter
- 750 ml stock

### Method
1. Slice the mushrooms and onion.
2. Melt the butter in a pan.
3. Add the vegetables and cook gently.
4. Pour in the stock and simmer.`;

describe('recipe parser', () => {
  it('extracts a complete Russian recipe into a card', () => {
    const parsed = parseRecipeResponse(RUSSIAN_RECIPE);

    expect(parsed).not.toBeNull();
    expect(parsed?.recipe.title).toBe('Паста карбонара');
    expect(parsed?.recipe.description).toBe('Быстрый ужин на двоих.');
    expect(parsed?.recipe.ingredients).toHaveLength(4);
    expect(parsed?.recipe.ingredients[0]).toEqual({
      raw: '200 г спагетти',
      amount: '200 г',
      name: 'спагетти',
    });
    expect(parsed?.recipe.steps).toHaveLength(4);
    expect(parsed?.recipe.notes).toEqual(['Панчетту можно заменить беконом.']);
    expect(parsed?.recipe.servings).toBeNull();
    expect(parsed?.recipe.time).toBeNull();
  });

  it('extracts an English recipe and its explicit metadata', () => {
    const parsed = parseRecipeResponse(ENGLISH_RECIPE);

    expect(parsed).not.toBeNull();
    expect(parsed?.recipe.title).toBe('Mushroom soup');
    expect(parsed?.recipe.servings).toBe('4');
    expect(parsed?.recipe.time).toBe('15 minutes');
    expect(parsed?.recipe.ingredients).toHaveLength(4);
    expect(parsed?.recipe.steps).toHaveLength(4);
    expect(parsed?.recipe.notes).toEqual([]);
  });

  it('does not create a card from a passing mention of a recipe', () => {
    expect(
      parseRecipeResponse(
        'Вот рецепт, который мне нравится. Ингредиенты важны, но всё зависит от настроения и сезона.'
      )
    ).toBeNull();
  });

  it('does not create a card from an incomplete recipe', () => {
    expect(
      parseRecipeResponse(`## Омлет

### Ингредиенты
- 2 яйца
- соль`)
    ).toBeNull();
  });

  it('requires more than one step', () => {
    expect(
      parseRecipeResponse(`## Herb tea

### Ingredients
- 1 tsp tea
- 200 ml water

### Method
1. Steep the tea.`)
    ).toBeNull();
  });

  it('keeps absent metadata absent instead of inventing it', () => {
    const parsed = parseRecipeResponse(`## Herb tea

### Ingredients
- 1 tsp tea
- 200 ml water

### Method
1. Warm the water.
2. Steep the tea.`);

    expect(parsed).not.toBeNull();
    expect(parsed?.recipe.servings).toBeNull();
    expect(parsed?.recipe.time).toBeNull();
    expect(parsed?.recipe.description).toBeNull();
    expect(parsed?.recipe.notes).toEqual([]);
  });

  it('accepts bulleted method steps and plain section labels', () => {
    const parsed = parseRecipeResponse(`Recipe: Simple salad

Ingredients:
- 1 tomato
- 1 cucumber

Method:
* Chop the tomato.
* Slice the cucumber.
* Toss both together.`);

    expect(parsed).not.toBeNull();
    expect(parsed?.recipe.title).toBe('Simple salad');
    expect(parsed?.recipe.steps).toHaveLength(3);
  });

  it('keeps preamble and trailing source text outside the card', () => {
    const parsed = parseRecipeResponse(`Here is the recipe you asked for.

## Soup

### Ingredients
- 2 potatoes
- 1 leek

### Method
1. Chop the vegetables.
2. Simmer them in water.

### Notes
- Add salt at the end.

Sources: [archive link](https://example.com)`);

    expect(parsed).not.toBeNull();
    expect(parsed?.before).toBe('Here is the recipe you asked for.');
    expect(parsed?.after).toBe('Sources: [archive link](https://example.com)');
    expect(parsed?.recipe.notes).toEqual(['Add salt at the end.']);
  });

  it('reads ingredient lines without bullet markers', () => {
    const parsed = parseRecipeResponse(`## Omelette

Ingredients:
2 eggs
1 tbsp butter
Salt

Method:
Beat the eggs.
Melt the butter.
Cook gently.`);

    expect(parsed).not.toBeNull();
    expect(parsed?.recipe.ingredients.map((item) => item.name)).toEqual(['eggs', 'butter', 'Salt']);
    expect(parsed?.recipe.steps).toHaveLength(3);
  });

  it('accepts bold ingredient lines without list markers', () => {
    const parsed = parseRecipeResponse(`## Quick omelette

**Ingredients**
**2 eggs**
**1 tbsp butter**

**Method**
1. Beat the eggs.
2. Melt the butter.
3. Cook gently.`);

    expect(parsed).not.toBeNull();
    expect(parsed?.recipe.ingredients).toHaveLength(2);
  });

  it('keeps Markdown tables in the normal renderer', () => {
    expect(
      parseRecipeResponse(`## Soup

### Ingredients
| Amount | Ingredient |
| --- | --- |
| 2 | potatoes |
| 1 | leek |

### Method
1. Chop everything.
2. Simmer until soft.`)
    ).toBeNull();
  });

  it('formats only the fields that are present for copying', () => {
    const parsed = parseRecipeResponse(`## Herb tea

### Ingredients
- 1 tsp tea
- 200 ml water

### Method
1. Warm the water.
2. Steep the tea.`);

    const text = formatRecipeForClipboard(parsed!.recipe);

    expect(text).toContain('Herb tea');
    expect(text).toContain('Ingredients');
    expect(text).toContain('1. Warm the water.');
    expect(text).toContain('2. Steep the tea.');
    expect(text).not.toContain('Servings:');
    expect(text).not.toContain('Time:');
  });
});
