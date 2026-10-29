import React from 'react';
import { render, screen } from '@testing-library/react';
import PierrotContextBlock, { type AIContextData } from '@/components/flow/PierrotContextBlock';

// react-markdown ships ESM only; the hook-order regression does not need it.
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => children,
}));

jest.mock('remark-gfm', () => ({
  __esModule: true,
  default: () => undefined,
}));

describe('PierrotContextBlock', () => {
  it('keeps a stable hook order when context turns from null to ready', () => {
    const { rerender, container } = render(<PierrotContextBlock context={null} />);

    expect(container).toBeEmptyDOMElement();

    const ready: AIContextData = {
      content: 'Steady insight',
      status: 'ready',
    };

    rerender(<PierrotContextBlock context={ready} />);

    expect(screen.getByText('Steady insight')).toBeInTheDocument();
  });
});
