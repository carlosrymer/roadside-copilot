// Markdown policy docs are bundled as strings via esbuild's text loader.
declare module '*.md' {
  const content: string;
  export default content;
}
