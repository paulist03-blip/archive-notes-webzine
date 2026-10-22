import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { articles } from './issue74-content.mjs';
import { articles as previousArticles } from './issue73-content.mjs';
import { stripIssueNavigation } from './sync-issue-navigation.mjs';
import { collectIssues, addIssueNavigation } from './sync-issue-navigation.mjs';

const root = '/Users/paulista/Documents/Codex/2026-06-05/new-chat';
if (fs.realpathSync('.') !== root) throw new Error('Wrong verification root');
const baseline = JSON.parse(fs.readFileSync('work/issue74-preservation-baseline.json', 'utf8'));
const hash = file => crypto.createHash('sha256').update(stripIssueNavigation(fs.readFileSync(file, 'utf8'))).digest('hex');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
if (!baseline.posts.every(([file, before]) => hash(file) === before)) throw new Error('Existing post changed');
const home = fs.readFileSync('index.html', 'utf8');
if (!home.includes('data-issue="74"') || !baseline.historyLinks.every(href => home.includes(`href="${href}"`))) throw new Error('Home or history mismatch');
const read = file => fs.readFileSync(file, 'utf8');
const issues = collectIssues(home, read);
if (issues.length !== 74 || issues.some((a, i) => a.number !== i + 1)) throw new Error('Issue sequence mismatch');
for (const [index, a] of issues.entries()) {
  if (addIssueNavigation(read(a.file), issues, index) !== read(a.file)) throw new Error(`Invalid neighboring issue navigation: ${a.file}`);
}
const publicPages = [...fs.readdirSync('.').filter(f => f.endsWith('.html')), ...fs.readdirSync('posts').filter(f => f.endsWith('.html')).map(f => 'posts/' + f)];
if (publicPages.length !== 915) throw new Error('Public page count mismatch');
for (const file of publicPages) {
  const html = read(file);
  if ((html.match(/<script\b[^>]*src="[^"]*language-toggle\.js"[^>]*>/g) || []).length !== 1) throw new Error(`Missing language switch: ${file}`);
  for (const link of ['https://paul-reading-room.politeelm64.chatgpt.site/#books', 'https://haru-art-journal.politeelm64.chatgpt.site']) {
    if (!html.includes(`href="${link}"`)) throw new Error(`Footer shortcut missing: ${file}`);
  }
}
const slugs = new Set(articles.map(a => a.slug));
const rows = fs.readFileSync('archive.html', 'utf8').match(/<a class="archive-row"[\s\S]*?<\/a>/g);
const oldRows = rows.filter(row => ![...slugs].some(slug => row.includes(`href="posts/${slug}.html"`)));
if (oldRows.length !== baseline.archiveRows || digest(oldRows) !== baseline.archiveRowsHash) throw new Error('Archive rows changed');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync('assets/book-archive-data.js', 'utf8'), context);
const data = context.window.PAUL_BOOK_ARCHIVE;
if (digest(data.books.slice(0, baseline.books)) !== baseline.bookRecordsHash || digest(data.dailyPicks.slice(3)) !== baseline.dailyPicksHash) throw new Error('Old book records changed');
const files = ['index.html', 'archive.html', 'book-archive.html', ...articles.map(a => `posts/${a.slug}.html`)];
for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const value = match[1];
    if (/^(?:https?:|mailto:|#)/.test(value)) continue;
    const clean = value.split(/[?#]/)[0];
    if (clean && !fs.existsSync(path.resolve(path.dirname(file), clean))) throw new Error(`Missing internal target ${file}: ${value}`);
  }
}
for (const a of articles) {
  const html = fs.readFileSync(`posts/${a.slug}.html`, 'utf8');
  if (!html.includes(`<title>${a.title} - Paul Archive Notes</title>`) || !html.includes(a.description)) throw new Error(`Metadata mismatch ${a.slug}`);
  const body = html.match(/<div class="article-body">([\s\S]*?)<section class="bibliography"/)[1];
  const paragraphs = [...body.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => m[1].replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"'));
  if (paragraphs.join('\n\n') !== a.body || a.body.length < 3000 || a.body.length > 5500) throw new Error(`Body mismatch ${a.slug}`);
  if (/멈(?:춘다|추게|춰\s*선다)|판매가|소장\s*메모|중고\s*등급|재고(?:량|상태|\s*[:：])/.test(a.body)) throw new Error(`Prohibited wording ${a.slug}`);
}
console.log(JSON.stringify({ localPassed: true, preservedPosts: baseline.posts.length, totalPosts: fs.readdirSync('posts').filter(f => f.endsWith('.html')).length, preservedArchiveRows: oldRows.length, preservedBookRecords: baseline.books, newArticles: articles.length, reviewLinkedCount: data.source.reviewLinkedCount }));
if (!process.argv.includes('--public')) process.exit(0);

const base = 'https://archive-notes-webzine.vercel.app';
const entries = [
  ['/', 'index.html'], ['/archive', 'archive.html'], ['/book-archive', 'book-archive.html'],
  ['/assets/book-archive-data.js', 'assets/book-archive-data.js'], ['/assets/issue74.css', 'assets/issue74.css'],
  ...articles.flatMap(a => [[`/posts/${a.slug}`, `posts/${a.slug}.html`], [`/${a.image}`, a.image]]),
  ...previousArticles.map(a => [`/posts/${a.slug}`, `posts/${a.slug}.html`]),
  ...['monet-bordighera', 'seurat-forest-pontaubert', 'turner-fighting-temeraire', 'picasso-old-guitarist', 'seurat-gravelines-evening', 'cezanne-basket-of-apples', 'cezanne-card-players', 'psychology-and-alchemy-jung'].map(slug => [`/posts/${slug}`, `posts/${slug}.html`])
];
const results = [];
for (const [route, file] of entries) {
  const response = await fetch(base + route, { redirect: 'manual', signal: AbortSignal.timeout(45000) });
  const bytes = Buffer.from(await response.arrayBuffer());
  const result = { route, status: response.status, bytes: bytes.length, identical: bytes.equals(fs.readFileSync(file)) };
  results.push(result);
  console.log(JSON.stringify(result));
}
const redirects = [];
for (const a of articles) {
  const route = `/posts/${a.slug}`;
  const response = await fetch(`${base}${route}.html`, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
  const location = response.headers.get('location');
  const valid = response.status === 308 && location !== null && new URL(location, base).href === base + route;
  const result = { route: route + '.html', status: response.status, location, valid };
  redirects.push(result);
  console.log(JSON.stringify(result));
}
const passed = results.every(r => r.status === 200 && r.identical) && redirects.every(r => r.valid);
fs.writeFileSync('work/issue74-public-verification.json', JSON.stringify({ verifiedAt: new Date().toISOString(), base, preservedPosts: baseline.posts.length, results, redirects, passed }, null, 2));
if (!passed) process.exitCode = 1;
