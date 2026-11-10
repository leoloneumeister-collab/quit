// Assembles the playable app in www/ from src/.
// Usage: node tools/build.mjs [single-file-output.html]
// The optional argument also writes a one-file version (styles and script inlined, no <html> shell).
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = f => readFileSync(join(root, 'src', f), 'utf8');
const body = src('body.html'), css = src('style.css'), js = src('game.js');
const FONTS = 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;800&family=Nunito:wght@600;800&display=swap';

mkdirSync(join(root, 'www', 'fonts'), { recursive: true });
// Fonts ship inside the app so it looks right with no connection.
const faces = [['baloo-2', 'Baloo 2'], ['nunito', 'Nunito']].flatMap(([pkg, family]) => [600, 800].map(w => {
  const file = `${pkg}-latin-${w}-normal.woff2`;
  copyFileSync(join(root, 'node_modules', '@fontsource', pkg, 'files', file), join(root, 'www', 'fonts', file));
  return `@font-face { font-family: "${family}"; font-weight: ${w}; font-display: swap; src: url(${file}) format("woff2"); }`;
}));
writeFileSync(join(root, 'www', 'fonts', 'fonts.css'), faces.join('\n') + '\n');
copyFileSync(join(root, 'src', 'style.css'), join(root, 'www', 'style.css'));
copyFileSync(join(root, 'src', 'game.js'), join(root, 'www', 'game.js'));
writeFileSync(join(root, 'www', 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#7cc8f2">
<meta name="description" content="Pitch a tent, merge your way to a skyline. A cosy village builder.">
<title>Mossby Village</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/icon-192.png">
<link rel="stylesheet" href="fonts/fonts.css">
<link rel="stylesheet" href="style.css">
<style>
  :root { box-sizing: border-box; padding: var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) 0 var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)); }
  body { margin: 0; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
${body}
<script src="game.js"></script>
<script>
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
</script>
</body>
</html>
`);

if (process.argv[2]) {
  writeFileSync(process.argv[2], `<meta name="claude:viewport-fit-sides" content="cover">
<title>Mossby Village</title>
<link rel="stylesheet" href="${FONTS}">
<style>
${css}</style>
${body}
<script>
${js}</script>
`);
}
console.log('built www/' + (process.argv[2] ? ' and ' + process.argv[2] : ''));
