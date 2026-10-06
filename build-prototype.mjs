/* Rebuilds the single-file prototype by PATCHING a previous prototype with the current sources.
   Replaced parts: <style> block (styles.css), the page body (index.html), the modules guide.js + guide-steps.js
   (wrapped as __M['guide'] / __M['guidesteps']) and the APP_VERSION constant. Everything else (inlined icons, core,
   other modules, app code) is kept from the base file.
   Usage: node build-prototype.mjs <base-prototype.html> <out.html> [--check]
   --check: only verifies that the output equals the base (used to prove the builder is exact for the same sources). */
import fs from 'node:fs';
const [base, out, flag] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node build-prototype.mjs <base.html> <out.html> [--check]'); process.exit(2); }
const rd = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
let html = fs.readFileSync(base, 'utf8');

function wrap(name, src) {
  const names = [];
  let body = src.replace(/^export\s+(const|let|function|async function|class)\s+([A-Za-z0-9_$]+)/gm, (m, kw, id) => { names.push(id); return kw + ' ' + id; });
  body = body.replace(/^import\s+[^;]+;\s*$/gm, '');
  return `__M['${name}']=(()=>{\n${body.replace(/\s+$/, '')}\nreturn {${names.join(',')}};\n})();\n`;
}
function swapModule(h, name, src) {
  const start = h.indexOf(`__M['${name}']=(()=>{`);
  if (start < 0) throw new Error('module not found: ' + name);
  const endTok = '\n})();\n';
  const end = h.indexOf(endTok, start);
  return h.slice(0, start) + wrap(name, src) + h.slice(end + endTok.length);
}
html = swapModule(html, 'guide', rd('./guide.js'));
html = swapModule(html, 'guidesteps', rd('./guide-steps.js'));

/* CSS */
const css = rd('./styles.css');
const s0 = html.indexOf('<style>') + '<style>'.length, s1 = html.indexOf('</style>');
html = html.slice(0, s0) + css.replace(/\s+$/, '') + '\n' + html.slice(s1);

/* Body: everything between <body> and the first inline <script> */
const idx = rd('./index.html');
const b0 = idx.indexOf('<body>') + '<body>'.length, b1 = idx.indexOf('<script type="module"');
const newBody = idx.slice(b0, b1);
const h0 = html.indexOf('<body>') + '<body>'.length, h1 = html.indexOf('<script>', h0);
html = html.slice(0, h0) + newBody + html.slice(h1);

/* Inline the image assets the way the single-file prototype carries them (data URIs) */
const mime = f => f.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
const dataUri = f => `data:${mime(f)};base64,` + fs.readFileSync(new URL(f, import.meta.url)).toString('base64');
html = html.replace(/url\(\.\/(intro-bg\.jpg)\)/g, (m, f) => `url(${dataUri('./' + f)})`);
html = html.replace(/src="\.\/(icon-\d+\.png)"/g, (m, f) => `src="${dataUri('./' + f)}"`);

/* Version */
const ver = (rd('./app.js').match(/const APP_VERSION='([^']+)'/) || [])[1];
html = html.replace(/const APP_VERSION='[^']+'/, `const APP_VERSION='${ver}'`);

if (flag === '--check') {
  const norm = t => t.split('\n').filter(l => l.trim() && !l.startsWith('/* v1.74')).join('\n');
  const same = norm(html) === norm(fs.readFileSync(base, 'utf8'));
  console.log(same ? 'CHECK OK: builder reproduces the base prototype exactly' : 'CHECK DIFFERS'); process.exit(same ? 0 : 1);
}
fs.writeFileSync(out, html);
console.log('wrote', out, (html.length / 1024).toFixed(0) + ' KB, version ' + ver);
