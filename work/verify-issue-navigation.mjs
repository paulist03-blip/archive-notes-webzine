import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { collectIssues, stripIssueNavigation, addIssueNavigation, renderNavigation } from './sync-issue-navigation.mjs';

const baseline = '0d1681fef7a65fc451627289b0640288509580ff';
const before = file => execFileSync('git', ['show', `${baseline}:${file}`], { maxBuffer: 16 * 1024 * 1024 });
const read = file => fs.readFileSync(file, 'utf8');
const issues = collectIssues(read('index.html'), read);
assert.equal(issues.length, 72);
assert.deepEqual(issues.map(a => a.number), Array.from({ length: 72 }, (_, i) => i + 1));
const files = new Set(issues.map(a => a.file));
let links = 0;
for (const [index, issue] of issues.entries()) {
  const html = read(issue.file);
  assert.equal(stripIssueNavigation(html), before(issue.file).toString(), `Original content changed: ${issue.file}`);
  assert.equal(addIssueNavigation(html, issues, index), html, `Not idempotent: ${issue.file}`);
  const nav = html.match(/<nav class="issue-pagination"[\s\S]*?<\/nav>/g);
  assert.equal(nav?.length, 1, issue.file);
  assert.equal(nav[0], renderNavigation(issues, index).trim());
  assert.equal((html.match(/href="\.\.\/assets\/issue-navigation\.css"/g) || []).length, 1);
  for (const [direction, neighbor] of [['prev', issues[index - 1]], ['next', issues[index + 1]]]) {
    if (!neighbor) {
      assert(!nav[0].includes(`rel="${direction}"`));
      continue;
    }
    assert(nav[0].includes(`href="${path.posix.basename(neighbor.file)}"`));
    assert(nav[0].includes(`<strong class="issue-pagination-title">${neighbor.title}</strong>`));
    assert(fs.existsSync(neighbor.file));
    links++;
  }
}
assert.equal(links, 142);
let preservedPosts = 0;
for (const file of fs.readdirSync('posts').filter(f => f.endsWith('.html')).map(f => 'posts/' + f)) {
  if (!files.has(file)) {
    assert(fs.readFileSync(file).equals(before(file)), `Non-issue post changed: ${file}`);
    preservedPosts++;
  }
}
for (const file of ['index.html', 'archive.html', 'book-archive.html', 'assets/book-archive-data.js', 'assets/site.css', 'assets/language-toggle.js']) {
  assert(fs.readFileSync(file).equals(before(file)), `Protected file changed: ${file}`);
}
assert(read('index.html').includes('data-issue="72"'));
assert(read('work/build-issue72.mjs').includes('syncIssueNavigation();'));
// A new issue updates the former last issue and retains the boundary behavior.
const future = [...issues, { number: 73, file: 'posts/future-issue.html', title: '다음 이슈의 제목' }];
assert(renderNavigation(future, 71).includes('href="future-issue.html"'));
assert(!renderNavigation(future, 72).includes('rel="next"'));
assert.throws(() => collectIssues('<a href="posts/test.html"><span class="essay-date">Issue 1</span></a><a href="posts/test.html"><span class="essay-date">Issue 1</span></a>', () => '<h1>Test</h1>'), /Duplicate/);
console.log(JSON.stringify({ localPassed: true, issues: issues.length, neighborLinks: links, preservedPosts, allIssueBodiesUnchanged: true, firstIssueHasOnlyNext: true, latestIssueHasOnlyPrevious: true }));

if (process.argv.includes('--public')) {
  const base = 'https://archive-notes-webzine.vercel.app';
  const routes = [['/', 'index.html'], ['/archive', 'archive.html'], ['/book-archive', 'book-archive.html'], ['/assets/issue-navigation.css', 'assets/issue-navigation.css'], ...issues.map(a => ['/' + a.file.replace(/\.html$/, ''), a.file])];
  let checked = 0;
  for (const [route, file] of routes) {
    const response = await fetch(base + route, { redirect: 'manual', signal: AbortSignal.timeout(45000) });
    assert.equal(response.status, 200, route);
    assert(Buffer.from(await response.arrayBuffer()).equals(fs.readFileSync(file)), `Public mismatch: ${route}`);
    checked++;
    if (checked % 12 === 0) console.log(JSON.stringify({ publicRoutesChecked: checked, lastRoute: route }));
  }
  for (const issue of issues) {
    const route = '/' + issue.file.replace(/\.html$/, '');
    const response = await fetch(base + route + '.html', { redirect: 'manual', signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 308, route);
    assert.equal(new URL(response.headers.get('location'), base).href, base + route, route);
  }
  const health = await fetch(base + '/api/health', { signal: AbortSignal.timeout(30000) });
  const state = await health.json();
  const head = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
  assert.equal(health.status, 200);
  assert.equal(state.commit, head);
  console.log(JSON.stringify({ publicPassed: true, routes: checked, cleanRedirects: issues.length, commit: head }));
}
