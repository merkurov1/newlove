// Minimal type stub for 'minimatch' to satisfy TypeScript in editor when @types/minimatch isn't resolvable.
declare module 'minimatch' {
  interface IOptions {
    nocase?: boolean;
    dot?: boolean;
    matchBase?: boolean;
    noglobstar?: boolean;
    nonegate?: boolean;
    flipNegate?: boolean;
  }

  function minimatch(path: string, pattern: string, options?: IOptions): boolean;
  namespace minimatch {
    function Minimatch(pattern: string, options?: IOptions): any;
  }

  export = minimatch;
}
