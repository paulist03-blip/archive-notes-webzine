import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { articles as issue68 } from './issue68-content.mjs';
import { articles as issue69 } from './issue69-content.mjs';
import { articles as issue70 } from './issue70-content.mjs';

const revision = 'd199d8cf5add38e84ced56ba194c353915c6a7bf';
const leads = [issue68[0], issue69[0]];
const changedPosts = new Set(leads.map(a => `posts/${a.slug}.html`));
const baseline = JSON.parse(fs.readFileSync('work/issue68-69-leads-baseline.json', 'utf8'));
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const ensure = (ok, message) => { if (!ok) throw new Error(message); };
const oldDescriptions = [
  '큰 배를 움직이는 것은 앞에 선 작은 예인선이다. 터너가 강 위에 남겨 놓은 저녁빛과, 그 빛을 떠나지 못하는 눈에 대하여.',
  '잎을 하나씩 세기 전에 초록에 눈이 익는다. 스물한 살 무렵의 쇠라가 그린 숲에서, 나무 사이를 오가는 빛을 오래 바라본다.',
];
ensure(baseline.posts.length === 884, 'Unexpected baseline post count');
let preserved = 0;
for (const [p, before] of baseline.posts) {
  ensure(fs.existsSync(p), `Removed post: ${p}`);
  if (!changedPosts.has(p)) {
    ensure(hash(p) === before, `Unrelated post changed: ${p}`);
    preserved++;
  }
}
ensure(fs.readdirSync('posts').filter(p => p.endsWith('.html')).length === 884, 'Post count changed');
for (const [p, before] of baseline.protected) ensure(hash(p) === before, `Protected file changed: ${p}`);
for (const p of ['index.html', 'archive.html']) {
  let current = fs.readFileSync(p, 'utf8');
  leads.forEach((a, i) => { current = current.replaceAll(a.description, oldDescriptions[i]); });
  const old = execFileSync('git', ['show', `${revision}:${p}`], { encoding: 'utf8' });
  ensure(current === old, `Unrelated home/archive change: ${p}`);
}
const reports = [];
for (const a of leads) {
  const file = `posts/${a.slug}.html`;
  const html = fs.readFileSync(file, 'utf8');
  const section = html.split('<div class="article-body">')[1].split('<section class="bibliography"')[0];
  const paragraphs = Array.from(section.matchAll(/<p>([\s\S]*?)<\/p>/g), m => m[1]);
  ensure(paragraphs.join('\n\n') === a.body, `Body/source mismatch: ${file}`);
  ensure(paragraphs.length >= 10 && paragraphs.length <= 15, `Paragraph count: ${file}`);
  ensure(a.body.length >= 3500 && a.body.length <= 5500, `Length: ${file}`);
  ensure(!/멈추|멈춰|판매가|소장\s*메모|재고|중고\s*등급/.test(a.body), `Forbidden wording: ${file}`);
  ensure(html.includes(`<title>${a.title} - Paul Archive Notes</title>`), `Title: ${file}`);
  ensure(html.includes(`content="${a.description}"`), `Description: ${file}`);
  ensure(html.includes(`href="https://archive-notes-webzine.vercel.app/posts/${a.slug}"`), `Canonical: ${file}`);
  for (const href of Array.from(html.matchAll(/(?:href|src)="([^"]+)"/g), m => m[1])) {
    if (/^(?:https?:|mailto:|#)/.test(href)) continue;
    const local = path.resolve(path.dirname(file), href.split(/[?#]/)[0]);
    ensure(fs.existsSync(local) || fs.existsSync(local + '.html'), `Broken internal link: ${file} ${href}`);
  }
  for (const [url] of a.sources) ensure(html.includes(url.replaceAll('&', '&amp;')), `Source link missing: ${url}`);
  reports.push({ slug: a.slug, characters: a.body.length, paragraphs: paragraphs.length, sourceCount: a.sources.length });
}
console.log(JSON.stringify({ local: true, preservedPosts: preserved, reports }));

if (process.argv.includes('--public')) {
  const base = 'https://archive-notes-webzine.vercel.app';
  const entries = [
    ['/', 'index.html'], ['/archive', 'archive.html'], ['/book-archive', 'book-archive.html'],
    ['/assets/book-archive-data.js', 'assets/book-archive-data.js'],
    ...[...issue68, ...issue69, ...issue70].map(a => [`/posts/${a.slug}`, `posts/${a.slug}.html`]),
    ...leads.map(a => [`/${a.image}`, a.image]),
    ['/posts/psychology-and-alchemy-jung', 'posts/psychology-and-alchemy-jung.html'],
  ];
  const results = [];
  for (const [route, file] of entries) {
    const response = await fetch(base + route, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    const identical = bytes.equals(fs.readFileSync(file));
    const result = { route, status: response.status, identical };
    results.push(result);
    console.log(JSON.stringify(result));
    ensure(response.status === 200 && identical, `Public mismatch: ${route}`);
  }
  const redirects = [];
  for (const a of leads) {
    const clean = `/posts/${a.slug}`;
    const response = await fetch(`${base}${clean}.html`, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
    const location = response.headers.get('location');
    const valid = response.status === 308 && location && new URL(location, base).href === base + clean;
    redirects.push({ route: clean + '.html', status: response.status, location, valid });
    ensure(valid, `Redirect mismatch: ${clean}`);
  }
  const health = await fetch(base + '/api/health', { signal: AbortSignal.timeout(30000) }).then(r => r.json());
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  ensure(health.commit === head && health.environment === 'production', 'Deployed revision mismatch');
  fs.writeFileSync('work/issue68-69-leads-public-verification.json', JSON.stringify({ verifiedAt: new Date().toISOString(), head, preservedPosts: preserved, results, redirects, health, passed: true }, null, 2));
  console.log(JSON.stringify({ public: true, head, passed: true }));
}
