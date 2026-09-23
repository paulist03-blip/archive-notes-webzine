import fs from 'node:fs';
import vm from 'node:vm';
import { issue, articles } from './issue67-content.mjs';

const e = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const read = p => fs.readFileSync(p, 'utf8');
const [art] = articles;
const books = articles.filter(a => a.type === 'Book');
const record = articles.find(a => a.type === 'Record');
const ordered = [art, record, ...books];
const url = a => `posts/${a.slug}.html`;
const trigger = a => a.type === 'Book' ? '' : ' data-issue-player-trigger';
const label = `Issue ${issue.number}`;
const template = read('posts/paul-signac-notre-dame-de-la-garde.html');
const header = template.match(/ <header[\s\S]*?<\/header>/)[0];
const footer = template.slice(template.indexOf(' <footer'));
let home = read('index.html');
if (!home.includes('Issue 66 · Daily webzine')) throw new Error('Expected Issue 66 baseline');
if (articles.length !== 5 || books.length !== 3 || !record) throw new Error('Expected one painting, three books, one record');
for (const a of articles) {
  if (fs.existsSync(url(a))) throw new Error(`Refusing to overwrite ${url(a)}`);
  if (!fs.existsSync(a.image)) throw new Error(`Missing ${a.image}`);
  const paras = a.body.trim().split(/\n\n+/);
  if (a.body.length < 3500 || a.body.length > 5500 || paras.length < 10 || paras.length > 15) throw new Error(a.slug);
}
const outputs = new Map();
for (const a of articles) {
  const sources = a.sources.map(([href, text]) => `<li><a href="${e(href)}" target="_blank" rel="noopener noreferrer">${e(text)}</a></li>`).join('\n');
  const peers = ordered.filter(p => p !== a).map(p => `<li><a href="${p.slug}.html">${e(p.name)}</a></li>`).join('\n');
  const music = a.musicUrl ? `<p><a href="${e(a.musicUrl)}" target="_blank" rel="noopener noreferrer">Apple Music에서 음반 듣기</a></p>` : '';
  const reread = a.slug === 'balzac-unknown-masterpiece-issue67' ? '<p><a href="unknown-masterpiece-balzac.html">앞선 서평 · 걸작은 누구의 삶을 태워 빛나는가</a></p>' : '';
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
    ${a.type === 'Lead' ? `<figure class="article-mobile-artwork"><img src="../${a.image}" alt="${e(a.name)}" /><figcaption>${e(a.metadata)}. © Estate of Pablo Picasso / Artists Rights Society (ARS), New York. 작품 비평을 위한 도판.</figcaption></figure>` : ''}
    <div class="article-body">
${a.body.trim().split(/\n\n+/).map(p => `     <p>${e(p)}</p>`).join('\n\n')}
<section class="bibliography" data-language-preserve aria-labelledby="sources-title">
<h2 id="sources-title">참고 자료</h2><ol>${sources}</ol>
${music}${reread}
<h2>${label}의 다른 글</h2><ul>${peers}</ul></section>
<p class="article-signoff">Paul Archive Notes · ${label} · ${a.type}</p>
    </div>
   </div>
   <aside class="article-side"><div class="article-cover${a.type === 'Lead' ? ' artwork-cover' : ''}"><img src="../${a.image}" alt="${e(a.name)}" /></div><div class="article-note">${e(a.note)}</div></aside>
  </article>
 </main>
${footer}`);
}
function row(a, type = a.type) {
  return `<a class="archive-row" href="${url(a)}"${trigger(a)}><div class="thumb ${a.type === 'Lead' ? 'photo-thumb' : 'cover-thumb'}"><img src="${a.image}" alt="${e(a.name)}" /></div><div><h3>${e(a.title)}</h3><p>${issue.date} ${label} · ${e(a.description)}</p></div><span class="row-type">${type}</span></a>`;
}
function feature(a) {
  return `<a class="feature-card" href="${url(a)}"${trigger(a)}><div class="feature-image${a.type === 'Lead' ? '' : ' product-cover'}"><img src="${a.image}" alt="${e(a.name)}" /></div><div class="feature-body"><span class="category">${label} · ${e(a.metadata)}</span><h3>${e(a.title)}</h3><p>${e(a.description)}</p><div class="meta">${e(a.name)}</div><div class="preview-link">${a.type === 'Lead' ? '오늘의 그림 · 읽기' : a.type === 'Book' ? '오늘의 책장 · 읽기' : '오늘의 음반 · 듣기'}</div></div></a>`;
}
home = home.replace(/<title>.*?<\/title>/, `<title>${e(issue.title)} | Paul Archive Notes</title>`)
  .replace(/<a href="[^"]+">오늘의 이슈<\/a>/, `<a href="${url(art)}">오늘의 이슈</a>`)
  .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="Paul Archive Notes ${label}. 피카소의 늙은 기타 연주자와 열정으로서의 사랑, 문학의 공간, 미지의 걸작. 허버트 헹크의 몸포우 침묵의 음악." />`);
