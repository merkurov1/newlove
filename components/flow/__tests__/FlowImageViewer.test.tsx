import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import FlowImageViewer from '../FlowImageViewer';

const IMAGES = [
  { src: 'https://images.example.com/one.jpg', alt: 'First room', caption: 'The first room' },
  { src: 'https://images.example.com/two.jpg', alt: 'Second room', caption: 'The second room' },
  { src: 'https://images.example.com/three.jpg', alt: 'Third room', caption: '' },
];

function renderViewer(index = 0) {
  const onClose = jest.fn();
  const onIndexChange = jest.fn();

  const result = render(
    <FlowImageViewer
      images={IMAGES}
      index={index}
      onClose={onClose}
      onIndexChange={onIndexChange}
    />
  );

  return { ...result, onClose, onIndexChange };
}

afterEach(() => {
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
});

describe('FlowImageViewer', () => {
  it('presents the active image with alt text, caption and a counter', () => {
    renderViewer(1);

    expect(screen.getByRole('dialog', { name: 'Image viewer' })).toBeInTheDocument();
    expect(screen.getByAltText('Second room')).toBeInTheDocument();
    expect(screen.getByText('The second room')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('locks background scrolling while open and restores it on unmount', () => {
    const { unmount } = renderViewer();

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    unmount();

    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('moves through the gallery with controls and keyboard arrows only at real boundaries', () => {
    const { onIndexChange } = renderViewer(0);

    fireEvent.click(screen.getByRole('button', { name: 'Next image' }));
    expect(onIndexChange).toHaveBeenLastCalledWith(1);

    expect(screen.getByRole('button', { name: 'Previous image' })).toBeDisabled();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
    expect(onIndexChange).toHaveBeenLastCalledWith(1);
  });

  it('closes with the visible affordance and Escape', () => {
    const first = renderViewer();
    fireEvent.click(screen.getByRole('button', { name: 'Close image viewer' }));
    expect(first.onClose).toHaveBeenCalledTimes(1);

    first.unmount();

    const second = renderViewer();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(second.onClose).toHaveBeenCalledTimes(1);
  });

  it('supports horizontal swipe and swipe-down dismissal', () => {
    const swipe = renderViewer(1);

    const stage = screen.getByText('The second room').closest('.flow-viewer__stage');

    expect(stage).not.toBeNull();

    fireEvent.touchStart(stage as Element, {
      touches: [{ clientX: 220, clientY: 300 }],
    });
    fireEvent.touchEnd(stage as Element, {
      touches: [],
      changedTouches: [{ clientX: 120, clientY: 302 }],
    });

    expect(swipe.onIndexChange).toHaveBeenLastCalledWith(2);

    swipe.unmount();

    const down = renderViewer(0);
    const downStage = screen.getByAltText('First room').closest('.flow-viewer__stage');

    expect(downStage).not.toBeNull();

    fireEvent.touchStart(downStage as Element, {
      touches: [{ clientX: 190, clientY: 220 }],
    });
    fireEvent.touchEnd(downStage as Element, {
      touches: [],
      changedTouches: [{ clientX: 192, clientY: 360 }],
    });

    expect(down.onClose).toHaveBeenCalledTimes(1);
  });

  it('double tap toggles zoom instead of navigating', () => {
    const { onIndexChange } = renderViewer(0);
    const stage = screen.getByAltText('First room').closest('.flow-viewer__stage');

    expect(stage).not.toBeNull();

    fireEvent.touchStart(stage as Element, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(stage as Element, {
      touches: [],
      changedTouches: [{ clientX: 100, clientY: 100 }],
    });
    fireEvent.touchStart(stage as Element, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(stage as Element, {
      touches: [],
      changedTouches: [{ clientX: 100, clientY: 100 }],
    });

    expect(onIndexChange).not.toHaveBeenCalled();
    expect(screen.getByAltText('First room')).toHaveStyle({ cursor: 'zoom-out' });
  });
});
