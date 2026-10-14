import fs from 'node:fs';
import assert from 'node:assert/strict';

assert.equal(fs.realpathSync('.'), '/Users/paulista/Documents/Codex/2026-06-05/new-chat');
const files = [...fs.readdirSync('.').filter(f => f.endsWith('.html')),
  ...fs.readdirSync('posts').filter(f => f.endsWith('.html')).map(f => 'posts/' + f)];
const outputs = files.map(file => {
  const html = fs.readFileSync(file, 'utf8');
  if (html.includes('language-toggle.js')) return [file, html, html];
  const end = html.lastIndexOf('</body>');
  assert(end >= 0, `Missing body end: ${file}`);
  const script = `  <script src="${file.startsWith('posts/') ? '../' : ''}assets/language-toggle.js"></script>\n`;
  return [file, html, html.slice(0, end) + script + html.slice(end)];
});
let changed = 0;
for (const [file, original, html] of outputs) if (html !== original) {
  fs.writeFileSync(file, html);
  changed++;
}
console.log(JSON.stringify({ pages: files.length, added: changed }));
