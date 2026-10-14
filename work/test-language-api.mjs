import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

let calls = 0;
let mode = 'success';
let lastPayload;
const env = {};
const context = vm.createContext({ module: { exports: {} }, Buffer, AbortSignal, URL,
  process: { env }, fetch: async (url, options) => {
    calls++;
    const request = JSON.parse(options.body);
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(request.response_format.type, 'json_object');
    lastPayload = JSON.parse(request.messages[1].content);
    if (mode === 'provider-error') return { ok: false, status: 401 };
    if (mode === 'rate-limit') return { ok: false, status: 429 };
    if (mode === 'timeout') throw Object.assign(new Error('test timeout'), { name: 'TimeoutError' });
    let translations = lastPayload.items.map(item => ({ id: item.id, text: 'A complete English passage of ' + item.text.length + ' source characters.' }));
    if (mode === 'missing') translations.pop();
    if (mode === 'duplicate') translations[1] = translations[0];
    if (mode === 'unknown') translations[0].id = 'not-an-input-id';
    if (mode === 'empty') translations[0].text = ' ';
    const content = mode === 'malformed' ? '{broken' : JSON.stringify({ translations });
    return { ok: true, json: async () => ({ choices: [{ finish_reason: mode === 'truncated' ? 'length' : 'stop', message: { content } }] }) };
  } });
vm.runInContext(fs.readFileSync('api/translate.js', 'utf8'), context);
const handler = context.module.exports;
const request = async (body, options = {}) => {
  const headers = {};
  let value;
  const response = { setHeader: (key, val) => { headers[key] = val; }, end: data => { value = JSON.parse(data); } };
  await handler({ method: 'POST', headers: { host: 'test.local' }, body, ...options }, response);
  return { status: response.statusCode, value, headers };
};
const sample = (text = '한국어 문장', id = 'a') => ({ source: 'ko', target: 'en', path: '/posts/example', title: '제목', items: [{ id, text, context: '문장의 문맥' }] });
assert.equal((await request(sample(), { method: 'GET' })).status, 405);
assert.equal((await request(sample())).value.code, 'not_configured');
assert.equal((await request('{invalid')).status, 400);
assert.equal((await request({ ...sample(), target: 'ko' })).status, 400);
assert.equal((await request(sample(), { headers: { host: 'test.local', origin: 'https://other.local' } })).status, 403);
assert.equal((await request({ ...sample(), items: [{ id: 'a', text: '내용' }, { id: 'a', text: '문장' }] })).status, 400);
assert.equal((await request(sample('가'.repeat(12001)))).status, 400);
assert.equal((await request({ ...sample(), items: Array.from({ length: 61 }, (_, i) => ({ id: String(i), text: '책' })) })).status, 413);
assert.equal((await request({ ...sample(), padding: '가'.repeat(50000) })).status, 413);
assert.equal(calls, 0);
env.OPENAI_API_KEY = 'test-only-not-a-real-key';
const longSource = '긴 문장의 호흡을 살린다. '.repeat(250);
assert.equal((await request(sample(longSource))).status, 200);
assert.equal(lastPayload.items[0].text, longSource);
assert.equal(lastPayload.items[0].context, '문장의 문맥');
assert.equal(lastPayload.page.path, '/posts/example');
assert.equal(calls, 1);
assert.equal((await request(sample(longSource, 'different-id'))).value.translations[0].id, 'different-id');
assert.equal(calls, 1, 'Cross-page cache should reuse exact source and context');
for (const testMode of ['missing', 'duplicate', 'unknown', 'empty', 'malformed', 'truncated', 'provider-error', 'rate-limit', 'timeout']) {
  mode = testMode;
  const body = sample('각 검수의 별도 문장 ' + testMode);
  body.items.push({ id: 'b', text: '두 번째 검수 문장 ' + testMode });
  const result = await request(body);
  assert.equal(result.status, mode === 'rate-limit' ? 429 : mode === 'timeout' ? 504 : 502, mode);
  assert(!JSON.stringify(result.value).includes('test-only-not-a-real-key'));
}
console.log(JSON.stringify({ passed: true, checks: 23, realProviderUsed: false, sourceTruncation: false,
  responseCompletenessValidated: true, contextPreserved: true, cacheReused: true }));
