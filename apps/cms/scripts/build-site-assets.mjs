// Builds the static assets of the public site into public/site/ (git-ignored): one stylesheet with the fonts it names,
// and one script made of the small client scripts. Runs before `next dev` and `next build` (predev, prebuild).
//   site.css   fonts.css (URLs rewritten to /site/fonts/<file>) + global.css (its @import dropped)
//   site.js    the client scripts, each in its own function so they cannot clash
//   fonts/     the woff2 files site.css names, copied from the fontsource packages
// The code highlighter's stylesheet and script are served by routes (src/app/(site)/site/ec.*), not built here.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const out = path.join(root, 'public/site');
const styles = path.join(root, 'src/site/styles');
const clientDir = path.join(root, 'src/site/client');
const SCRIPTS = ['theme', 'menu', 'copy-link', 'jp-gloss', 'embed-frame'];

rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(out, 'fonts'), { recursive: true });

// Fonts: the url() paths in fonts.css point into node_modules; copy each file and point the URL at /site/fonts/.
const packageDir = (name) => path.dirname(require.resolve(`${name}/package.json`, { paths: [root] }));
let fonts = readFileSync(path.join(styles, 'fonts.css'), 'utf8');
fonts = fonts.replace(/url\('\.\.\/\.\.\/node_modules\/(@fontsource-variable\/[^/]+)\/files\/([^']+)'\)/g, (_m, pkg, file) => {
  const from = path.join(packageDir(pkg), 'files', file);
  if (!existsSync(from)) throw new Error(`font file missing: ${from}`);
  cpSync(from, path.join(out, 'fonts', file));
  return `url('/site/fonts/${file}')`;
});
if (/node_modules/.test(fonts)) throw new Error('fonts.css still points into node_modules');
const global = readFileSync(path.join(styles, 'global.css'), 'utf8').replace(/^@import[^\n]*\n/gm, '');
writeFileSync(path.join(out, 'site.css'), `${fonts}\n${global}`);

const js = SCRIPTS.map((name) => `(() => {\n${readFileSync(path.join(clientDir, `${name}.js`), 'utf8')}\n})();`).join('\n');
writeFileSync(path.join(out, 'site.js'), js);

// Extra stylesheets of the site (search page and others) are appended after global.css.
for (const f of readdirSync(styles)
  .filter((f) => f.endsWith('.css') && f !== 'global.css' && f !== 'fonts.css')
  .sort()) {
  writeFileSync(path.join(out, 'site.css'), `\n${readFileSync(path.join(styles, f), 'utf8')}`, { flag: 'a' });
}
console.log(`site assets: ${readdirSync(path.join(out, 'fonts')).length} fonts, site.css, site.js`);
