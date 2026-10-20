import { validatePost, validateReply, REPORT_REASONS } from './forum-model.js';

export async function createForumStore(config) {
  const sdk = 'https://www.gstatic.com/firebasejs/12.7.0/';
  const appSdk = await import(sdk + 'firebase-app.js');
  const authSdk = await import(sdk + 'firebase-auth.js');
  const f = await import(sdk + 'firebase-firestore.js');
  const app = appSdk.initializeApp(config.firebase, 'pan-anonymous-forum');
  const auth = authSdk.getAuth(app), db = f.getFirestore(app);
  if (config.appCheckSiteKey) {
    const check = await import(sdk + 'firebase-app-check.js');
    check.initializeAppCheck(app, { provider: new check.ReCaptchaV3Provider(config.appCheckSiteKey), isTokenAutoRefreshEnabled: true });
  }
  await auth.authStateReady();
  let signingIn;
  async function identity() {
    if (!auth.currentUser) {
      signingIn ||= authSdk.signInAnonymously(auth).finally(() => { signingIn = null; });
      await signingIn;
    }
    return auth.currentUser.uid;
  }
  const ownerRef = (uid, postId, replyId) => replyId ? f.doc(db, 'forumAuthors', uid, 'replies', replyId) : f.doc(db, 'forumAuthors', uid, 'posts', postId);
  const rateWrite = (batch, uid, writeId) => batch.set(f.doc(db, 'forumAuthors', uid), { lastWriteAt: f.serverTimestamp(), writeId });
  async function page(parent, cursor, ascending = false) {
    const constraints = [f.orderBy('createdAt', ascending ? 'asc' : 'desc')];
    if (cursor) constraints.push(f.startAfter(cursor));
    constraints.push(f.limit(25));
    const snapshot = await f.getDocs(f.query(parent, ...constraints));
    return { items: snapshot.docs.map(item => ({ id: item.id, ...item.data() })), cursor: snapshot.docs.at(-1), more: snapshot.size === 25 };
  }
  return {
    listPosts: cursor => page(f.collection(db, 'anonymousForumPosts'), cursor),
    listReplies: (postId, cursor) => page(f.collection(db, 'anonymousForumPosts', postId, 'replies'), cursor, true),
    async owns(postId, replyId) {
      if (!auth.currentUser) return false;
      return (await f.getDoc(ownerRef(auth.currentUser.uid, postId, replyId))).exists();
    },
    async publish(value) {
      const post = validatePost(value), uid = await identity();
      const ref = f.doc(f.collection(db, 'anonymousForumPosts')), batch = f.writeBatch(db);
      batch.set(ref, { ...post, authorName: '익명', status: 'published', createdAt: f.serverTimestamp(), updatedAt: f.serverTimestamp() });
      batch.set(ownerRef(uid, ref.id), { createdAt: f.serverTimestamp() });
      rateWrite(batch, uid, 'post:' + ref.id);
      await batch.commit(); return ref.id;
    },
    async reply(postId, value) {
      const body = validateReply(value), uid = await identity();
      const ref = f.doc(f.collection(db, 'anonymousForumPosts', postId, 'replies')), batch = f.writeBatch(db);
      batch.set(ref, { body, authorName: '익명', status: 'published', createdAt: f.serverTimestamp(), updatedAt: f.serverTimestamp() });
      batch.set(ownerRef(uid, postId, ref.id), { postId, createdAt: f.serverTimestamp() });
      rateWrite(batch, uid, 'reply:' + postId + ':' + ref.id);
      await batch.commit();
    },
    async remove(postId, replyId) {
      await identity();
      const ref = replyId ? f.doc(db, 'anonymousForumPosts', postId, 'replies', replyId) : f.doc(db, 'anonymousForumPosts', postId);
      const changes = { body: '', status: 'deleted', updatedAt: f.serverTimestamp() };
      if (!replyId) Object.assign(changes, { title: '삭제된 감상', work: '' });
      await f.updateDoc(ref, changes);
    },
    async report(postId, replyId, reason) {
      if (!REPORT_REASONS.includes(reason)) throw new Error('신고 사유를 선택해 주세요.');
      const uid = await identity(), ref = f.doc(f.collection(db, 'anonymousForumReports')), batch = f.writeBatch(db);
      batch.set(ref, { postId, replyId: replyId || '', reason, reporterUid: uid, createdAt: f.serverTimestamp() });
      rateWrite(batch, uid, 'report:' + ref.id);
      await batch.commit();
    },
  };
}
