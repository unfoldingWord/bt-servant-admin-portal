// Vite's `?raw` suffix imports a file's text as a string. The worker tsconfig
// does not load `vite/client` (it would drag DOM types into the worker
// typecheck), so declare just the one module shape the tests use.
declare module "*?raw" {
  const content: string;
  export default content;
}
