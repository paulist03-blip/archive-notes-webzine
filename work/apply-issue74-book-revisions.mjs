import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { articles } from './issue74-content.mjs';
import { bookRevisions } from './issue74-book-revisions.mjs';

const read = path => fs.readFileSync(path, 'utf8');
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const update = (path, transform) => fs.writeFileSync(path, transform(read(path)));
const quote = (text, article) => `<blockquote data-language-preserve><p>${escape(text)}</p><cite>${escape(article.name)} · ${escape(article.metadata.split(' · ').slice(0, 2).join(' · '))} · <a href="${article.sources[0][0]}" target="_blank" rel="noopener noreferrer">공개 발췌</a></cite></blockquote>`;
const dataContext = { window: {} };
vm.runInNewContext(read('assets/book-archive-data.js'), dataContext);
const data = dataContext.window.PAUL_BOOK_ARCHIVE;
const baseline = JSON.parse(read('work/speak-memory-preservation-baseline.json'));

for (const [slug, revision] of Object.entries(bookRevisions)) {
 const article = articles.find(article => article.slug === slug);
 assert(article);
 const path = `posts/${slug}.html`;
 const original = read(path);
 const start = original.indexOf('    <div class="article-body">');
 const bibliography = original.indexOf('<section class="bibliography"', start);
 assert(start > 0 && bibliography > start);
 const body = revision.body.split('\n\n').map(paragraph => paragraph.startsWith('> ') ? quote(paragraph.slice(2), article) : `<p>${escape(paragraph)}</p>`).join('\n\n');
 const cover = `<figure class="speak-memory-mobile-cover"><img src="../${article.image}" alt="${article.name} 표지" /><figcaption>${escape(article.name)} · ${escape(article.metadata)}</figcaption></figure>`;
 const html = (original.slice(0, start) + `    <div class="article-body">\n${cover}\n${body}\n` + original.slice(bibliography)).replace('\n <link rel="stylesheet" href="../assets/speak-memory.css" />', '');
 const revised = html.replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escape(revision.description)}" />`)
  .replace(' <link rel="stylesheet" href="../assets/site.css" />', ' <link rel="stylesheet" href="../assets/site.css" />\n <link rel="stylesheet" href="../assets/speak-memory.css" />')
  .replace('<article class="article-layout">', '<article class="article-layout quoted-book-review">')
  .replace(/(<h2 id="sources-title">참고 자료<\/h2>)<p>[\s\S]*?<\/p><ol>[\s\S]*?<\/ol>/, `$1<p>${escape(revision.sourceNote)}</p><ol>${article.sources.map(([url, label]) => `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${escape(label)}</a></li>`).join('\n')}</ol>`);
 assert(!revised.includes('직접 인용과 쪽수 표기는 사용하지 않았습니다'));
 fs.writeFileSync(path, revised);
 const old = baseline.dailyPicks.find(pick => pick.reviewUrl === path);
 assert(old);
 const previous = data.dailyPicks.find(pick => pick.reviewUrl === path);
 for (const target of ['index.html', 'archive.html']) update(target, html => html.replaceAll(escape(previous.review), escape(revision.description)).replaceAll(escape(old.review), escape(revision.description)));
 for (const pick of data.dailyPicks.filter(pick => pick.reviewUrl === path)) pick.review = revision.description;
}
update('assets/book-archive-data.js', text => {
 const start = text.indexOf('{');
 const end = text.lastIndexOf('}');
 assert(start > 0 && end > start);
 return text.slice(0, start) + JSON.stringify(data, null, 2) + text.slice(end + 1);
});
console.log(JSON.stringify({ updatedReviews: Object.keys(bookRevisions), quotes: Object.values(bookRevisions).map(revision => revision.body.split('\n\n').filter(part => part.startsWith('> ')).length) }));
