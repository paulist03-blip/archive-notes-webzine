import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { revisions } from './contribution-prose-revisions.mjs';

export const baseline = 'a2d8250359eac2685cb4d6c8d69334f9019660f1';
export const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export function renderRevision(original, revision) {
  const start = revision.mode === 'article' ? original.search(/<div class="article-body"[^>]*>/) : 0;
  assert(start >= 0, revision.file);
  const bibliography = original.slice(start).search(/<section class="(?:article-)?bibliography"/);
  const end = revision.mode === 'article' ? (bibliography >= 0 ? start + bibliography : original.indexOf('</div>', start)) : original.length;
  assert(end > start, revision.file);
  let index = 0;
  const first = revision.start || 0;
  const region = original.slice(start, end).replace(/(<p\b[^>]*>)([\s\S]*?)(<\/p>)/g, (whole, open, content, close) => {
    const n = index++ - first;
    return n >= 0 && n < revision.body.length ? open + escape(revision.body[n]) + close : whole;
  });
  assert(index >= first + revision.body.length, `Paragraph mismatch: ${revision.file}`);
  let result = original.slice(0, start) + region + original.slice(end);
  if (revision.caption) result = result.replace(/(<figcaption class="map-caption">)[\s\S]*?(<\/figcaption>)/, (_, open, close) => open + '\n      ' + escape(revision.caption) + '\n     ' + close);
  return result;
}

if (process.argv[1]?.endsWith('/refine-contribution-prose.mjs')) {
  for (const revision of revisions) {
    const original = execFileSync('git', ['show', `${baseline}:${revision.file}`], { maxBuffer: 4 * 1024 * 1024 }).toString();
    assert(!/아니라|말라는\s*요구|멈추|멈춰/.test(revision.body.join('\n')), `Style regression: ${revision.file}`);
    fs.writeFileSync(revision.file, renderRevision(original, revision));
  }
  console.log(JSON.stringify({ revised: revisions.length, paragraphs: revisions.reduce((sum, r) => sum + r.body.length, 0) }));
}
