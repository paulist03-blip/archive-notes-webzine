import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { issue, articles } from './issue70-content.mjs';

const root = '/Users/paulista/Documents/Codex/2026-06-05/new-chat';
if (fs.realpathSync('.') !== root) throw new Error('Wrong publication root');
for (const file of ['index.html', 'archive.html', 'book-archive.html', '.vercel/project.json']) {
  if (!fs.existsSync(file)) throw new Error(`Missing publication source: ${file}`);
}
const e = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const read = p => fs.readFileSync(p, 'utf8');
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const [art] = articles;
const books = articles.filter(a => a.type === 'Book');
const record = articles.find(a => a.type === 'Record');
const ordered = [art, record, ...books];
const url = a => `posts/${a.slug}.html`;
const trigger = a => a.type === 'Book' ? '' : ' data-issue-player-trigger';
const label = `Issue ${issue.number}`;
const baseline = fs.readdirSync('posts').filter(p => p.endsWith('.html')).map(p => [`posts/${p}`, hash(`posts/${p}`)]);
if (baseline.length < 500) throw new Error('Incomplete post archive');
let home = read('index.html');
if (!home.includes('Issue 69 · Daily webzine')) throw new Error('Expected Issue 69 baseline');
if (articles.length !== 5 || books.length !== 3 || !record) throw new Error('Expected one painting, three books, one record');
for (const a of articles) {
  if (fs.existsSync(url(a))) throw new Error(`Refusing to overwrite ${url(a)}`);
  if (!fs.existsSync(a.image)) throw new Error(`Missing ${a.image}`);
  const paragraphs = a.body.trim().split(/\n\n+/);
  if (a.body.length < 3500 || a.body.length > 5500 || paragraphs.length < 10 || paragraphs.length > 15) throw new Error(`Invalid article length: ${a.slug}`);
  if (a.previousReview && !fs.existsSync(`posts/${a.previousReview}`)) throw new Error('Missing previous review');
}
const template = read('posts/paul-signac-notre-dame-de-la-garde.html');
const header = template.match(/ <header[\s\S]*?<\/header>/)[0];
const footer = template.slice(template.indexOf(' <footer'));
const outputs = new Map();
for (const a of articles) {
  const sources = a.sources.map(([href, text]) => `<li><a href="${e(href)}" target="_blank" rel="noopener noreferrer">${e(text)}</a></li>`).join('\n');
  const peers = ordered.filter(p => p !== a).map(p => `<li><a href="${p.slug}.html">${e(p.name)}</a></li>`).join('\n');
  const music = a.musicUrl ? `<p><a href="${e(a.musicUrl)}" target="_blank" rel="noopener noreferrer">Apple Music에서 음반 듣기</a></p>` : '';
  const reread = a.previousReview ? `<p><a href="${a.previousReview}">앞선 서평 · ${e(a.name)}</a></p>` : '';
  outputs.set(url(a), `<!DOCTYPE html>
<html lang="ko">
<head>
 <meta charset="UTF-8" />
 <meta name="viewport" content="width=device-width, initial-scale=1.0" />
 <meta name="description" content="${e(a.description)}" />
 <title>${e(a.title)} - Paul Archive Notes</title>
 <link rel="canonical" href="https://archive-notes-webzine.vercel.app/posts/${a.slug}" />
 <link rel="stylesheet" href="../assets/site.css" />
</head>
<body>
${header}
 <main class="article-shell">
  <article class="article-layout${a.type === 'Lead' ? ' article-layout--lead-artwork' : ''}">
   <div class="article">
    <p class="eyebrow">${label} · ${a.category}</p>
    <h1>${e(a.title)}</h1>
    <div class="article-meta">${issue.date} · ${e(a.name)} · ${e(a.metadata)}</div>
    ${a.type === 'Lead' ? `<figure class="article-mobile-artwork"><img src="../${a.image}" alt="${e(a.name)}" /><figcaption>${e(a.metadata)}. ${e(a.imageCredit)}</figcaption></figure>` : ''}
    <div class="article-body">
${a.body.trim().split(/\n\n+/).map(p => `     <p>${e(p)}</p>`).join('\n\n')}
<section class="bibliography" data-language-preserve aria-labelledby="sources-title">
<h2 id="sources-title">참고 자료</h2><ol>${sources}</ol>
${music}${reread}
<h2>${label}의 다른 글</h2><ul>${peers}</ul></section>
<p class="article-signoff">Paul Archive Notes · ${label} · ${a.type}</p>
    </div>
   </div>
   <aside class="article-side"><div class="article-cover${a.type === 'Lead' ? ' artwork-cover' : ''}"><img src="../${a.image}" alt="${e(a.name)}"${a.maxImageWidth ? ` style="max-width:${a.maxImageWidth}px"` : ''} /></div><div class="article-note">${e(a.note)}</div></aside>
  </article>
 </main>
${footer}`.replace(/[ \t]+$/gm, '').trimEnd() + '\n');
}
function row(a, type = a.type) {
  return `<a class="archive-row" href="${url(a)}"${trigger(a)}><div class="thumb ${a.type === 'Lead' ? 'photo-thumb' : 'cover-thumb'}"><img src="${a.image}" alt="${e(a.name)}" /></div><div><h3>${e(a.title)}</h3><p>${issue.date} ${label} · ${e(a.description)}</p></div><span class="row-type">${type}</span></a>`;
}
function feature(a) {
  return `<a class="feature-card" href="${url(a)}"${trigger(a)}><div class="feature-image${a.type === 'Lead' ? '' : ' product-cover'}"><img src="${a.image}" alt="${e(a.name)}" /></div><div class="feature-body"><span class="category">${label} · ${e(a.metadata)}</span><h3>${e(a.title)}</h3><p>${e(a.description)}</p><div class="meta">${e(a.name)}</div><div class="preview-link">${a.type === 'Lead' ? '오늘의 그림 · 읽기' : a.type === 'Book' ? '오늘의 책장 · 읽기' : '오늘의 음반 · 듣기'}</div></div></a>`;
}
home = home.replace(/<title>.*?<\/title>/, `<title>${e(issue.title)} | Paul Archive Notes</title>`)
  .replace(/<a href="[^"]+">오늘의 이슈<\/a>/, `<a href="${url(art)}">오늘의 이슈</a>`)
  .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="Paul Archive Notes ${label}. ${e(issue.description)}" />`);
home = home.replace(/<section class="hero"[\s\S]*?<\/section>/, `<section class="hero" data-issue="70" aria-labelledby="hero-title">
 <div class="hero-grid"><div class="hero-copy"><div>
 <p class="eyebrow">${label} · Daily webzine</p>
 <h1 id="hero-title"><span>Paul</span><span>Archive</span><span>Notes</span></h1>
 <p class="hero-lede">${e(issue.lede)}</p>
 <div class="hero-meta" aria-label="사이트 분류">${['Main Image', label, 'Book 3', 'Record 1', '전문 공개'].map(t => `<span class="pill">${e(t)}</span>`).join('')}</div>
 </div><div class="hero-meta" aria-label="발행 정보"><span class="pill">${issue.date}</span></div></div>
 <aside class="hero-media" aria-label="${label} 대표 그림"><div class="hero-image"><img src="${art.image}" width="${art.imageWidth}" height="${art.imageHeight}" alt="${e(art.name)}" fetchpriority="high" /></div><article class="today-card"><p>${label} · Main image</p><h2><a href="${url(art)}">${e(issue.title)}</a></h2><p class="byline">${e(art.name)} · ${art.artworkDate}</p></article></aside></div>
 </section>`);
home = home.replace(/(<section class="section" id="notes"[^>]*>)[\s\S]*?(<details class="essay-drawer">)/, `$1
 <div class="split-band"><div class="issue-panel"><div><div class="issue-stamp">Issue<br />${issue.number}</div></div><div><h2 id="notes-title">${e(issue.title)}</h2><p>${e(issue.intro)}</p></div></div>
 <div class="archive-list" aria-label="${label} 대표 글 목록">
 ${ordered.map(a => row(a)).join('\n')}
 $2`);
const drawer = `<a href="${url(art)}" data-issue-player-trigger><span class="essay-date">${label} · ${issue.date}</span><strong>${e(art.title)}</strong><em>${e(art.description)}</em></a>
<div class="issue-companion-links issue-companion-links--drawer" aria-label="${label} 부속 리뷰"><p>${label} 오늘 더 읽고 듣기</p><div class="issue-companion-grid">${ordered.slice(1).map(a => `<a href="${url(a)}"><span>${a.type}</span><strong>${e(a.name)}</strong><em>${e(a.title)}</em></a>`).join('\n')}</div></div>`;
home = home.replace('Issue 01-69 전체 전면', 'Issue 01-70 전체 전면').replace('<div class="essay-drawer-list">', `<div class="essay-drawer-list">\n${drawer}\n`);
for (const [id, items] of [['art', [art]], ['books', books], ['records', [record]]]) {
  const re = new RegExp(`(<section class="section" id="${id}"[\\s\\S]*?<div class="feature-list">)[\\s\\S]*?(</section>)`);
  if (!re.test(home)) throw new Error(`Missing home section: ${id}`);
  home = home.replace(re, `$1\n${items.map(feature).join('\n')}\n</div>\n$2`);
}
home = home.replace(/공개 웹진은 Issue 69까지[^\n]+/, '공개 웹진은 Issue 70까지의 이슈를 보존합니다. 모네의 《보르디게라》와 세 권의 책, 칼 리히터의 바흐 B단조 미사를 각각의 글로 담았습니다. ‘이슈 읽기’에서 Issue 01부터 70까지의 대표 글과 책·음반 리뷰를 다시 만날 수 있습니다.');
home = home.replace('<link rel="stylesheet" href="assets/issue69.css" />', '<link rel="stylesheet" href="assets/issue69.css" />\n  <link rel="stylesheet" href="assets/issue70.css" />');
outputs.set('index.html', home);
const oldArchive = read('archive.html');
let archive = oldArchive;
for (const [id, items] of [['essay', ordered], ['art', [art]], ['records', [record]], ['books', books]]) {
  const re = new RegExp(`(<section[^>]*id="${id}-archive"[\\s\\S]*?<div class="archive-list">)`);
  if (!re.test(archive)) throw new Error(`Missing archive section: ${id}`);
  archive = archive.replace(re, `$1\n${items.map(a => row(a, id === 'art' ? 'Art' : a.type)).join('\n')}`);
}
const oldRows = oldArchive.match(/<a class="archive-row"[\s\S]*?<\/a>/g) || [];
if (!oldRows.every(row => archive.includes(row))) throw new Error('Existing archive rows changed');
outputs.set('archive.html', archive);
const context = { window: {} };
vm.runInNewContext(read('assets/book-archive-data.js'), context);
const data = context.window.PAUL_BOOK_ARCHIVE;
const oldBookIds = data.books.map(b => b.id);
const oldPicks = JSON.stringify(data.dailyPicks);
for (const a of [...books].reverse()) {
  const entry = { id: a.id, title: a.name, metadata: a.metadata, theme: a.theme, imageUrl: a.image, reviewUrl: url(a) };
  const existing = data.books.find(b => String(b.id) === a.id);
  if (!existing) throw new Error(`Missing archive book ${a.id}`);
  Object.assign(existing, entry, { reviewStatus: '우리 리뷰' });
  data.dailyPicks.unshift({ ...entry, id: `${a.id}-issue70`, label: `${label} · ${a.previousReview ? '재독' : '오늘의 장문 리뷰'}`, subtitle: a.title, review: a.description });
}
if (JSON.stringify(data.books.map(b => b.id)) !== JSON.stringify(oldBookIds) || JSON.stringify(data.dailyPicks.slice(3)) !== oldPicks) throw new Error('Book archive order changed');
data.source.reviewLinkedCount = data.books.filter(b => b.reviewUrl).length;
outputs.set('assets/book-archive-data.js', `window.PAUL_BOOK_ARCHIVE = ${JSON.stringify(data, null, 2)};\n`);
fs.writeFileSync('work/issue70-preservation-baseline.json', JSON.stringify({ posts: baseline, archiveRows: oldRows.length, books: oldBookIds.length }, null, 2));
for (const [path, text] of outputs) fs.writeFileSync(path, text);
if (!baseline.every(([path, before]) => hash(path) === before)) throw new Error('Existing post changed');
console.log(JSON.stringify({ preservedPosts: baseline.length, preservedArchiveRows: oldRows.length, articles: articles.map(a => ({ slug: a.slug, chars: a.body.length, paragraphs: a.body.split(/\n\n+/).length })) }, null, 2));
