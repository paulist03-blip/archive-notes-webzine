import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePost, validateReply, filterPosts, hasConfiguration } from '../assets/forum-model.js';
const sample = { title: ' 감상 ', work: ' 작품 ', category: '미술', body: ' 본문 ' };
test('trim and discard identity injection', () => {
  assert.deepEqual(validatePost({ ...sample, authorUid: 'fake' }), { title: '감상', work: '작품', category: '미술', body: '본문' });
});
test('long writing limits', () => {
  assert.equal(validatePost({ ...sample, body: '가'.repeat(20000) }).body.length, 20000);
  for (const change of [{ body: '가'.repeat(20001) }, { title: '' }, { work: '' }, { category: '공지' }]) assert.throws(() => validatePost({ ...sample, ...change }));
  assert.equal(validateReply(' 가 '), '가');
  assert.throws(() => validateReply(' ')); assert.throws(() => validateReply('가'.repeat(12001)));
});
test('normalized category and text filtering', () => {
  assert.equal(filterPosts([sample], '미술', '작품').length, 1);
  assert.equal(filterPosts([sample], '책', '').length, 0);
  assert.equal(filterPosts([{ ...sample, title: 'ＢＡＣＨ' }], '전체', 'bach').length, 1);
});
test('configuration must be complete', () => {
  assert.equal(hasConfiguration({ firebase: {} }), false);
  assert.equal(hasConfiguration({ firebase: { apiKey: 'x', authDomain: 'x', projectId: 'x', appId: 'x' } }), true);
});
