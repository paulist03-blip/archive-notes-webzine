import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { revisions } from './contribution-prose-revisions.mjs';
import { baseline, renderRevision, escape } from './refine-contribution-prose.mjs';
import { review } from './gardiner-bach-review.mjs';

const read = file => fs.readFileSync(file, 'utf8');
const original = file => execFileSync('git', ['show', `${baseline}:${file}`], { maxBuffer: 16 * 1024 * 1024 });
const bach = `posts/${review.slug}.html`;
const targets = [...revisions.map(r => r.file), bach];
assert.equal(new Set(targets).size, 15);
const html = read(bach);
const body = html.match(/<div class="article-body">([\s\S]*?)<section class="bibliography"/)[1];
const ps = [...body.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => m[1]);
assert.equal(ps.join('\n\n'), escape(review.body));
assert.equal(ps.length, 15);
assert(review.body.length >= 3500 && review.body.length <= 5500);
assert(html.includes('17세기 문화사와 루터의 교육론'));
assert(html.includes('2025년의 스타우프 연구는 가디너가 집필에 사용한 자료로 제시하지 않는다'));
assert(html.includes(`name="description" content="${review.description}"`));
assert(html.includes(`<title>${review.title} - Paul Archive Notes</title>`));
assert(html.includes(`href="https://archive-notes-webzine.vercel.app/posts/${review.slug}"`));

for (const r of revisions) {
  assert.equal(read(r.file), renderRevision(original(r.file).toString(), r), `Unexpected edit ${r.file}`);
  assert(!/아니라|말라는\s*요구|멈추|멈춰|판매가|소장\s*메모/.test(r.body.join('\n')), r.file);
}
let preservedPosts = 0;
const posts = fs.readdirSync('posts').filter(f => f.endsWith('.html')).map(f => `posts/${f}`);
assert.equal(posts.length, 894);
for (const file of posts) if (!targets.includes(file)) {
  assert(fs.readFileSync(file).equals(original(file)), `Changed outside scope: ${file}`);
  preservedPosts++;
}
for (const file of ['book-archive.html', review.image]) {
  assert(fs.readFileSync(file).equals(original(file)), file);
}
assert.equal(fs.realpathSync('.'), '/Users/paulista/Documents/Codex/2026-06-05/new-chat');
const project = JSON.parse(read('.vercel/project.json'));
assert.equal(project.projectId, 'prj_bRt6qseBF9gQcyj7SvwTBDoyK3Wg');
assert.equal(project.orgId, 'team_DYA5a499B4NAp6TpyMTthaSM');
const bachCard = new RegExp(String.raw`\n        <a class="feature-card" href="${bach}">[\s\S]*?</a>`);
const home = read('index.html');
assert.equal(home.replace(bachCard, ''), original('index.html').toString(), 'Main issue or earlier features changed');
assert(home.includes('data-issue="72"'));
assert.equal((home.match(new RegExp(`href="${bach}"`, 'g')) || []).length, 1);

const rows = text => [...text.matchAll(/<a class="archive-row"[\s\S]*?<\/a>/g)].map(m => m[0]);
const newRows = rows(read('archive.html'));
const oldRows = rows(original('archive.html').toString());
const withoutBach = list => list.filter(row => !row.includes(`href="${bach}"`));
assert.deepEqual(withoutBach(newRows), withoutBach(oldRows), 'Other archive records changed');
assert.equal(newRows.length, oldRows.length + 1);
const contribution = read('archive.html').split('id="contribution-archive"')[1].split('</section>')[0];
for (const file of targets) assert(contribution.includes(`href="${file}"`), `Missing contribution ${file}`);
assert.equal((contribution.match(new RegExp(`href="${bach}"`, 'g')) || []).length, 1);

const data = text => { const c = { window: {} }; vm.runInNewContext(text, c); return JSON.parse(JSON.stringify(c.window.PAUL_BOOK_ARCHIVE)); };
const current = data(read('assets/book-archive-data.js'));
const previous = data(original('assets/book-archive-data.js').toString());
assert.equal(current.books.length, 2207);
assert.deepEqual(current.dailyPicks, previous.dailyPicks.filter(b => b.reviewUrl !== bach));
assert.deepEqual(current.source, previous.source);
for (let i = 0; i < current.books.length; i++) {
  const book = current.books[i];
  if (book.id === '366094147') {
    assert.equal(book.reviewUrl, bach);
    assert.equal(book.reviewTitle, review.title);
    assert.equal(book.reviewSummary, review.description);
    assert.deepEqual({ ...book, reviewTitle: previous.books[i].reviewTitle, reviewSummary: previous.books[i].reviewSummary }, previous.books[i]);
  } else assert.deepEqual(book, previous.books[i]);
}
for (const file of ['index.html', 'archive.html', 'book-archive.html', ...targets]) {
  for (const [, value] of read(file).matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(?:https?:|mailto:|#)/.test(value)) continue;
    const target = value.split(/[?#]/)[0];
    if (target) assert(fs.existsSync(path.resolve(path.dirname(file), target)), `${file}: ${value}`);
  }
}
console.log(JSON.stringify({ localPassed: true, revisedEssays: targets.length, rewrittenParagraphs: revisions.reduce((n, r) => n + r.body.length, ps.length), preservedPosts, books: current.books.length, linkedReviews: current.source.reviewLinkedCount }));

if (process.argv.includes('--public')) {
  const base = 'https://archive-notes-webzine.vercel.app';
  const entries = [['/', 'index.html'], ['/archive', 'archive.html'], ['/book-archive', 'book-archive.html'], ['/assets/book-archive-data.js', 'assets/book-archive-data.js'], [`/${review.image}`, review.image], ...targets.map(file => ['/' + file.replace(/\.html$/, ''), file])];
  const results = [];
  for (const [route, file] of entries) {
    const response = await fetch(base + route, { redirect: 'manual', signal: AbortSignal.timeout(45000) });
    const identical = Buffer.from(await response.arrayBuffer()).equals(fs.readFileSync(file));
    const result = { route, status: response.status, identical };
    results.push(result);
    console.log(JSON.stringify(result));
    assert.equal(response.status, 200, route);
    assert(identical, `Public bytes differ: ${route}`);
  }
  for (const file of targets) {
    const route = '/' + file.replace(/\.html$/, '');
    const response = await fetch(base + route + '.html', { redirect: 'manual', signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 308, file);
    assert.equal(new URL(response.headers.get('location'), base).href, base + route, file);
  }
  const health = await fetch(base + '/api/health', { signal: AbortSignal.timeout(30000) });
  const state = await health.json();
  const head = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
  assert.equal(health.status, 200);
  assert.equal(state.commit, head, JSON.stringify(state));
  console.log(JSON.stringify({ publicPassed: true, routes: results.length, redirects: targets.length, commit: head, health: state }));
}
