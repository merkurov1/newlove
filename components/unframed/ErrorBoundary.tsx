"use client";

import React from 'react';

type State = { hasError: boolean; message?: string; stack?: string; showDetails?: boolean };

export default class ErrorBoundary extends React.Component<React.PropsWithChildren<{}>, State> {
  constructor(props: React.PropsWithChildren<{}>) {
    super(props);
    this.state = { hasError: false, message: undefined, stack: undefined, showDetails: false };
  }

  static getDerivedStateFromError(error: unknown) {
    const message = (error as Error)?.message;
    const stack = (error as Error)?.stack;
    return { hasError: true, message, stack, showDetails: false } as State;
  }
  componentDidCatch(error: unknown, info: unknown) {
    // Log to console; can be replaced with remote logging
    console.error('ErrorBoundary caught', error, info);
  }

  render() {
    if (this.state.hasError) {
      // Show minimal fallback always. Reveal details only if ?debug3d=1 in URL or when user toggles.
      const showByQuery = typeof window !== 'undefined' && window.location?.search?.includes('debug3d=1');
      const showDetails = Boolean(showByQuery || this.state.showDetails);

      return (
        <div className="w-full h-full flex items-center justify-center">
          <div className="max-w-3xl w-full px-4 py-4 rounded bg-black/80 text-white">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">3D preview failed to load</div>
              <div className="text-xs text-zinc-400">You can show details with <code className="font-mono">?debug3d=1</code></div>
            </div>
            <div className="text-sm text-zinc-300 mb-3">The 3D preview encountered an error and was disabled to keep the page stable.</div>

            {showDetails ? (
              <details open className="text-xs text-zinc-200 bg-black/60 p-3 rounded">
                <summary className="cursor-pointer mb-2 font-mono text-[12px]">Error details (tap to toggle)</summary>
                <div className="whitespace-pre-wrap break-words font-mono text-[12px] max-h-60 overflow-auto">{this.state.message}
                  {this.state.stack && (<><br/><br/>{this.state.stack}</>)}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    className="px-2 py-1 bg-zinc-800 text-xs rounded"
                    onClick={() => {
                      try {
                        const text = `${this.state.message || ''}\n\n${this.state.stack || ''}`;
                        navigator.clipboard?.writeText(text);
                      } catch (e) {
                        /* ignore */
                      }
                    }}
                  >Copy</button>
                  <button
                    className="px-2 py-1 bg-zinc-800 text-xs rounded"
                    onClick={() => this.setState({ showDetails: false })}
                  >Hide</button>
                </div>
              </details>
            ) : (
              <div className="flex items-center gap-2">
                <button className="px-3 py-1 bg-zinc-800 text-xs rounded" onClick={() => this.setState({ showDetails: true })}>Show details</button>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Functional wrapper to ensure compatibility with JSX/TSX typing in some configs
export const ErrorBoundaryWrapper: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  // Use React.createElement with `any` cast to avoid strict JSX construct-signature
  // incompatibilities in some TypeScript/react typings during build.
  return React.createElement(ErrorBoundary as any, null, children);
};
