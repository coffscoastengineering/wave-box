// Bundles the generator into one offline HTML file: dist/claude-box-generator.html
import fs from 'node:fs';
import { build } from 'esbuild';

const r = (p) => new URL(`../${p}`, import.meta.url);
const js = await build({
  entryPoints: [r('src/ui/app.js').pathname.replace(/^\/([A-Z]:)/, '$1')],
  bundle: true, minify: true, format: 'iife', platform: 'browser', target: 'es2020', write: false,
  external: ['html2canvas', 'dompurify', 'canvg'],
  legalComments: 'none',
});
const code = js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(r('src/ui/style.css'), 'utf8');
const html = fs.readFileSync(r('src/ui/index.html'), 'utf8')
  .replace('/*CSS*/', () => css)
  .replace('/*JS*/', () => code);
fs.mkdirSync(r('dist'), { recursive: true });
fs.writeFileSync(r('dist/claude-box-generator.html'), html);
console.log(`dist/claude-box-generator.html ${(html.length / 1024).toFixed(0)} KB`);
