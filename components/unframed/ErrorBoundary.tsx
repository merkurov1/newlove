"use client";

import React from 'react';

export default class ErrorBoundary extends React.Component<React.PropsWithChildren<{}>, { hasError: boolean }> {
  constructor(props: React.PropsWithChildren<{}>) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // Log to console; can be replaced with remote logging
    console.error('ErrorBoundary caught', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex items-center justify-center">
          <div className="bg-black/70 text-white px-4 py-2 rounded">3D preview failed to load</div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Functional wrapper to ensure compatibility with JSX/TSX typing in some configs
export const ErrorBoundaryWrapper: React.FC<React.PropsWithChildren<{}>> = ({ children }) => (
  <ErrorBoundary>{children}</ErrorBoundary>
);
