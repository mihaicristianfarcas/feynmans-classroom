// Types for page.mjs, so the server can import it from TypeScript.
export function runtimeFiles(root?: string): {
  kit: string;
  runtime: string;
  draw2d: string;
  css: string;
  isoCss: string[];
};
export function buildDemoPage(options: {
  source: string;
  theme?: "light" | "dark";
  fig?: string;
  title?: string;
  predict?: boolean;
  autoplay?: boolean;
  files?: ReturnType<typeof runtimeFiles>;
}): string;
