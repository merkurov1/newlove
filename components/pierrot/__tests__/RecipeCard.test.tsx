import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RecipeCard from '../RecipeCard';
import { parseRecipeResponse } from '@/lib/pierrot/recipeParser';

afterEach(cleanup);

const parsed = parseRecipeResponse(`## Herb tea

### Ingredients
- 1 tsp tea
- 200 ml water

### Method
1. Warm the water.
2. Steep the tea.`);

describe('RecipeCard', () => {
  it('renders the recipe and omits absent metadata', () => {
    render(<RecipeCard recipe={parsed!.recipe} />);

    expect(screen.getByText('Herb tea')).toBeInTheDocument();
    expect(screen.getByText('Ingredients')).toBeInTheDocument();
    expect(screen.getByText('Method')).toBeInTheDocument();
    expect(screen.getByText('Warm the water.')).toBeInTheDocument();
    expect(screen.queryByText(/Serves/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Time /)).not.toBeInTheDocument();
    expect(screen.queryByText('Notes')).not.toBeInTheDocument();
    expect(screen.getByText('1 tsp')).toBeInTheDocument();
    expect(screen.getByText('tea')).toBeInTheDocument();
  });

  it('copies the whole recipe as plain text', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(<RecipeCard recipe={parsed!.recipe} />);
    fireEvent.click(screen.getByRole('button', { name: /copy recipe/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Herb tea'));
    });

    expect(writeText.mock.calls[0][0]).toContain('1. Warm the water.');
    expect(writeText.mock.calls[0][0]).toContain('2. Steep the tea.');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });
});
