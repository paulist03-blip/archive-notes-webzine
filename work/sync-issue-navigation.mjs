import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const stylesheet = ' <link rel="stylesheet" href="../assets/issue-navigation.css" />\n';
const navigation = /\n    <nav class="issue-pagination" data-issue-navigation="\d+"[\s\S]*?<\/nav>/g;

export function collectIssues(home, read) {
  const seen = new Set();
  const files = new Set();
  const issues = [];
  for (const match of home.matchAll(/<a href="(posts\/[^"]+)"[^>]*><span class="essay-date">Issue (\d+)[\s\S]*?<\/a>/g)) {
    const file = match[1];
    const number = Number(match[2]);
    assert(/^posts\/[a-z0-9_-]+\.html$/.test(file), `Invalid issue path: ${file}`);
    assert(Number.isSafeInteger(number) && number > 0, 'Invalid issue number');
    assert(!seen.has(number) && !files.has(file), `Duplicate issue: ${number}`);
    seen.add(number);
    files.add(file);
    const html = read(file);
    const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/);
    assert(heading, `Missing issue title: ${file}`);
    const title = heading[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    assert(title, `Empty issue title: ${file}`);
    issues.push({ number, file, title });
  }
  return issues.sort((a, b) => a.number - b.number);
}

export function stripIssueNavigation(html) {
  return html.replaceAll(stylesheet, '').replace(navigation, '');
}

export function renderNavigation(issues, index) {
  const current = issues[index];
  const links = [];
  for (const [direction, neighbor] of [['prev', issues[index - 1]], ['next', issues[index + 1]]]) {
    if (!neighbor) continue;
    const label = direction === 'prev' ? '이전 호' : '다음 호';
    const arrow = `<span class="issue-pagination-arrow" aria-hidden="true">${direction === 'prev' ? '←' : '→'}</span>`;
    const number = `<span>${label} · ${neighbor.number}호</span>`;
    links.push(`     <a class="issue-pagination-link issue-pagination-link--${direction}" rel="${direction}" href="${path.posix.basename(neighbor.file)}"><span class="issue-pagination-direction">${direction === 'prev' ? arrow + number : number + arrow}</span><strong class="issue-pagination-title">${neighbor.title}</strong></a>`);
  }
  return `\n    <nav class="issue-pagination" data-issue-navigation="${current.number}" aria-label="이전 호와 다음 호">\n${links.join('\n')}\n    </nav>`;
}

function articleBodyEnd(html) {
  const opening = /<div class="article-body"[^>]*>/.exec(html);
  assert(opening, 'Missing article body');
  const divs = /<\/?div\b[^>]*>/g;
  divs.lastIndex = opening.index;
  let depth = 0;
  for (let token; (token = divs.exec(html));) {
    depth += token[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return divs.lastIndex;
  }
  throw new Error('Unclosed article body');
}

export function addIssueNavigation(html, issues, index) {
  const clean = stripIssueNavigation(html);
  const end = articleBodyEnd(clean);
  assert(clean.includes('</head>'), 'Missing document head');
  return (clean.slice(0, end) + renderNavigation(issues, index) + clean.slice(end)).replace('</head>', stylesheet + '</head>');
}

export function syncIssueNavigation() {
  const read = file => fs.readFileSync(file, 'utf8');
  const issues = collectIssues(read('index.html'), read);
  assert(issues.length >= 2, 'Expected a published issue archive');
  // Validate every page before changing any file.
  const outputs = issues.map((issue, index) => [issue.file, addIssueNavigation(read(issue.file), issues, index)]);
  let changed = 0;
  for (const [file, html] of outputs) if (html !== read(file)) {
    fs.writeFileSync(file, html);
    changed++;
  }
  return { issues: issues.length, first: issues[0].number, latest: issues.at(-1).number, changed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  assert.equal(fs.realpathSync('.'), '/Users/paulista/Documents/Codex/2026-06-05/new-chat');
  console.log(JSON.stringify(syncIssueNavigation()));
}
