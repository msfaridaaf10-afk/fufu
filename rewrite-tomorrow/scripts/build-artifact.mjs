// Builds a version of the site for hosting as a claude.ai Artifact page.
// The Artifact host wraps the page in its own <!doctype>/<html>/<head>/<body>,
// so this strips those tags from public/index.html and keeps everything else.
//   node scripts/build-artifact.mjs [outDir]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, '..', 'public', 'index.html'), 'utf8');
const out = process.argv[2] || path.join(here, '..', 'dist-artifact');

const head = src.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<meta charset[^>]*>\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');
const body = src.match(/<body>([\s\S]*?)<\/body>/)[1];
const htmlAttrs = src.match(/<html([^>]*)>/)[1];

const page = `${head.trim()}
<script>
  // Carry the original <html> attributes over to the host's root element.
  (function () {
    var d = document.documentElement;
    ${[...htmlAttrs.matchAll(/(data-[\w-]+)="([^"]*)"/g)].map(([, k, v]) => `if (!d.hasAttribute('${k}') || '${k}' !== 'data-theme') d.setAttribute('${k}', '${v}');`).join('\n    ')}
    d.lang = 'en';
  })();
</script>
${body.trim()}
`;
// Inline scripts must run before boot.js reads the theme: move boot.js after the attribute shim.
const fixed = page
  .replace('<script src="js/boot.js"></script>\n', '')
  .replace('</script>\n', '</script>\n<script src="js/boot.js"></script>\n');

mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'index.html'), fixed);
console.log(`Wrote ${path.join(out, 'index.html')}`);
