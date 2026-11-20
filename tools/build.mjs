// Bundles the UI into dist/: index.html, app.js, app.css (and a single-file copy for previews).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const root = new URL('..', import.meta.url);
mkdirSync(new URL('dist/', root), { recursive: true });
await build({
  entryPoints: [new URL('src/ui/main.js', root).pathname],
  bundle: true,
  format: 'iife',
  target: ['es2020', 'safari14'],
  minify: process.env.DEBUG ? false : true,
  legalComments: 'none',
  outfile: new URL('dist/app.js', root).pathname,
});
const css = readFileSync(new URL('src/ui/styles.css', root), 'utf8');
writeFileSync(new URL('dist/app.css', root), css);
const html = readFileSync(new URL('src/ui/index.template.html', root), 'utf8');
writeFileSync(new URL('dist/index.html', root), html);
const js = readFileSync(new URL('dist/app.js', root), 'utf8');
const single = html
  .replace('<link rel="stylesheet" href="app.css">', `<style>\n${css}\n</style>`)
  .replace('<script src="app.js"></script>', () => `<script>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`);
writeFileSync(new URL('dist/single.html', root), single);
console.log('built', { js: js.length, css: css.length, single: single.length });
