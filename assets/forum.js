import { LIMITS, REPORT_REASONS, validatePost, validateReply, filterPosts, hasConfiguration } from './forum-model.js';
import { createForumStore } from './forum-store.js';

const $ = selector => document.querySelector(selector);
const form = $('[data-compose-form]'), feed = $('[data-forum-feed]'), status = $('[data-forum-status]');
const publishButton = form.querySelector('[type=submit]'), draftKey = 'pan-forum-draft:v1';
let store, cursor, more = false, posts = [], busy = false, reportTarget;
const opened = new Set(), replyDrafts = new Map();
const message = (text, error = false) => { status.textContent = text; status.dataset.state = error ? 'error' : 'info'; };
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function fail(error) {
  message(error?.code === 'permission-denied' ? '게시 권한을 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요. 입력한 글은 유지됩니다.' :
    error?.code === 'auth/operation-not-allowed' ? '익명 글쓰기 연결을 준비 중입니다.' :
    error?.code === 'unavailable' ? '연결이 끊겼습니다. 입력한 글을 유지하고 있으니 다시 시도해 주세요.' :
    error?.message || '처리하지 못했습니다. 다시 시도해 주세요.', true);
}
function button(text, action) {
  const node = element('button', 'forum-button secondary', text); node.type = 'button';
  node.addEventListener('click', async () => {
    node.disabled = true;
    try { await action(); } catch (error) { fail(error); } finally { node.disabled = false; }
  });
  return node;
}
const value = () => Object.fromEntries(['title', 'work', 'category', 'body'].map(key => [key, form.elements[key].value]));
function date(value) {
  const parsed = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}