home = home.replace(/<section class="hero"[\s\S]*?<\/section>/, `<section class="hero" data-issue="67" aria-labelledby="hero-title">
 <div class="hero-grid"><div class="hero-copy"><div>
 <p class="eyebrow">${label} · Daily webzine</p>
 <h1 id="hero-title"><span>Paul</span><span>Archive</span><span>Notes</span></h1>
 <p class="hero-lede">${e(issue.lede)}</p>
 <div class="hero-meta" aria-label="사이트 분류">${['Main Image', label, issue.title, 'Book 3', 'Record 1', 'Image 1', '전문 공개'].map(t => `<span class="pill">${e(t)}</span>`).join('')}</div>
 </div><div class="hero-meta" aria-label="발행 정보"><span class="pill">${issue.date}</span><span class="pill">Public deep reviews</span></div></div>
 <aside class="hero-media" aria-label="${label} 대표 그림"><div class="hero-image"><img src="${art.image}" alt="${e(art.name)}" /></div><article class="today-card"><p>${label} · Main image</p><h2><a href="${url(art)}">${e(issue.title)}</a></h2><p class="byline">${e(art.name)} · 1903년 말–1904년 초</p></article></aside></div>
 </section>`);
home = home.replace(/(<section class="section" id="notes"[^>]*>)[\s\S]*?(<details class="essay-drawer">)/, `$1
 <div class="split-band"><div class="issue-panel"><div><div class="issue-stamp">Issue<br />${issue.number}</div></div><div><h2 id="notes-title">${e(issue.title)}</h2><p>${e(issue.intro)}</p></div></div>
 <div class="archive-list" aria-label="${label} 대표 글 목록">
 ${ordered.map(a => row(a)).join('\n')}
 $2`);
const drawer = `<a href="${url(art)}" data-issue-player-trigger><span class="essay-date">${label} · ${issue.date}</span><strong>${e(art.title)}</strong><em>${e(art.description)}</em></a>
<div class="issue-companion-links issue-companion-links--drawer" aria-label="${label} 부속 리뷰"><p>${label} 오늘 더 읽고 듣기</p><div class="issue-companion-grid">${ordered.slice(1).map(a => `<a href="${url(a)}"><span>${a.type}</span><strong>${e(a.name)}</strong><em>${e(a.title)}</em></a>`).join('\n')}</div></div>`;
home = home.replace('Issue 01-66 전체 전면', 'Issue 01-67 전체 전면').replace('<div class="essay-drawer-list">', `<div class="essay-drawer-list">\n${drawer}\n`);
for (const [id, items] of [['art', [art]], ['books', books], ['records', [record]]]) {
  const re = new RegExp(`(<section class="section" id="${id}"[\\s\\S]*?<div class="feature-list">)[\\s\\S]*?(</section>)`);
  if (!re.test(home)) throw new Error(id);
  home = home.replace(re, `$1\n${items.map(feature).join('\n')}\n</div>\n$2`);
}
home = home.replace(/공개 웹진은 Issue 66까지[^\n]+/, '공개 웹진은 Issue 67까지의 이슈를 보존합니다. 피카소의 《늙은 기타 연주자》와 《열정으로서의 사랑》, 《문학의 공간》, 《미지의 걸작》, 허버트 헹크의 몸포우를 각각의 글로 담았습니다. ‘이슈 읽기’에서 Issue 01부터 67까지의 대표 글과 책·음반 리뷰를 다시 만날 수 있습니다.');
home = home.replace('<link rel="stylesheet" href="assets/site-mini-player.css" />', '<link rel="stylesheet" href="assets/site-mini-player.css" />\n  <link rel="stylesheet" href="assets/issue67.css" />');
outputs.set('index.html', home);
let archive = read('archive.html');
for (const [id, items] of [['essay', ordered], ['art', [art]], ['records', [record]], ['books', books]]) {
  const re = new RegExp(`(<section[^>]*id="${id}-archive"[\\s\\S]*?<div class="archive-list">)`);
  if (!re.test(archive)) throw new Error(id);
  archive = archive.replace(re, `$1\n${items.map(a => row(a, id === 'art' ? 'Art' : a.type)).join('\n')}`);
}
outputs.set('archive.html', archive);
const context = { window: {} };
vm.runInNewContext(read('assets/book-archive-data.js'), context);
const data = context.window.PAUL_BOOK_ARCHIVE;
for (const a of [...books].reverse()) {
  const entry = { id: a.id, title: a.name, metadata: a.metadata, theme: a.theme, imageUrl: a.image, reviewUrl: url(a) };
  const existing = data.books.find(b => String(b.id) === a.id);
  if (!existing) throw new Error(`Missing archive book ${a.id}`);
  Object.assign(existing, entry, { reviewStatus: '우리 리뷰' });
  // Earlier daily picks and the first Balzac review remain in the archive.
  data.dailyPicks.unshift({ ...entry, id: a.category.includes('재독') ? `${a.id}-issue67` : a.id, label: `${label} · ${a.category.includes('재독') ? '재독' : '오늘의 장문 리뷰'}`, subtitle: a.title, review: a.description });
}
data.source.reviewLinkedCount = data.books.filter(b => b.reviewUrl).length;
outputs.set('assets/book-archive-data.js', `window.PAUL_BOOK_ARCHIVE = ${JSON.stringify(data, null, 2)};\n`);
for (const [path, text] of outputs) fs.writeFileSync(path, text);
console.log(JSON.stringify(articles.map(a => ({ slug: a.slug, chars: a.body.length, paragraphs: a.body.split(/\n\n+/).length })), null, 2));
