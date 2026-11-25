/**
 * Reveal origin for the Temple ritual modals.
 *
 * The reference effect expands from the exact centre of the element that was
 * pressed and collapses back to that same element. The intercepted ritual
 * route mounts above a still-mounted Temple, so the source node can be
 * measured again on close instead of reusing the opening geometry.
 */

export type RevealSource = {
  element: HTMLElement | null;
  x: number;
  y: number;
  color: string | null;
  path: string;
};

let lastSource: RevealSource | null = null;

function readCenter(element: HTMLElement) {
  const rect = element.getBoundingClientRect();

  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    width: rect.width,
    height: rect.height,
  };
}

function readRitualColor(element: HTMLElement): string | null {
  if (typeof window === 'undefined') return null;

  const computed = window.getComputedStyle(element);
  const color =
    computed.getPropertyValue('--c').trim() ||
    computed.getPropertyValue('--accent').trim();

  return color || null;
}

function toSource(element: HTMLElement, path: string): RevealSource {
  const center = readCenter(element);

  return {
    element,
    x: center.x,
    y: center.y,
    color: readRitualColor(element),
    path,
  };
}

function findSourceByPath(path: string): HTMLElement | null {
  if (typeof document === 'undefined') return null;

  const escaped = path.replace(/"/g, '\\"');
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      `a[href="${escaped}"],[data-reveal-path="${escaped}"]`
    )
  );

  return (
    candidates.find((element) => {
      const rect = element.getBoundingClientRect();

      return rect.width > 0 || rect.height > 0;
    }) ?? null
  );
}

/**
 * Remember the trigger at click time. `getBoundingClientRect()` is measured
 * here, so both pointer and keyboard activation use the element centre rather
 * than the pointer coordinates or a guessed viewport point.
 */
export function rememberRevealSource(
  element: HTMLElement,
  path?: string | null
): RevealSource {
  const resolvedPath = path || element.getAttribute('href') || '';
  const source = toSource(element, resolvedPath);

  lastSource = source;

  return source;
}

/**
 * Resolve fresh coordinates for the modal. On close the same connected source
 * node is measured again; if it is gone, the last measured centre is used so
 * the collapse still targets the last known element.
 */
export function resolveRevealSource(
  path?: string | null
): RevealSource | null {
  if (typeof document === 'undefined') return null;

  const resolvedPath = path || lastSource?.path || '';

  if (lastSource?.element?.isConnected) {
    if (!resolvedPath || !lastSource.path || lastSource.path === resolvedPath) {
      return toSource(lastSource.element, resolvedPath || lastSource.path);
    }
  }

  const element = resolvedPath ? findSourceByPath(resolvedPath) : null;

  if (element) {
    const source = toSource(element, resolvedPath);

    lastSource = source;

    return source;
  }

  return lastSource ? { ...lastSource } : null;
}

/**
 * Write the reveal variables onto the overlay itself. Writing them inline
 * keeps the CSS numeric contract exactly as specified while still letting the
 * modal be measured again for its closing frame.
 */
export function writeRevealVars(
  target: HTMLElement,
  source: RevealSource
) {
  target.style.setProperty('--x', `${source.x}px`);
  target.style.setProperty('--y', `${source.y}px`);

  if (source.color) {
    target.style.setProperty('--c', source.color);
  }
}

export function resetRevealSourceForTests() {
  lastSource = null;
}
