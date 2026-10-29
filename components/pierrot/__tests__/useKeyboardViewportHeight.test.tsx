import { act, renderHook, waitFor } from '@testing-library/react';
import useKeyboardViewportHeight from '@/components/pierrot/useKeyboardViewportHeight';

type Listener = () => void;

function installVisualViewport(
  width: number,
  height: number,
  offsetTop: number,
  offsetLeft = 0,
  innerHeight = height
) {
  const listeners = new Map<string, Set<Listener>>();

  const viewport = {
    width,
    height,
    offsetTop,
    offsetLeft,
    addEventListener: jest.fn((type: string, listener: Listener) => {
      const bucket = listeners.get(type) ?? new Set<Listener>();
      bucket.add(listener);
      listeners.set(type, bucket);
    }),
    removeEventListener: jest.fn((type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener);
    }),
  };

  const emit = (type: string) => {
    listeners.get(type)?.forEach((listener) => listener());
  };

  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: innerHeight,
  });

  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: viewport,
  });

  return { viewport, emit };
}

describe('useKeyboardViewportHeight', () => {
  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: undefined,
    });
  });

  it('returns the complete visual viewport rectangle', () => {
    installVisualViewport(390, 500, 50, 4, 900);

    const { result } = renderHook(() => useKeyboardViewportHeight(true));

    expect(result.current).toEqual({
      width: 390,
      height: 500,
      offsetTop: 50,
      offsetLeft: 4,
    });
  });

  it('does not compare against window.innerHeight', () => {
    // iOS can report a layout viewport that already matches the keyboard-sized
    // visual viewport. The old implementation treated this as "no keyboard".
    installVisualViewport(390, 500, 0, 0, 500);

    const { result } = renderHook(() => useKeyboardViewportHeight(true));

    expect(result.current).toEqual({
      width: 390,
      height: 500,
      offsetTop: 0,
      offsetLeft: 0,
    });
  });

  it('follows visual viewport resize and scroll events', async () => {
    const { viewport, emit } = installVisualViewport(390, 844, 0);

    const { result } = renderHook(() => useKeyboardViewportHeight(true));

    expect(result.current?.height).toBe(844);

    act(() => {
      viewport.height = 500;
      viewport.offsetTop = 24;
      emit('resize');
    });

    await waitFor(() => {
      expect(result.current).toEqual({
        width: 390,
        height: 500,
        offsetTop: 24,
        offsetLeft: 0,
      });
    });

    act(() => {
      viewport.offsetTop = 68;
      emit('scroll');
    });

    await waitFor(() => {
      expect(result.current?.offsetTop).toBe(68);
    });
  });

  it('returns null without a usable visual viewport or while inactive', () => {
    const { result: withoutViewport } = renderHook(() => useKeyboardViewportHeight(true));
    expect(withoutViewport.current).toBeNull();

    installVisualViewport(390, 844, 0);

    const { result: inactive } = renderHook(() => useKeyboardViewportHeight(false));
    expect(inactive.current).toBeNull();
  });

  it('keeps the last usable geometry while the visual viewport is momentarily zero', async () => {
    const { viewport, emit } = installVisualViewport(390, 844, 0);

    const { result } = renderHook(() => useKeyboardViewportHeight(true));

    act(() => {
      viewport.height = 0;
      emit('resize');
    });

    await waitFor(() => {
      expect(result.current?.height).toBe(844);
    });
  });
});
