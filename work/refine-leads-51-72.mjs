import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { revisions } from './lead-prose-revisions.mjs';

const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const home = fs.readFileSync('index.html', 'utf8');
const leads = [...home.matchAll(/<a href="(posts\/[^"]+)"[^>]*><span class="essay-date">Issue (\d+)[\s\S]*?<\/a>/g)]
  .filter(m => +m[2] >= 51 && +m[2] <= 72).map(m => ({ file: m[1], issue: +m[2] }));
if (leads.length !== 22) throw new Error('Expected exactly 22 leads');
for (const { file, issue } of leads) {
  const original = execFileSync('git', ['show', `34aa9a3173d235fab117552a2bc4e6bdf5db6aa6:${file}`], { encoding: 'utf8' });
  const start = original.indexOf('<div class="article-body">');
  if (start < 0 || !revisions[issue]) throw new Error(`Missing body/revision ${issue}`);
  let i = 0;
  const updated = original.slice(0, start) + original.slice(start).replace(/<p>([\s\S]*?)<\/p>/g, (tag, old) => {
    const replacement = revisions[issue][i++];
    return replacement === undefined ? tag : `<p>${escape(replacement)}</p>`;
  });
  for (const key of Object.keys(revisions[issue])) if (+key >= i) throw new Error(`Invalid paragraph ${issue}:${key}`);
  const current = fs.readFileSync(file, 'utf8');
  if (current !== original && current !== updated) throw new Error(`Later edits exist: ${file}`);
  fs.writeFileSync(file, updated);
  if (issue >= 65) {
    const sourceFile = `work/issue${issue}-content.mjs`;
    const source = fs.readFileSync(sourceFile, 'utf8');
    const bodyMatch = /body: `([\s\S]*?)`/.exec(source);
    if (!bodyMatch) throw new Error(`No source body ${issue}`);
    const paragraphs = bodyMatch[1].split('\n\n');
    for (const [j, text] of Object.entries(revisions[issue])) paragraphs[+j] = text;
    fs.writeFileSync(sourceFile, source.slice(0, bodyMatch.index) + 'body: `' + paragraphs.join('\n\n') + '`' + source.slice(bodyMatch.index + bodyMatch[0].length));
  }
  console.log(`${issue}: ${Object.keys(revisions[issue]).length}/${i} paragraphs revised`);
}
