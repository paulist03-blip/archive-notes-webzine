import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const require = createRequire('/tmp/pan-forum-tools/package.json');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, signInAnonymously, deleteUser } = require('firebase/auth');
const { getFirestore, collection, query, limit, getDocs, getDoc, doc, setDoc, terminate } = require('firebase/firestore');
const sandbox = { window: {} };
vm.runInNewContext(readFileSync(new URL('../assets/forum-config.js', import.meta.url), 'utf8'), sandbox);
const config = sandbox.window.PAN_FORUM_CONFIG.firebase;
assert.equal(config.projectId, 'paul-archive-notes-forum');
const app = initializeApp(config, 'forum-live-access-check'), auth = getAuth(app), db = getFirestore(app);
let user;
async function denied(operation) {
  await assert.rejects(operation, error => error.code === 'permission-denied');
}
try {
  const posts = await getDocs(query(collection(db, 'anonymousForumPosts'), limit(25)));
  await denied(getDocs(query(collection(db, 'anonymousForumReports'), limit(1))));
  user = (await signInAnonymously(auth)).user;
  assert.equal(user.isAnonymous, true);
  await denied(getDoc(doc(db, 'forumAuthors', 'not-this-test-user')));
  await denied(getDoc(doc(db, 'anonymousForumReports', 'access-check-missing')));
  await denied(setDoc(doc(db, 'anonymousForumPosts', 'invalid-access-check'), { title:'운영 점검: 저장되면 안 되는 잘못된 요청' }));
  console.log(JSON.stringify({ passed:true, anonymousAuth:true, publicRead:true, visiblePosts:posts.size, privateOwnershipDenied:true, reportsDenied:true, invalidWriteDenied:true, publicTestPostsCreated:0 }));
} finally {
  if (user) await deleteUser(user);
  await terminate(db); await deleteApp(app);
}