function count() { $('[data-body-count]').textContent = `${form.elements.body.value.length.toLocaleString('ko-KR')} / 20,000`; }
function updatePublish() { publishButton.disabled = !store || busy || !form.elements.consent.checked; }
function displayBody(parent, text) {
  const body = element('div', 'forum-prose');
  for (const paragraph of String(text || '').split(/\n\s*\n/)) body.append(element('p', '', paragraph));
  parent.append(body);
}
async function controls(parent, postId, replyId, deleted) {
  if (!store || deleted) return;
  const row = element('div', 'forum-post-actions');
  row.append(button('신고', () => { reportTarget = { postId, replyId }; $('[data-report-status]').textContent = ''; $('[data-report-dialog]').showModal(); }));
  parent.append(row);
  if (await store.owns(postId, replyId)) row.append(button('내 글 삭제', async () => {
    if (!window.confirm('이 글의 내용을 삭제할까요? 삭제 후 되돌릴 수 없습니다.')) return;
    await store.remove(postId, replyId);
    if (replyId) await loadReplies(postId, parent.closest('[data-thread]'), true);
    else await loadPosts(true);
    message('글을 삭제했습니다.');
  }));
}
async function loadReplies(postId, thread, reset = false) {
  const target = thread.querySelector('[data-replies]'), next = thread.querySelector('[data-more-replies]');
  next.disabled = true;
  try {
    const result = await store.listReplies(postId, reset ? null : thread.cursor);
    if (reset) target.replaceChildren();
    thread.cursor = result.cursor;
    for (const reply of result.items) {
      const item = element('article', 'forum-reply');
      item.append(element('p', 'forum-post-meta', `익명 · ${date(reply.createdAt)}`));
      displayBody(item, reply.status === 'deleted' ? '삭제된 답글입니다.' : reply.body);
      target.append(item); controls(item, postId, reply.id, reply.status === 'deleted').catch(fail);
    }
    if (!target.children.length) target.append(element('p', 'forum-empty', '아직 답글이 없습니다.'));
    next.hidden = !result.more;
  } finally { next.disabled = false; }
}
function threadFor(post) {
  const thread = element('section', 'forum-thread'); thread.dataset.thread = post.id;
  thread.append(element('h3', '', '답글'));
  const replies = element('div'); replies.dataset.replies = '';
  const next = button('답글 더 보기', () => loadReplies(post.id, thread)); next.dataset.moreReplies = ''; next.hidden = true;
  thread.append(replies, next);
  if (post.status !== 'deleted') {
    const replyForm = element('form', 'forum-form forum-reply-form'), label = element('label', '', '답글 내용');
    const input = document.createElement('textarea'); input.rows = 7; input.maxLength = LIMITS.reply; input.required = true; input.name = 'reply';
    input.value = replyDrafts.get(post.id) || ''; input.addEventListener('input', () => replyDrafts.set(post.id, input.value)); label.append(input);
    const consent = element('label', 'forum-consent'), check = document.createElement('input'); check.type = 'checkbox'; check.required = true;
    consent.append(check, document.createTextNode('이 답글을 공개합니다.'));
    const submit = element('button', 'forum-button', '익명으로 답글 남기기'); submit.type = 'submit';
    replyForm.append(label, consent, submit);
    replyForm.addEventListener('submit', async event => {
      event.preventDefault(); if (submit.disabled || !check.checked) return;
      submit.disabled = true;
      try {
        await store.reply(post.id, validateReply(input.value));
        replyDrafts.delete(post.id); replyForm.reset(); message('답글을 공개했습니다.');
        try { await loadReplies(post.id, thread, true); } catch { message('답글은 저장됐지만 목록을 불러오지 못했습니다. 다시 열어 확인해 주세요.', true); }
      } catch (error) { fail(error); } finally { submit.disabled = false; }
    });
    thread.append(replyForm);
  }
  return thread;
}
function render() {
  feed.replaceChildren();
  const filtered = filterPosts(posts, $('[data-category-filter]').value, $('[data-forum-search]').value);
  if (!filtered.length) feed.append(element('p', 'forum-empty', posts.length ? '불러온 글 중 일치하는 감상이 없습니다.' : store ? '아직 공개된 감상이 없습니다.' : '게시글 저장 연결을 준비하고 있습니다.'));
  for (const post of filtered) {
    const article = element('article', 'forum-post'); article.id = 'post-' + post.id;
    const deleted = post.status === 'deleted';
    article.append(element('p', 'forum-post-meta', `${post.category} · 익명 · ${date(post.createdAt)}`), element('h2', '', deleted ? '삭제된 감상' : post.title));
    if (!deleted) article.append(element('p', 'forum-work', post.work));
    const body = element('details', 'forum-post-reading'); body.open = opened.has(post.id);
    body.append(element('summary', '', '감상과 답글 읽기')); displayBody(body, deleted ? '작성자가 삭제한 글입니다.' : post.body);
    article.append(body); feed.append(article); controls(body, post.id, null, deleted).catch(fail);
    let thread;
    const openThread = () => {
      if (!body.open) return opened.delete(post.id);
      opened.add(post.id);
      if (!thread) { thread = threadFor(post); body.append(thread); loadReplies(post.id, thread, true).catch(fail); }
    };
    body.addEventListener('toggle', openThread); if (body.open) openThread();
  }
  $('[data-more-posts]').hidden = !more;
}
async function loadPosts(reset = false) {
  const result = await store.listPosts(reset ? null : cursor);
  posts = reset ? result.items : [...posts, ...result.items.filter(item => !posts.some(p => p.id === item.id))];
  cursor = result.cursor; more = result.more; render();
}
form.addEventListener('input', () => { count(); updatePublish(); });
form.addEventListener('submit', async event => {
  event.preventDefault(); if (!store || busy || !form.elements.consent.checked) return;
  try {
    const post = validatePost(value()); busy = true; updatePublish();
    const id = await store.publish(post); form.reset(); count(); opened.add(id);
    try { localStorage.removeItem(draftKey); } catch { /* Optional local draft storage. */ }
    message('감상을 공개했습니다.');
    try { await loadPosts(true); } catch { message('게시는 완료됐지만 목록을 불러오지 못했습니다. 새로고침해 주세요.', true); }
  } catch (error) { fail(error); } finally { busy = false; updatePublish(); }
});
$('[data-save-draft]').addEventListener('click', () => {
  try { localStorage.setItem(draftKey, JSON.stringify(value())); message('이 기기에 임시 저장했습니다. 다른 방문자에게는 보이지 않습니다.'); }
  catch { message('이 브라우저에서 임시 저장을 사용할 수 없습니다.', true); }
});
$('[data-load-draft]').addEventListener('click', () => {
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey) || 'null'); if (!saved) return message('저장된 초안이 없습니다.');
    if (['title', 'work', 'body'].some(key => form.elements[key].value.trim()) && !window.confirm('입력 중인 내용을 저장된 초안으로 바꿀까요?')) return;
    for (const key of ['title', 'work', 'category', 'body']) if (typeof saved[key] === 'string') form.elements[key].value = saved[key].slice(0, LIMITS[key] || 10);
    count(); message('저장된 초안을 불러왔습니다.');
  } catch { message('초안을 불러오지 못했습니다.', true); }
});
$('[data-preview]').addEventListener('click', () => {
  const preview = $('[data-preview-body]'); preview.replaceChildren(element('h2', '', form.elements.title.value || '제목 없는 감상'), element('p', 'forum-work', form.elements.work.value));
  displayBody(preview, form.elements.body.value); $('[data-preview-dialog]').showModal();
});
document.querySelectorAll('[data-close-dialog]').forEach(node => node.addEventListener('click', () => node.closest('dialog').close()));
$('[data-report-form]').addEventListener('submit', async event => {
  event.preventDefault(); const submit = event.target.querySelector('[type=submit]'); if (!store || submit.disabled) return;
  submit.disabled = true;
  try {
    const reason = event.target.elements.reason.value; if (!REPORT_REASONS.includes(reason)) return;
    await store.report(reportTarget.postId, reportTarget.replyId, reason); $('[data-report-dialog]').close(); message('신고를 관리자에게 전달했습니다.');
  } catch { $('[data-report-status]').textContent = '신고하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'; } finally { submit.disabled = false; }
});
$('[data-category-filter]').addEventListener('change', render); $('[data-forum-search]').addEventListener('input', render);
for (const [selector, reset] of [['[data-more-posts]', false], ['[data-refresh-posts]', true]]) $(selector).addEventListener('click', async event => {
  if (!store) return; event.target.disabled = true;
  try { await loadPosts(reset); } catch (error) { fail(error); } finally { event.target.disabled = false; }
});
count(); updatePublish(); render();
if (hasConfiguration(window.PAN_FORUM_CONFIG)) {
  try {
    store = await createForumStore(window.PAN_FORUM_CONFIG); await loadPosts(true); updatePublish();
    $('[data-connection-state]').textContent = '익명 글쓰기'; $('[data-refresh-posts]').disabled = false;
  } catch (error) { store = null; updatePublish(); fail(error); }
} else {
  $('[data-connection-state]').textContent = '공개 접수 준비 중'; message('게시글 저장 연결 전입니다. 아직 다른 방문자에게 글을 공개할 수 없습니다.');
}
