import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const baseline = 'e2112f7ba97d98edfc25b93ff8d2f8b017f14643';
const before = file => execFileSync('git', ['show', `${baseline}:${file}`], { maxBuffer: 16 * 1024 * 1024 });
const files = [...fs.readdirSync('.').filter(f => f.endsWith('.html')),
  ...fs.readdirSync('posts').filter(f => f.endsWith('.html')).map(f => 'posts/' + f)];
assert.equal(files.length, 905);
assert.equal(files.filter(f => f.startsWith('posts/')).length, 894);
let added = 0;
for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const original = before(file).toString();
  const src = `${file.startsWith('posts/') ? '../' : ''}assets/language-toggle.js`;
  assert.equal((html.match(/<script\b[^>]*src="[^"]*language-toggle\.js"[^>]*>/g) || []).length, 1, file);
  assert(html.includes(`src="${src}"`), file);
  if (original.includes('language-toggle.js')) assert.equal(html, original, file);
  else {
    assert.equal(html.replace(`  <script src="${src}"></script>\n`, ''), original, file);
    added++;
  }
}
assert.equal(added, 27);
for (const file of ['assets/site.css', 'assets/issue-navigation.css', 'assets/book-archive-data.js']) {
  assert(fs.readFileSync(file).equals(before(file)), `Protected asset changed: ${file}`);
}
assert.equal(fs.realpathSync('.'), '/Users/paulista/Documents/Codex/2026-06-05/new-chat');
assert.deepEqual(JSON.parse(fs.readFileSync('.vercel/project.json', 'utf8')), {
  projectId: 'prj_bRt6qseBF9gQcyj7SvwTBDoyK3Wg', orgId: 'team_DYA5a499B4NAp6TpyMTthaSM'
});
const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
assert.equal(config.functions['api/translate.js'].maxDuration, 60);
const originalConfig = JSON.parse(before('vercel.json').toString());
delete config.functions;
assert.deepEqual(config, originalConfig, 'Routing changed');
const runtime = fs.readFileSync('assets/language-toggle.js', 'utf8');
for (const token of ['MutationObserver', 'IntersectionObserver', 'AbortController', 'safeStorage', 'role="status"', 'data-language-retry', 'translatedText', 'record.english']) {
  assert(runtime.includes(token), token);
}
assert(!runtime.includes('OPENAI_API_KEY'));
assert(!runtime.includes('text.slice(0, 2200)'));
console.log(JSON.stringify({ localPassed: true, pages: files.length, scriptCoverage: '905/905', added: 27,
  allOriginalHTMLContentPreserved: true, archiveAndBooksPreserved: true, routesUnchanged: true }));

if (process.argv.includes('--public')) {
  const base = 'https://archive-notes-webzine.vercel.app';
  const routes = [
    ['/', 'index.html'], ['/archive', 'archive.html'], ['/book-archive', 'book-archive.html'],
    ['/book-review-board', 'book-review-board.html'], ['/forum', 'forum.html'], ['/daily-ai-work', 'daily-ai-work.html'],
    ['/mobile', 'ai-work-mobile.html'], ['/apple-tv-review', 'apple-tv-review.html'],
    ['/animal-liberation-medical-lab', 'animal-liberation-medical-lab.html'],
    ['/posts/cezanne-mont-sainte-victoire-met', 'posts/cezanne-mont-sainte-victoire-met.html'],
    ['/posts/how-to-buy-valuable-books', 'posts/how-to-buy-valuable-books.html'],
    ['/posts/bach-music-castle-heaven-gardiner', 'posts/bach-music-castle-heaven-gardiner.html'],
    ['/posts/ai-work-2026-09-05', 'posts/ai-work-2026-09-05.html'],
    ['/assets/language-toggle.js', 'assets/language-toggle.js'], ['/assets/book-archive.js', 'assets/book-archive.js']
  ];
  for (const file of files.filter(file => !before(file).toString().includes('language-toggle.js'))) {
    const route = file === 'mobile.html' ? '/mobile' : '/' + file.replace(/\.html$/, '');
    if (!routes.some(pair => pair[0] === route)) routes.push([route, file]);
  }
  for (const [route, file] of routes) {
    const response = await fetch(base + route, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200, route);
    assert(Buffer.from(await response.arrayBuffer()).equals(fs.readFileSync(file)), route);
  }
  const api = await fetch(base + '/api/translate', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ source: 'ko', target: 'en', path: '/', title: 'Paul Archive Notes', items: [{ id: 'live-probe', text: '이전 호와 다음 호' }] }),
    signal: AbortSignal.timeout(55000)
  });
  const state = await api.json();
  let translationReady = false;
  if (api.status === 200) {
    assert.equal(state.translations[0].id, 'live-probe');
    assert(!/[가-힣]/.test(state.translations[0].text));
    translationReady = true;
  } else {
    assert.equal(api.status, 503);
    assert.equal(state.code, 'not_configured');
  }
  const health = await fetch(base + '/api/health');
  assert.equal(health.status, 200);
  const head = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
  assert.equal((await health.json()).commit, head);
  console.log(JSON.stringify({ publicPassed: true, routes: routes.length, commit: head,
    actualTranslationReady: translationReady, requiresAPIKey: !translationReady }));
}
