import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import FlowReaderSettings from '../FlowReaderSettings';
import {
  DEFAULT_FLOW_READER_PREFS,
  FLOW_READER_FONT_SCALE_MAX,
  FLOW_READER_FONT_SCALE_MIN,
  FLOW_READER_LINE_HEIGHT_MAX,
  FLOW_READER_LINE_HEIGHT_MIN,
  type FlowReaderPrefs,
} from '@/lib/flow/readerState';

function prefs(patch: Partial<FlowReaderPrefs> = {}): FlowReaderPrefs {
  return { ...DEFAULT_FLOW_READER_PREFS, ...patch };
}

describe('FlowReaderSettings', () => {
  it('selects a theme and reports the patch', () => {
    const onChange = jest.fn();
    const { rerender } = render(<FlowReaderSettings prefs={prefs()} onChange={onChange} />);

    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Sepia' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));

    expect(onChange).toHaveBeenCalledWith({ theme: 'dark' });

    rerender(<FlowReaderSettings prefs={prefs({ theme: 'dark' })} onChange={onChange} />);

    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('steps text size and disables the control at both bounds', () => {
    const onChange = jest.fn();
    const { rerender } = render(<FlowReaderSettings prefs={prefs()} onChange={onChange} />);

    expect(screen.getByText('100%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Increase text size' }));
    fireEvent.click(screen.getByRole('button', { name: 'Decrease text size' }));

    expect(onChange).toHaveBeenNthCalledWith(1, { fontScale: 1.1 });
    expect(onChange).toHaveBeenNthCalledWith(2, { fontScale: 0.9 });

    rerender(
      <FlowReaderSettings
        prefs={prefs({ fontScale: FLOW_READER_FONT_SCALE_MIN })}
        onChange={onChange}
      />
    );

    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decrease text size' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Increase text size' })).toBeEnabled();

    rerender(
      <FlowReaderSettings
        prefs={prefs({ fontScale: FLOW_READER_FONT_SCALE_MAX })}
        onChange={onChange}
      />
    );

    expect(screen.getByText('150%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decrease text size' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Increase text size' })).toBeDisabled();
  });

  it('updates line spacing and mirrors the current value', () => {
    const onChange = jest.fn();
    const { rerender } = render(<FlowReaderSettings prefs={prefs()} onChange={onChange} />);

    const slider = screen.getByRole('slider', { name: 'Line spacing' });

    expect(slider).toHaveAttribute('min', String(FLOW_READER_LINE_HEIGHT_MIN));
    expect(slider).toHaveAttribute('max', String(FLOW_READER_LINE_HEIGHT_MAX));
    expect(slider).toHaveAttribute('step', '0.05');
    expect(screen.getByText('1.75')).toBeInTheDocument();

    fireEvent.change(slider, { target: { value: '2.05' } });

    expect(onChange).toHaveBeenCalledWith({ lineHeight: 2.05 });

    rerender(<FlowReaderSettings prefs={prefs({ lineHeight: 2.05 })} onChange={onChange} />);

    expect(screen.getByText('2.05')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Line spacing' })).toHaveValue('2.05');
  });
});
