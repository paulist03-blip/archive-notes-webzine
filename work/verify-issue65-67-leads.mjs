import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { articles as issue65 } from './issue65-content.mjs';
import { articles as issue66 } from './issue66-content.mjs';
import { articles as issue67 } from './issue67-content.mjs';
import { articles as issue68 } from './issue68-content.mjs';
import { articles as issue69 } from './issue69-content.mjs';
import { articles as issue70 } from './issue70-content.mjs';

const baseline = JSON.parse(fs.readFileSync('work/issue65-67-leads-baseline.json', 'utf8'));
const leads = [issue65[0], issue66[0], issue67[0]];
const changedPosts = new Set(leads.map(a => `posts/${a.slug}.html`));
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const ensure = (ok, message) => { if (!ok) throw new Error(message); };
const escape = s => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const oldDescriptions = [
  '어긋난 탁자와 기울어진 바구니, 흰 천의 주름을 따라 사물이 제 무게를 얻는 세잔의 시간을 바라봅니다.',
  '쇠라의 수로에서는 저녁이 한꺼번에 내려앉지 않는다. 닻과 돛, 둑과 수면 사이에서 빛이 오래 자리를 고른다.',
  '몸과 벽이 푸른빛에 잠겨 있는 동안 기타에는 나무의 빛깔이 남아 있다. 노인의 두 손에서부터 이 그림을 바라본다.',
];
const mobileFigures = [
  '    <figure class="article-mobile-artwork"><img src="../assets/artworks/cezanne-basket-of-apples.jpg" alt="폴 세잔, 《사과 바구니》" /><figcaption>1893년경 · 시카고 미술관. Wikimedia Commons 공개 도메인 도판.</figcaption></figure>\n',
  '    <figure class="article-mobile-artwork"><img src="../assets/artworks/seurat-gravelines-evening.jpg" alt="조르주 쇠라 · 그라블린의 수로, 저녁" /><figcaption>1890년 여름 · 뉴욕 현대미술관(MoMA). 작품·도판 출처: MoMA.</figcaption></figure>\n',
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
  const old = execFileSync('git', ['show', `${baseline.revision}:${p}`], { encoding: 'utf8' });
  ensure(current === old, `Unrelated home/archive change: ${p}`);
}
const reports = [];
for (const a of leads) {
  const file = `posts/${a.slug}.html`;
  const html = fs.readFileSync(file, 'utf8');
  const section = html.split('<div class="article-body">')[1].split('<section class="bibliography"')[0];
  const paragraphs = Array.from(section.matchAll(/<p>([\s\S]*?)<\/p>/g), m => m[1]);
  ensure(paragraphs.join('\n\n') === escape(a.body), `Body/source mismatch: ${file}`);
  ensure(paragraphs.length >= 10 && paragraphs.length <= 15, `Paragraph count: ${file}`);
  ensure(a.body.length >= 3500 && a.body.length <= 5500, `Length: ${file}`);
  ensure(!/멈추|멈춰|판매가|소장\s*메모|재고|중고\s*등급/.test(a.body), `Forbidden wording: ${file}`);
  ensure(html.includes(`<title>${escape(a.title)} - Paul Archive Notes</title>`), `Title: ${file}`);
  ensure(html.includes(`content="${escape(a.description)}"`), `Description: ${file}`);
  ensure(html.includes(`href="https://archive-notes-webzine.vercel.app/posts/${a.slug}"`), `Canonical: ${file}`);
  for (const href of Array.from(html.matchAll(/(?:href|src)="([^"]+)"/g), m => m[1])) {
    if (/^(?:https?:|mailto:|#)/.test(href)) continue;
    const local = path.resolve(path.dirname(file), href.split(/[?#]/)[0]);
    ensure(fs.existsSync(local) || fs.existsSync(local + '.html'), `Broken internal link: ${file} ${href}`);
  }
  for (const [url] of a.sources) ensure(html.includes(escape(url)), `Source link missing: ${url}`);
  const peers = [issue65, issue66, issue67][leads.indexOf(a)].slice(1);
  for (const peer of peers) {
    ensure(html.includes(`href="${peer.slug}.html"`), `Companion link missing: ${peer.slug}`);
    ensure(a.body.includes(peer.name.split(',')[0].replace('안드라스 시프', '시프')) || a.body.includes(peer.type === 'Book' ? peer.name : ['시프', '불레즈', '헹크'][leads.indexOf(a)]), `Companion absent from essay: ${peer.slug}`);
  }
  const before = execFileSync('git', ['show', `${baseline.revision}:${file}`], { encoding: 'utf8' });
  const start = '<div class="article-body">';
  const end = `<h2>Issue ${65 + leads.indexOf(a)}의 다른 글</h2>`;
  const unchanged = s => {
    const i = leads.indexOf(a);
    if (i < 2) s = s.replace(mobileFigures[i], '').replace('article-layout article-layout--lead-artwork', 'article-layout');
    return s.slice(0, s.indexOf(start)).replace(a.description, oldDescriptions[i]) + s.slice(s.indexOf(end));
  };
  ensure(unchanged(html) === unchanged(before), `Unrelated article markup changed: ${file}`);
  reports.push({ slug: a.slug, characters: a.body.length, paragraphs: paragraphs.length, sourceCount: a.sources.length });
}
console.log(JSON.stringify({ local: true, preservedPosts: preserved, reports }));

if (process.argv.includes('--public')) {
  const base = 'https://archive-notes-webzine.vercel.app';
  const entries = [
    ['/', 'index.html'], ['/archive', 'archive.html'], ['/book-archive', 'book-archive.html'],
    ['/assets/book-archive-data.js', 'assets/book-archive-data.js'],
    ...[...issue65, ...issue66, ...issue67, ...issue68, ...issue69, ...issue70].map(a => [`/posts/${a.slug}`, `posts/${a.slug}.html`]),
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
  fs.writeFileSync('work/issue65-67-leads-public-verification.json', JSON.stringify({ verifiedAt: new Date().toISOString(), head, preservedPosts: preserved, results, redirects, health, passed: true }, null, 2));
  console.log(JSON.stringify({ public: true, head, passed: true }));
}
