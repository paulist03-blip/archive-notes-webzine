import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { review } from './gardiner-bach-review.mjs';

const baseline = '368a6ed425cf1ad7d2b125a5ff07f44e3aa781ff';
const original = f => execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 16 * 1024 * 1024 });
const post = `posts/${review.slug}.html`;
const escape = s => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const html = fs.readFileSync(post, 'utf8');
const body = html.split('<div class="article-body">')[1].split('<section class="bibliography"')[0];
const paragraphs = [...body.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => m[1]);
assert.equal(paragraphs.join('\n\n'), escape(review.body));
assert.equal(paragraphs.length, 14);
assert(review.body.length >= 3500 && review.body.length <= 5500);
assert(!/멈추|멈춰|판매가|재고|소장\s*메모/.test(review.body));
assert(html.includes(`<title>${escape(review.title)} - Paul Archive Notes</title>`));
assert(html.includes(`name="description" content="${escape(review.description)}"`));
assert(html.includes(`href="https://archive-notes-webzine.vercel.app/posts/${review.slug}"`));
for (const [, href] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  if (/^(?:https?:|mailto:|#)/.test(href)) continue;
  assert(fs.existsSync(path.resolve(path.dirname(post), href.split(/[?#]/)[0])), `Broken link ${href}`);
}
let preservedPosts = 0;
const posts = fs.readdirSync('posts').filter(f => f.endsWith('.html')).map(f => `posts/${f}`);
assert.equal(posts.length, 894);
for (const f of posts) if (f !== post) { assert(fs.readFileSync(f).equals(original(f)), f); preservedPosts++; }
for (const f of ['index.html', 'book-archive.html']) assert(fs.readFileSync(f).equals(original(f)), f);
const readData = text => { const c = { window: {} }; vm.runInNewContext(text, c); return JSON.parse(JSON.stringify(c.window.PAUL_BOOK_ARCHIVE)); };
const current = readData(fs.readFileSync('assets/book-archive-data.js', 'utf8'));
const previous = readData(original('assets/book-archive-data.js').toString());
assert.equal(current.books.length, previous.books.length);
assert.deepEqual(current.dailyPicks.slice(1), previous.dailyPicks);
assert.equal(current.dailyPicks[0].reviewUrl, post);
for (let i = 0; i < current.books.length; i++) {
  const book = current.books[i];
  if (book.id === '366094147') {
    assert.equal(book.reviewUrl, post);
    assert.equal(book.imageUrl, review.image);
    const stripped = { ...book };
    delete stripped.reviewUrl; delete stripped.reviewTitle; delete stripped.reviewSummary;
    stripped.imageUrl = previous.books[i].imageUrl;
    assert.deepEqual(stripped, previous.books[i]);
  } else assert.deepEqual(book, previous.books[i]);
}
assert.equal(current.source.reviewLinkedCount, 442);
assert.deepEqual({ ...current.source, reviewLinkedCount: previous.source.reviewLinkedCount }, previous.source);
const removeRow = s => s.replace(new RegExp(`<a class="archive-row" href="posts/${review.slug}\\.html">[\\s\\S]*?<\\/a>`), 'REVISED_ROW');
assert.equal(removeRow(fs.readFileSync('archive.html', 'utf8')), removeRow(original('archive.html').toString()));
const routes = [['/', 'index.html'], ['/archive', 'archive.html'], ['/book-archive', 'book-archive.html'], [`/posts/${review.slug}`, post], [`/${review.image}`, review.image], ['/assets/book-archive-data.js', 'assets/book-archive-data.js']];
const publicResults = [];
if (process.argv.includes('--public')) for (const [route, file] of routes) {
  const r = await fetch('https://archive-notes-webzine.vercel.app' + route, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
  assert.equal(r.status, 200, route);
  assert(Buffer.from(await r.arrayBuffer()).equals(fs.readFileSync(file)), `Public content mismatch ${route}`);
  publicResults.push({ route, status: r.status, identical: true });
}
console.log(JSON.stringify({ passed: true, characters: review.body.length, paragraphs: paragraphs.length, preservedPosts, books: current.books.length, linkedReviews: current.source.reviewLinkedCount, publicResults }, null, 2));
