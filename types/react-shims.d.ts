// Minimal type shims to avoid TS compile errors when full @types/react or other libs
// are not installed in the environment. These are intentionally permissive and should
// be replaced with proper types if you opt into full TypeScript checks.

declare module 'react' {
  export type ReactNode = any;
  export type ReactElement = any;
  export type JSXElementConstructor<P = any> = any;
  export type ButtonHTMLAttributes<T> = any;
  export type InputHTMLAttributes<T> = any;
  export type HTMLAttributes<T> = any;

  export function useState<S>(initial: S | (() => S)): [S, (value: S | ((prev: S) => S)) => void];
  export function useEffect(...args: any[]): void;
  export function useRef<T = any>(initial?: T): { current: T };
  export function useCallback<T extends (...args: any[]) => any>(fn: T, deps: any[]): T;
  export function createElement(...args: any[]): any;
  const React: any;
  export default React;
  export type ComponentType<P = any> = any;
}

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}

// Shim for supabase auth helpers client module if types are missing
declare module '@supabase/auth-helpers-nextjs' {
  export function createClientComponentClient(...args: any[]): any;
  export function createServerComponentClient(...args: any[]): any;
  export default any;
}

// Generic module shim (helps when some packages have no types)
declare module '*';
