// Provide a minimal global JSX declaration for common react-three-fiber
// elements so TypeScript in the dev container doesn't error when those
// elements are used in JSX. Vercel will install the real types during
// deployment; this keeps the local typechecking tolerant.
declare global {
  namespace JSX {
    interface IntrinsicElements {
      // Common R3F/Three elements used across the codebase
      group?: any;
      mesh?: any;
      perspectiveCamera?: any;
      orthographicCamera?: any;
      ambientLight?: any;
      directionalLight?: any;
      pointLight?: any;
      spotLight?: any;
      meshStandardMaterial?: any;
      meshBasicMaterial?: any;
      primitive?: any;
      [key: string]: any;
    }
  }
}

export {};
