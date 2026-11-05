'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { formatRecipeForClipboard, type ParsedRecipe } from '@/lib/pierrot/recipeParser';

type CopyState = 'idle' | 'copied' | 'error';

async function copyText(value: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

export default function RecipeCard({ recipe }: { recipe: ParsedRecipe }) {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    []
  );

  const handleCopy = async () => {
    try {
      await copyText(formatRecipeForClipboard(recipe));
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }

    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopyState('idle'), 2200);
  };

  return (
    <article
      data-pierrot-recipe
      className="mt-1 overflow-hidden rounded-[18px] border border-[#DED2C1] bg-[#F8F2E9]"
    >
      <header className="flex items-start justify-between gap-3 border-b border-[#E6DACA] px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-[#8B735B]">
            Recipe
          </p>
          {recipe.title && (
            <h3 className="mt-1 font-serif text-[22px] font-normal leading-[1.15] text-[#2B2620] sm:text-[25px]">
              {recipe.title}
            </h3>
          )}
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#D8C9B6] px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[#6B5C4A] transition hover:border-[#B9A48C] hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#B5AAA0] focus:ring-offset-2"
          aria-label="Copy recipe"
        >
          {copyState === 'copied' ? (
            <Check size={11} aria-hidden="true" />
          ) : (
            <Copy size={11} aria-hidden="true" />
          )}
          {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Try again' : 'Copy recipe'}
        </button>
      </header>

      <div className="px-4 py-4 sm:px-5">
        {recipe.description && (
          <p className="font-serif text-[14px] leading-[1.55] text-[#6B6156]">
            {recipe.description}
          </p>
        )}

        {(recipe.servings || recipe.time) && (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-[#E6DACA] pt-3 font-mono text-[9px] uppercase tracking-[0.08em] text-[#7A6A57]">
            {recipe.servings && <span>Serves {recipe.servings}</span>}
            {recipe.time && <span>Time {recipe.time}</span>}
          </div>
        )}

        <div className="mt-4 grid gap-5 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <section aria-label="Ingredients">
            <h4 className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[#8B735B]">
              Ingredients
            </h4>
            <ul className="mt-2 space-y-1.5 font-serif text-[14.5px] leading-[1.45] text-[#3A342D]">
              {recipe.ingredients.map((ingredient, index) => (
                <li key={`${ingredient.raw}-${index}`} className="flex gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#B9A48C]"
                  />
                  <span>
                    {ingredient.amount ? (
                      <>
                        <span className="text-[#7A5A3A]">{ingredient.amount}</span>{' '}
                        {ingredient.name}
                      </>
                    ) : (
                      ingredient.name
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Method">
            <h4 className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[#8B735B]">
              Method
            </h4>
            <ol className="mt-2 space-y-3">
              {recipe.steps.map((step, index) => (
                <li
                  key={`${step.slice(0, 24)}-${index}`}
                  className="grid grid-cols-[18px_1fr] gap-2 font-serif text-[14.5px] leading-[1.55] text-[#3A342D]"
                >
                  <span className="pt-[2px] font-mono text-[9px] text-[#A5764F]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {recipe.notes.length > 0 && (
          <section aria-label="Notes" className="mt-4 border-t border-[#E6DACA] pt-3">
            <h4 className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[#8B735B]">
              Notes
            </h4>
            <ul className="mt-2 space-y-1.5 font-serif text-[13.5px] leading-[1.5] text-[#5C5349]">
              {recipe.notes.map((note, index) => (
                <li key={`${note.slice(0, 24)}-${index}`} className="flex gap-2">
                  <span aria-hidden="true" className="text-[#A5764F]">
                    —
                  </span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </article>
  );
}
