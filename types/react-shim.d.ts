// Minimal React + JSX shims to satisfy TypeScript checks in this workspace
// This is intentionally small — for full typing install @types/react and @types/react-dom
declare module 'react' {
  export = React;
}

declare namespace React {
  type ReactNode = any;
  interface Attributes {}
  interface ClassAttributes<T> {}
  type PropsWithChildren<P> = P & { children?: ReactNode };
  function createElement(type: any, props?: any, ...children: any[]): any;
  type ChangeEvent<T = any> = {
    target: T;
  } & Event;
  interface FunctionComponent<P = {}> {
    (props: PropsWithChildren<P>): ReactNode;
  }
  function useState<S = any>(initial: S | (() => S)): [S, (s: S) => void];
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
    type Element = any;
  }
}
