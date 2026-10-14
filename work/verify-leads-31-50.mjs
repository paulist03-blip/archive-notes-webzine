import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { baseline, before, leads, render, renderListing } from './refine-leads-31-50.mjs';
import { revisions } from './lead-prose-revisions-31-50.mjs';

assert.equal(fs.realpathSync('.'), '/Users/paulista/Documents/Codex/2026-06-05/new-chat');
const selected = new Set(leads.map(a => a.file));
const read = file => fs.readFileSync(file, 'utf8');
const body = html => html.match(/<div class="article-body"[^>]*>([\s\S]*?)(?:<section class="(?:article-)?bibliography"|<\/div>)/)[1];
const ps = html => [...body(html).matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(m => m[1]);
let preservedPosts = 0;
const posts = fs.readdirSync('posts').filter(f => f.endsWith('.html'));
assert.equal(posts.length, 894);
for (const file of posts.map(f => 'posts/' + f)) if (!selected.has(file)) {
  assert(fs.readFileSync(file).equals(before(file)), `Outside scope: ${file}`);
  preservedPosts++;
}
for (const file of ['index.html', 'archive.html']) assert.equal(read(file), renderListing(before(file).toString(), file), file);
for (const file of ['book-archive.html', 'assets/book-archive-data.js', 'pettit-neorepublicanism-report.html']) assert(fs.readFileSync(file).equals(before(file)), file);
assert(read('index.html').includes('data-issue="72"'));
const project = JSON.parse(read('.vercel/project.json'));
assert.equal(project.projectId, 'prj_bRt6qseBF9gQcyj7SvwTBDoyK3Wg');
const results = [];
for (const { file, issue } of leads) {
  const current = read(file), original = before(file).toString();
  assert.equal(current, render(original, issue), `Unexpected markup, citation or metadata edit: ${file}`);
  const currentPs = ps(current), oldPs = ps(original);
  assert.equal(currentPs.length, oldPs.length);
  const chars = currentPs.map(p => p.replace(/<[^>]+>/g, '')).join('\n\n').length;
  const oldChars = oldPs.map(p => p.replace(/<[^>]+>/g, '')).join('\n\n').length;
  assert(chars >= oldChars * 0.75, `Excessive shortening: ${issue}`);
  assert(!/아니라|멈추|멈춰|말라는\s*요구|판매가|소장\s*메모/.test(body(current)), `Prose check: ${issue}`);
  const title = current.match(/<title>(.*?)<\/title>/)[1];
  const h1 = current.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)[1].replace(/<[^>]*>/g, '').trim();
  assert(title.includes(h1), `Title mismatch: ${issue}`);
  for (const [, value] of current.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(?:https?:|mailto:|#|data:)/.test(value)) continue;
    const local = path.resolve(path.dirname(file), value.split(/[?#]/)[0]);
    assert(fs.existsSync(local) || fs.existsSync(local + '.html'), `${file}: ${value}`);
  }
  results.push({ issue, file, paragraphs: currentPs.length, characters: chars, revisedParagraphs: Object.keys(revisions[issue]).length });
}
console.log(JSON.stringify({ passed: true, baseline, leads: leads.length, preservedPosts, revisedParagraphs: results.reduce((n, a) => n + a.revisedParagraphs, 0), results }));

if (process.argv.includes('--public')) {
  const base = 'https://archive-notes-webzine.vercel.app';
  const entries = [['/', 'index.html'], ['/archive', 'archive.html'], ['/book-archive', 'book-archive.html'], ['/assets/book-archive-data.js', 'assets/book-archive-data.js'], ...leads.map(a => ['/' + a.file.replace(/\.html$/, ''), a.file]), ['/posts/cezanne-mont-sainte-victoire-met', 'posts/cezanne-mont-sainte-victoire-met.html'], ['/posts/bach-music-castle-heaven-gardiner', 'posts/bach-music-castle-heaven-gardiner.html']];
  for (const [route, file] of entries) {
    const response = await fetch(base + route, { redirect: 'manual', signal: AbortSignal.timeout(45000) });
    const identical = Buffer.from(await response.arrayBuffer()).equals(fs.readFileSync(file));
    assert.equal(response.status, 200, route);
    assert(identical, `Public mismatch: ${route}`);
    console.log(JSON.stringify({ route, status: 200, identical }));
  }
  for (const { file } of leads) {
    const route = '/' + file.replace(/\.html$/, '');
    const response = await fetch(base + route + '.html', { redirect: 'manual', signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 308, file);
    assert.equal(new URL(response.headers.get('location'), base).href, base + route, file);
  }
  const response = await fetch(base + '/api/health', { signal: AbortSignal.timeout(30000) });
  const health = await response.json();
  const head = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
  assert.equal(response.status, 200);
  assert.equal(health.commit, head, JSON.stringify(health));
  console.log(JSON.stringify({ publicPassed: true, routes: entries.length, redirects: leads.length, commit: head }));
}
