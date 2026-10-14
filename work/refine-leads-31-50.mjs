import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { revisions, titles, listingEdits } from './lead-prose-revisions-31-50.mjs';

export const baseline = '80368bffc572c7883056751666b8b44a69babd03';
export const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export const before = file => execFileSync('git', ['show', `${baseline}:${file}`], { maxBuffer: 16 * 1024 * 1024 });
export const leads = [...before('index.html').toString().matchAll(/<a href="(posts\/[^"]+)"[^>]*><span class="essay-date">Issue (\d+)[\s\S]*?<\/a>/g)]
  .filter(m => +m[2] >= 31 && +m[2] <= 50).map(m => ({ file: m[1], issue: +m[2] })).sort((a, b) => a.issue - b.issue);
assert.equal(leads.length, 20);

export function render(html, issue) {
  const start = html.search(/<div class="article-body"[^>]*>/);
  assert(start >= 0, `Missing article ${issue}`);
  const bibliography = html.slice(start).search(/<section class="(?:article-)?bibliography"/);
  const end = bibliography >= 0 ? start + bibliography : html.indexOf('</div>', start);
  assert(end > start, `Missing bibliography ${issue}`);
  let i = 0;
  const body = html.slice(start, end).replace(/(<p[^>]*>)([\s\S]*?)(<\/p>)/g, (tag, open, text, close) => {
    const replacement = revisions[issue][i++];
    return replacement === undefined ? tag : open + escape(replacement) + close;
  });
  for (const key of Object.keys(revisions[issue])) assert(+key < i, `Bad paragraph ${issue}:${key}`);
  let result = html.slice(0, start) + body + html.slice(end);
  if (titles[issue]) result = result.replaceAll(titles[issue][0], titles[issue][1]);
  return result;
}

export function renderListing(html, file) {
  for (const [old, value] of listingEdits[file]) html = html.replaceAll(old, value);
  return html;
}

if (process.argv[1]?.endsWith('/refine-leads-31-50.mjs')) {
  for (const { file, issue } of leads) {
    const original = before(file).toString();
    const updated = render(original, issue);
    const current = fs.readFileSync(file, 'utf8');
    assert(render(current, issue) === updated, `Unexpected later edit outside revised paragraphs: ${file}`);
    fs.writeFileSync(file, updated);
  }
  for (const file of Object.keys(listingEdits)) {
    const expected = renderListing(before(file).toString(), file);
    assert(renderListing(fs.readFileSync(file, 'utf8'), file) === expected, `Unexpected listing edit: ${file}`);
    fs.writeFileSync(file, expected);
  }
  console.log(JSON.stringify({ articles: leads.length, revisedParagraphs: Object.values(revisions).reduce((n, r) => n + Object.keys(r).length, 0) }));
}
