import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '/tmp/pan-forum-tools/node_modules/@firebase/rules-unit-testing/dist/esm/index.esm.js';
import { doc, getDoc, setDoc, updateDoc, writeBatch, serverTimestamp, Timestamp, collection, query, limit, getDocs } from '/tmp/pan-forum-tools/node_modules/firebase/firestore/dist/esm/index.esm.js';
const env = await initializeTestEnvironment({ projectId: 'demo-paul-forum', firestore: { rules: readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8') } });
const a = env.authenticatedContext('author').firestore(), b = env.authenticatedContext('other').firestore(), publicDb = env.unauthenticatedContext().firestore();
const admin = env.authenticatedContext('moderator', { admin: true }).firestore();
const post = () => ({ title:'감상', work:'작품', category:'미술', body:'가'.repeat(20000), authorName:'익명', status:'published', createdAt:serverTimestamp(), updatedAt:serverTimestamp() });
function publish(db, uid, id, extra = {}) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'anonymousForumPosts', id), { ...post(), ...extra });
  batch.set(doc(db, 'forumAuthors', uid, 'posts', id), { createdAt:serverTimestamp() });
  batch.set(doc(db, 'forumAuthors', uid), { lastWriteAt:serverTimestamp(), writeId:'post:' + id });
  return batch.commit();
}
async function cool(uid) {
  await env.withSecurityRulesDisabled(async c => updateDoc(doc(c.firestore(), 'forumAuthors', uid), { lastWriteAt:Timestamp.fromMillis(Date.now() - 60000) }));
}
const tombstone = () => ({ title:'삭제된 감상', work:'', body:'', status:'deleted', updatedAt:serverTimestamp() });
try {
  await env.clearFirestore();
  await assertSucceeds(publish(a, 'author', 'one'));
  const visible = await assertSucceeds(getDoc(doc(publicDb, 'anonymousForumPosts', 'one')));
  if ('authorUid' in visible.data()) throw new Error('Identity exposed');
  await assertSucceeds(getDocs(query(collection(publicDb, 'anonymousForumPosts'), limit(25))));
  await assertFails(getDocs(collection(publicDb, 'anonymousForumPosts')));
  await assertFails(getDoc(doc(b, 'forumAuthors', 'author', 'posts', 'one')));
  await assertFails(setDoc(doc(b, 'forumAuthors', 'other', 'posts', 'one'), { createdAt:serverTimestamp() }));
  await assertFails(updateDoc(doc(b, 'anonymousForumPosts', 'one'), tombstone()));
  await assertFails(updateDoc(doc(a, 'anonymousForumPosts', 'one'), { body:'edit', updatedAt:serverTimestamp() }));
  await assertFails(publish(a, 'author', 'too-soon'));
  await cool('author');
  await assertFails(publish(a, 'author', 'spoof', { authorName:'운영자' }));
  await assertFails(publish(a, 'author', 'leak', { authorUid:'author' }));
  await assertFails(publish(a, 'author', 'long', { body:'가'.repeat(20001) }));
  await assertFails(publish(a, 'author', 'time', { createdAt:Timestamp.fromMillis(1) }));
  await assertFails(setDoc(doc(a, 'anonymousForumPosts', 'orphan'), post()));
  const reply = writeBatch(b);
  reply.set(doc(b, 'anonymousForumPosts', 'one', 'replies', 'reply'), { body:'답글', authorName:'익명', status:'published', createdAt:serverTimestamp(), updatedAt:serverTimestamp() });
  reply.set(doc(b, 'forumAuthors', 'other', 'replies', 'reply'), { postId:'one', createdAt:serverTimestamp() });
  reply.set(doc(b, 'forumAuthors', 'other'), { lastWriteAt:serverTimestamp(), writeId:'reply:one:reply' });
  await assertSucceeds(reply.commit());
  await assertFails(updateDoc(doc(a, 'anonymousForumPosts', 'one', 'replies', 'reply'), { body:'', status:'deleted', updatedAt:serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(b, 'anonymousForumPosts', 'one', 'replies', 'reply'), { body:'', status:'deleted', updatedAt:serverTimestamp() }));
  await cool('other');
  const report = writeBatch(b);
  report.set(doc(b, 'anonymousForumReports', 'report'), { postId:'one', replyId:'', reason:'기타', reporterUid:'other', createdAt:serverTimestamp() });
  report.set(doc(b, 'forumAuthors', 'other'), { lastWriteAt:serverTimestamp(), writeId:'report:report' });
  await assertSucceeds(report.commit());
  await assertFails(getDoc(doc(publicDb, 'anonymousForumReports', 'report')));
  await assertFails(getDoc(doc(b, 'anonymousForumReports', 'report')));
  await assertSucceeds(getDoc(doc(admin, 'anonymousForumReports', 'report')));
  await assertSucceeds(updateDoc(doc(a, 'anonymousForumPosts', 'one'), tombstone()));
  await assertFails(setDoc(doc(publicDb, 'anonymousForumPosts', 'anonymous'), post()));
  console.log('PASS: public read, long post, private ownership, anti-claim, throttle, field and timestamp validation, replies, private reports, owner deletion');
} finally { await env.cleanup(); }
