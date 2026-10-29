import { renderHook, waitFor } from '@testing-library/react';
import useKeyboardViewportHeight from '@/components/pierrot/useKeyboardViewportHeight';

function installVisualViewport(height: number, offsetTop: number, innerHeight: number) {
  const viewport = {
    height,
    offsetTop,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };

  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: innerHeight,
  });

  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: viewport,
  });

  return viewport;
}

describe('useKeyboardViewportHeight', () => {
  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: undefined,
    });
  });

  it('returns the visual viewport height and top offset when a keyboard is open', async () => {
    installVisualViewport(500, 50, 900);

    const { result } = renderHook(() => useKeyboardViewportHeight(true));

    await waitFor(() => {
      expect(result.current).toEqual({ height: 500, offsetTop: 50 });
    });
  });

  it('returns null when the keyboard inset is small or the hook is inactive', () => {
    installVisualViewport(880, 0, 900);

    const active = renderHook(() => useKeyboardViewportHeight(true));
    expect(active.result.current).toBeNull();

    const inactive = renderHook(() => useKeyboardViewportHeight(false));
    expect(inactive.result.current).toBeNull();
  });
});
