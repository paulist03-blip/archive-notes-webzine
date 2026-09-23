import fs from 'node:fs';
import { articles } from './issue67-content.mjs';
import { articles as previousArticles } from './issue66-content.mjs';

const base = 'https://archive-notes-webzine.vercel.app';
const entries = [
  ['/', 'index.html'], ['/archive', 'archive.html'], ['/book-archive', 'book-archive.html'],
  ['/assets/book-archive-data.js', 'assets/book-archive-data.js'],
  ['/assets/issue67.css', 'assets/issue67.css'],
  ...articles.flatMap(a => [[`/posts/${a.slug}`, `posts/${a.slug}.html`], [`/${a.image}`, a.image]]),
  ...previousArticles.map(a => [`/posts/${a.slug}`, `posts/${a.slug}.html`]),
  ['/posts/unknown-masterpiece-balzac', 'posts/unknown-masterpiece-balzac.html'],
  ['/posts/cezanne-basket-of-apples', 'posts/cezanne-basket-of-apples.html'],
  ['/posts/psychology-and-alchemy-jung', 'posts/psychology-and-alchemy-jung.html'],
];
let failed = false;
for (const [path, file] of entries) {
  const response = await fetch(base + path, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
  const bytes = Buffer.from(await response.arrayBuffer());
  const identical = bytes.equals(fs.readFileSync(file));
  console.log(JSON.stringify({ path, status: response.status, bytes: bytes.length, identical }));
  if (response.status !== 200 || !identical) failed = true;
}
for (const a of articles) {
  const path = `/posts/${a.slug}`;
  const response = await fetch(`${base}${path}.html`, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
  const location = response.headers.get('location');
  const valid = response.status === 308 && location !== null && new URL(location, base).href === base + path;
  console.log(JSON.stringify({ path: path + '.html', status: response.status, location, valid }));
  if (!valid) failed = true;
}
if (failed) process.exitCode = 1;
