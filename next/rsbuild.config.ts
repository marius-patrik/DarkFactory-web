import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
const inline = process.env.WRKBENCH_SINGLE_HTML === '1';
export default defineConfig({
  plugins: [pluginReact()],
  source: { entry: { index: './apps/web/src/main.tsx' } },
  html: { title: 'Wrkbench', template: './apps/web/index.html', inject: inline?'body':'head' },
  output: {
    distPath: { root: './dist' },
    assetPrefix: './',
    inlineScripts: inline,
    inlineStyles: inline,
  },
  server: { port: 5173 },
  tools: inline ? { rspack: { optimization: { splitChunks: false, runtimeChunk: false }, module: {parser: {javascript: {dynamicImportMode:'eager'}}} } } : {},
});
