import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { revisions } from './lead-prose-revisions.mjs';

const baseline = '34aa9a3173d235fab117552a2bc4e6bdf5db6aa6';
const before = file => execFileSync('git', ['show', `${baseline}:${file}`], { maxBuffer: 16 * 1024 * 1024 });
const home = fs.readFileSync('index.html', 'utf8');
const leads = [...home.matchAll(/<a href="(posts\/[^"]+)"[^>]*><span class="essay-date">Issue (\d+)[\s\S]*?<\/a>/g)]
  .filter(m => +m[2] >= 51 && +m[2] <= 72).map(m => ({ file: m[1], issue: +m[2] }));
assert.equal(leads.length, 22);
const selected = new Set(leads.map(x => x.file));
const paragraphs = html => [...html.slice(html.indexOf('<div class="article-body">')).matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => m[1]);
const skeleton = html => {
  const start = html.indexOf('<div class="article-body">');
  return html.slice(0, start) + html.slice(start).replace(/<p>[\s\S]*?<\/p>/g, '<p>BODY</p>');
};
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const reports = [];
let preservedPosts = 0;
for (const file of fs.readdirSync('posts').filter(f => f.endsWith('.html')).map(f => `posts/${f}`)) {
  if (!selected.has(file)) {
    assert(fs.readFileSync(file).equals(before(file)), `Unrelated post changed: ${file}`);
    preservedPosts++;
  }
}
for (const file of ['index.html', 'archive.html', 'book-archive.html', 'assets/book-archive-data.js']) {
  assert(fs.readFileSync(file).equals(before(file)), `Protected file changed: ${file}`);
}
for (const { file, issue } of leads) {
  const html = fs.readFileSync(file, 'utf8');
  const original = before(file).toString();
  assert.equal(skeleton(html), skeleton(original), `Markup/references changed: ${file}`);
  const current = paragraphs(html), old = paragraphs(original);
  assert.equal(current.length, old.length);
  assert(current.join('').length >= old.join('').length * 0.75, `Excessive shortening: ${issue}`);
  assert(!/멈추|멈춰/.test(current.join('')), `Avoided expression: ${issue}`);
  for (const [i, text] of Object.entries(revisions[issue])) assert.equal(current[+i], escape(text));
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const href = match[1];
    if (/^(?:https?:|mailto:|#|data:)/.test(href)) continue;
    const local = path.resolve(path.dirname(file), href.split(/[?#]/)[0]);
    assert(fs.existsSync(local) || fs.existsSync(local + '.html'), `Broken link: ${file} ${href}`);
  }
  if (issue >= 65) {
    const sourceFile = `work/issue${issue}-content.mjs`;
    const source = fs.readFileSync(sourceFile, 'utf8');
    assert.equal(source.replace(/body: `[\s\S]*?`/, 'body: `BODY`'), before(sourceFile).toString().replace(/body: `[\s\S]*?`/, 'body: `BODY`'));
    const { articles } = await import(`./issue${issue}-content.mjs`);
    assert.equal(current.join('\n\n'), escape(articles[0].body));
  }
  reports.push({ issue, file, paragraphs: current.length, characters: current.join('').length, revisedParagraphs: Object.keys(revisions[issue]).length });
}
const publicResults = [];
if (process.argv.includes('--public')) {
  const routes = [['/', 'index.html'], ['/archive', 'archive.html'], ['/book-archive', 'book-archive.html'], ...leads.map(x => ['/' + x.file.replace(/\.html$/, ''), x.file])];
  for (const [route, file] of routes) {
    const r = await fetch('https://archive-notes-webzine.vercel.app' + route, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
    assert.equal(r.status, 200, route);
    assert(Buffer.from(await r.arrayBuffer()).equals(fs.readFileSync(file)), `Public mismatch: ${route}`);
    publicResults.push({ route, status: r.status, identical: true });
  }
}
const report = { passed: true, checkedAt: new Date().toISOString(), baseline, preservedPosts, reports, publicResults };
console.log(JSON.stringify(report, null, 2));
