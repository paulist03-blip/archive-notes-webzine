import fs from 'node:fs';
import crypto from 'node:crypto';
import { articles } from './issue69-content.mjs';
import { articles as previousArticles } from './issue68-content.mjs';

const base = 'https://archive-notes-webzine.vercel.app';
const baseline = JSON.parse(fs.readFileSync('work/issue69-preservation-baseline.json', 'utf8'));
const hash = path => crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
if (!baseline.posts.every(([path, before]) => hash(path) === before)) throw new Error('Existing post changed');
const entries = [
  ['/', 'index.html'], ['/archive', 'archive.html'], ['/book-archive', 'book-archive.html'],
  ['/assets/book-archive-data.js', 'assets/book-archive-data.js'],
  ['/assets/issue69.css', 'assets/issue69.css'],
  ...articles.flatMap(a => [[`/posts/${a.slug}`, `posts/${a.slug}.html`], [`/${a.image}`, a.image]]),
  ...previousArticles.map(a => [`/posts/${a.slug}`, `posts/${a.slug}.html`]),
  ['/posts/picasso-old-guitarist', 'posts/picasso-old-guitarist.html'],
  ['/posts/cezanne-basket-of-apples', 'posts/cezanne-basket-of-apples.html'],
  ['/posts/psychology-and-alchemy-jung', 'posts/psychology-and-alchemy-jung.html'],
];
const results = [];
for (const [path, file] of entries) {
  const response = await fetch(base + path, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
  const bytes = Buffer.from(await response.arrayBuffer());
  const identical = bytes.equals(fs.readFileSync(file));
  const result = { path, status: response.status, bytes: bytes.length, identical };
  results.push(result);
  console.log(JSON.stringify(result));
}
const redirects = [];
for (const a of articles) {
  const path = `/posts/${a.slug}`;
  const response = await fetch(`${base}${path}.html`, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
  const location = response.headers.get('location');
  const valid = response.status === 308 && location !== null && new URL(location, base).href === base + path;
  const result = { path: path + '.html', status: response.status, location, valid };
  redirects.push(result);
  console.log(JSON.stringify(result));
}
const passed = results.every(r => r.status === 200 && r.identical) && redirects.every(r => r.valid);
fs.writeFileSync('work/issue69-public-verification.json', JSON.stringify({ verifiedAt: new Date().toISOString(), base, preservedPosts: baseline.posts.length, results, redirects, passed }, null, 2));
if (!passed) process.exitCode = 1;
