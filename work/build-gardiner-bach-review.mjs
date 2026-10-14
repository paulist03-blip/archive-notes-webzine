import fs from 'node:fs';
import vm from 'node:vm';
import { review } from './gardiner-bach-review.mjs';

for (const file of ['index.html', 'archive.html', 'book-archive.html', '.vercel/project.json']) {
  if (!fs.existsSync(file)) throw new Error(`Missing production source: ${file}`);
}
if (fs.readdirSync('posts').filter(f => f.endsWith('.html')).length < 500) throw new Error('Incomplete source');
const escape = s => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const file = `posts/${review.slug}.html`;
let html = fs.readFileSync(file, 'utf8');
html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(review.title)} - Paul Archive Notes</title>`);
if (!html.includes('name="description"')) html = html.replace(' <link rel="stylesheet"', ` <meta name="description" content="${escape(review.description)}" />\n <link rel="canonical" href="https://archive-notes-webzine.vercel.app/posts/${review.slug}" />\n <meta property="og:title" content="${escape(review.title)}" />\n <meta property="og:description" content="${escape(review.description)}" />\n <meta property="og:image" content="https://archive-notes-webzine.vercel.app/${review.image}" />\n <link rel="stylesheet"`);
html = html.replace(/<h1>[\s\S]*?<\/h1>/, `<h1>${escape(review.title)}</h1>`);
html = html.replace('2026.06.22 · 음악', '2026.06.22 · 장문 개정 2026.10.14 · 음악');
const sources = [
  ['https://www.yes24.com/product/goods/96433808', '오픈하우스 제공 목차와 한국어판 공개 발췌문 · YES24'],
  ['https://penguinrandomhousehighereducation.com/book/?isbn=9781400031436', '원서 출판사 · 소개와 제1장 공개 발췌문'],
  ['https://www.bach-leipzig.de/en/neutral/bach300-300-years-bach-leipzig', '라이프치히 바흐 아카이브 · 1723년 취임과 초기 칸타타 작업'],
  ['https://shop.monteverdi.co.uk/cantata-series/', '몬테베르디 합창단 · 2000년 칸타타 순례와 가디너의 기록'],
  ['https://bach.org/education/cantata-bwv-106/', '베들레헴 바흐 합창단 · BWV 106의 가사, 편성과 구성'],
  ['https://blog.carus-verlag.com/en/personalities/recycling-and-borrowing-in-j-s-bachs-works/', '카루스 악보 출판사 · 바흐의 재작곡과 B단조 미사의 선행 재료'],
  ['https://doi.org/10.1163/18712428-09501025', 'Dick Wursten, 학술 서평 · Church History and Religious Culture 95(1), 2015, 106–110'],
  ['https://www.researchgate.net/publication/277928255_Book_Review_Music_in_the_Castle_of_Heaven-A_portrait_of_Johann_Sebastian_Bach_written_by_John_Eliot_Gardiner', '뷔르스턴 서평 · 저자가 공개한 본문']
];
const body = review.body.split('\n\n').map(p => `     <p>${escape(p)}</p>`).join('\n\n');
const bibliography = `<section class="bibliography" data-language-preserve aria-labelledby="sources-title"><h2 id="sources-title">참고 자료</h2><p>존 엘리엇 가디너, 《바흐: 천상의 음악》, 노승림 옮김, 오픈하우스, 2020. 원서 Bach: Music in the Castle of Heaven, 2013.</p><p>자료 범위: 공개된 목차와 원서·한국어판 발췌문, 저자의 연주 기록 및 관련 학술 서평을 대조했다. 작품의 편성과 제작 경위는 음악 기관과 악보 출판사 자료로 확인했다.</p><ol>${sources.map(([url,title]) => `<li><a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(title)}</a></li>`).join('\n')}</ol><h2>함께 듣고 읽기</h2><ul><li><a href="bach-mass-b-minor-richter-1961.html">칼 리히터의 바흐 B단조 미사</a></li><li><a href="nancho-classic-3-bach.html">바흐의 생애와 작품</a></li><li><a href="../book-archive.html">오늘의 책장과 전체 서가</a></li></ul></section>`;
const marker = '    <div class="article-body"';
const end = '\n    </div>\n   </div>';
const startAt = html.indexOf(marker), endAt = html.indexOf(end, startAt);
if (startAt < 0 || endAt < 0) throw new Error('Unexpected article structure');
html = html.slice(0, startAt) + `    <div class="article-body">\n${body}\n${bibliography}` + html.slice(endAt);
html = html.replace('src="https://image.aladin.co.kr/product/25920/10/cover500/k022737697_1.jpg"', `src="../${review.image}" width="822" height="1200"`);
html = html.replace('    \n   </aside>', '    <div class="article-note">존 엘리엇 가디너, 《바흐: 천상의 음악》, 노승림 옮김, 오픈하우스, 2020. 원서 Bach: Music in the Castle of Heaven, 2013.<br />자료 범위: 공개된 목차와 원서·한국어판 발췌문, 저자의 연주 기록 및 관련 학술 서평을 대조했다. 작품의 편성과 제작 경위는 음악 기관과 악보 출판사 자료로 확인했다.</div>\n   </aside>');
fs.writeFileSync(file, html);

const dataFile = 'assets/book-archive-data.js';
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(dataFile, 'utf8'), context);
const data = context.window.PAUL_BOOK_ARCHIVE;
const book = data.books.find(b => b.id === '366094147');
if (!book || !/바흐.*천상의 음악/.test(book.title)) throw new Error('Book identity mismatch');
book.reviewUrl = file;
book.imageUrl = review.image;
book.reviewTitle = review.title;
book.reviewSummary = review.description;
data.dailyPicks = [{
  id: book.id + '-gardiner-long-review', title: '바흐: 천상의 음악',
  metadata: book.metadata, theme: book.theme, imageUrl: review.image, reviewUrl: file,
  label: '2026.10.14 · 오늘의 장문 리뷰', subtitle: '한 사람의 숨으로 돌아오는 바흐', review: review.description
}, ...data.dailyPicks.filter(b => b.reviewUrl !== file)];
data.source.reviewLinkedCount = data.books.filter(b => b.reviewUrl).length;
fs.writeFileSync(dataFile, 'window.PAUL_BOOK_ARCHIVE = ' + JSON.stringify(data, null, 2) + ';\n');

let archive = fs.readFileSync('archive.html', 'utf8');
const row = new RegExp(`<a class="archive-row" href="posts/${review.slug}\\.html">[\\s\\S]*?<\\/a>`);
if (!row.test(archive)) throw new Error('Existing archive entry absent');
archive = archive.replace(row, `<a class="archive-row" href="${file}"><div class="thumb cover-thumb"><img src="${review.image}" alt="바흐: 천상의 음악 표지" /></div><div><h3>${escape(review.title)}</h3><p>2026.06.22 · 2026.10.14 장문 개정. ${escape(review.description)}</p></div><span class="row-type">Book</span></a>`);
fs.writeFileSync('archive.html', archive);
console.log(JSON.stringify({ file, characters: review.body.length, paragraphs: review.body.split('\n\n').length, books: data.books.length, linked: data.source.reviewLinkedCount }));
