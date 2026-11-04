declare module '*.png' {
  const src: string
  export default src
}

// Stylesheets are imported for their side effect only (Vite bundles them).
// TypeScript 6 checks that such imports resolve (noUncheckedSideEffectImports).
declare module '*.css'
