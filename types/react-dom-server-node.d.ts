/**
 * React 18 exposes the Node build as `react-dom/server.node`, and Next's
 * App Router rejects a bare `react-dom/server` import from a route handler.
 * DefinitelyTyped only declares the bare specifier, so the public API is
 * re-exported here.
 */
declare module 'react-dom/server.node' {
  export * from 'react-dom/server';
}
