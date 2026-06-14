import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const config = window.PAN_FORUM_CONFIG || {};
const firebaseConfig = config.firebase || {};
const adminEmail = (config.adminEmail || "").trim().toLowerCase();
const requiredFirebaseKeys = ["apiKey", "authDomain", "projectId", "appId"];
const hasFirebaseConfig = requiredFirebaseKeys.every((key) => Boolean(firebaseConfig[key]));

const elements = {
  authForm: document.querySelector("[data-auth-form]"),
  authEmail: document.querySelector("[data-auth-email]"),
  authPassword: document.querySelector("[data-auth-password]"),
  authName: document.querySelector("[data-auth-name]"),
  authState: document.querySelector("[data-auth-state]"),
  loginButton: document.querySelector("[data-login-button]"),
  signupButton: document.querySelector("[data-signup-button]"),
  logoutButton: document.querySelector("[data-logout-button]"),
  composeForm: document.querySelector("[data-compose-form]"),
  composeTitle: document.querySelector("[data-compose-title]"),
  composeCategory: document.querySelector("[data-compose-category]"),
  composeBody: document.querySelector("[data-compose-body]"),
  composeHint: document.querySelector("[data-compose-hint]"),
  feed: document.querySelector("[data-forum-feed]"),
  status: document.querySelector("[data-forum-status]"),
  setupNotice: document.querySelector("[data-setup-notice]")
};

const fallbackPosts = [
  {
    id: "welcome",
    title: "자유게시판 준비 중",
    category: "공지",
    body: "회원가입과 글쓰기는 Firebase 설정을 연결하면 바로 열립니다. 지금 화면은 포럼의 공개 형태를 먼저 보여주는 준비 모드입니다.",
    authorName: "Paul Archive Notes",
    pinned: true,
    createdAt: new Date("2026-06-09T00:00:00+09:00")
  },
  {
    id: "reading-room",
    title: "오늘의 책장 옆에 붙일 작은 방",
    category: "책",
    body: "여기에는 방문자가 책, 음반, 그림에 관해 짧은 메모를 남기게 됩니다. 글쓰기는 회원에게만 열고, 삭제와 고정은 관리자만 다룹니다.",
    authorName: "Paul Archive Notes",
    pinned: false,
    createdAt: new Date("2026-06-09T00:10:00+09:00")
  }
];

let app = null;
let auth = null;
let db = null;
let currentUser = null;
let unsubscribePosts = null;

function setStatus(message, type = "info") {
  if (!elements.status) return;
  elements.status.textContent = message;
  elements.status.dataset.state = type;
}

function isAdmin(user = currentUser) {
  return Boolean(user && adminEmail && user.email && user.email.toLowerCase() === adminEmail);
}

function formatDate(value) {
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : null;
  if (!date) return "방금 전";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function setFieldsDisabled(form, disabled) {
  if (!form) return;
  form.querySelectorAll("input, select, textarea, button").forEach((field) => {
    field.disabled = disabled;
  });
}

function renderAuthState() {
  if (!elements.authState) return;

  if (!hasFirebaseConfig) {
    elements.authState.innerHTML = '<span class="forum-badge muted">설정 대기</span><strong>회원 시스템 미연결</strong>';
    setFieldsDisabled(elements.authForm, true);
    elements.logoutButton.hidden = true;
    return;
  }

  setFieldsDisabled(elements.authForm, Boolean(currentUser));
  elements.logoutButton.hidden = !currentUser;

  if (!currentUser) {
    elements.authState.innerHTML = '<span class="forum-badge muted">Guest</span><strong>읽기는 열려 있습니다</strong>';
    return;
  }

  const label = isAdmin() ? "Admin" : "Member";
  const badgeClass = isAdmin() ? "admin" : "member";
  const name = currentUser.displayName || currentUser.email || "회원";
  elements.authState.innerHTML = "";

  const badge = document.createElement("span");
  badge.className = `forum-badge ${badgeClass}`;
  badge.textContent = label;

  const strong = document.createElement("strong");
  strong.textContent = name;

  elements.authState.append(badge, strong);
}

function updateComposeState() {
  const canWrite = Boolean(hasFirebaseConfig && currentUser);
  setFieldsDisabled(elements.composeForm, !canWrite);

  if (!elements.composeHint) return;
  if (!hasFirebaseConfig) {
    elements.composeHint.textContent = "Firebase 설정을 연결하면 회원가입한 사람만 글을 쓸 수 있습니다.";
  } else if (!currentUser) {
    elements.composeHint.textContent = "글쓰기는 로그인한 회원에게만 열립니다.";
  } else {
    elements.composeHint.textContent = "로그인 확인 완료. 게시글은 공개 포럼에 바로 올라갑니다.";
  }
}

function createPostElement(post) {
  const article = document.createElement("article");
  article.className = "forum-post";
  if (post.pinned) article.classList.add("is-pinned");

  const top = document.createElement("div");
  top.className = "forum-post-top";

  const label = document.createElement("span");
  label.className = "forum-badge";
  label.textContent = post.pinned ? "고정" : post.category || "자유";

  const meta = document.createElement("span");
  meta.className = "forum-post-meta";
  meta.textContent = `${post.authorName || "회원"} · ${formatDate(post.createdAt)}`;

  top.append(label, meta);

  const title = document.createElement("h2");
  title.textContent = post.title || "제목 없음";

  const body = document.createElement("p");
  body.className = "forum-post-body";
  body.textContent = post.body || "";

  article.append(top, title, body);

  if (hasFirebaseConfig && isAdmin() && post.id) {
    const actions = document.createElement("div");
    actions.className = "forum-post-actions";

    const pinButton = document.createElement("button");
    pinButton.type = "button";
    pinButton.className = "forum-mini-button";
    pinButton.textContent = post.pinned ? "고정 해제" : "고정";
    pinButton.addEventListener("click", () => togglePinned(post));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "forum-mini-button danger";
    deleteButton.textContent = "삭제";
    deleteButton.addEventListener("click", () => removePost(post));

    actions.append(pinButton, deleteButton);
    article.append(actions);
  }

  return article;
}

function renderPosts(posts) {
  if (!elements.feed) return;
  elements.feed.innerHTML = "";

  if (!posts.length) {
    const empty = document.createElement("div");
    empty.className = "forum-empty";
    empty.textContent = "아직 게시글이 없습니다.";
    elements.feed.append(empty);
    return;
  }

  posts
    .slice()
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)))
    .forEach((post) => elements.feed.append(createPostElement(post)));
}

async function handleAuth(mode) {
  const email = elements.authEmail.value.trim();
  const password = elements.authPassword.value;
  const displayName = elements.authName.value.trim();

  if (!email || !password) {
    setStatus("이메일과 비밀번호를 입력해주세요.", "error");
    return;
  }

  try {
    setStatus(mode === "signup" ? "회원가입 중입니다." : "로그인 중입니다.");
    if (mode === "signup") {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) {
        await updateProfile(credential.user, { displayName });
      }
      setStatus("회원가입이 완료되었습니다. 이제 글을 쓸 수 있습니다.", "success");
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      setStatus("로그인되었습니다.", "success");
    }
    elements.authForm.reset();
  } catch (error) {
    setStatus(error.message || "인증 처리 중 오류가 발생했습니다.", "error");
  }
}

async function handleCompose(event) {
  event.preventDefault();
  if (!currentUser) {
    setStatus("로그인한 회원만 글을 쓸 수 있습니다.", "error");
    return;
  }

  const title = elements.composeTitle.value.trim();
  const category = elements.composeCategory.value;
  const body = elements.composeBody.value.trim();

  if (!title || !body) {
    setStatus("제목과 내용을 입력해주세요.", "error");
    return;
  }

  try {
    setStatus("게시글을 올리는 중입니다.");
    await addDoc(collection(db, "forumPosts"), {
      title,
      category,
      body,
      authorUid: currentUser.uid,
      authorName: currentUser.displayName || "회원",
      pinned: false,
      status: "published",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    elements.composeForm.reset();
    setStatus("게시글이 올라갔습니다.", "success");
  } catch (error) {
    setStatus(error.message || "게시글을 저장하지 못했습니다.", "error");
  }
}

async function togglePinned(post) {
  try {
    await updateDoc(doc(db, "forumPosts", post.id), {
      pinned: !post.pinned,
      updatedAt: serverTimestamp()
    });
    setStatus(post.pinned ? "고정을 해제했습니다." : "게시글을 고정했습니다.", "success");
  } catch (error) {
    setStatus(error.message || "관리자 작업을 완료하지 못했습니다.", "error");
  }
}

async function removePost(post) {
  try {
    await deleteDoc(doc(db, "forumPosts", post.id));
    setStatus("게시글을 삭제했습니다.", "success");
  } catch (error) {
    setStatus(error.message || "삭제하지 못했습니다.", "error");
  }
}

function subscribePosts() {
  const postsQuery = query(collection(db, "forumPosts"), orderBy("createdAt", "desc"));
  unsubscribePosts = onSnapshot(
    postsQuery,
    (snapshot) => {
      const posts = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderPosts(posts);
    },
    (error) => {
      setStatus(error.message || "게시글을 불러오지 못했습니다.", "error");
      renderPosts(fallbackPosts);
    }
  );
}

function initializeForum() {
  if (!hasFirebaseConfig) {
    if (elements.setupNotice) elements.setupNotice.hidden = false;
    renderPosts(fallbackPosts);
    renderAuthState();
    updateComposeState();
    setStatus("포럼 화면은 준비되었습니다. Firebase 설정을 넣으면 회원제 글쓰기가 켜집니다.");
    return;
  }

  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  if (elements.setupNotice) elements.setupNotice.hidden = true;

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    renderAuthState();
    updateComposeState();
  });

  subscribePosts();
  setStatus(adminEmail ? "회원제 포럼이 연결되었습니다." : "관리자 이메일을 설정하면 Admin 권한 표시가 켜집니다.");
}

elements.loginButton?.addEventListener("click", () => handleAuth("login"));
elements.signupButton?.addEventListener("click", () => handleAuth("signup"));
elements.authForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  handleAuth("login");
});
elements.logoutButton?.addEventListener("click", async () => {
  await signOut(auth);
  setStatus("로그아웃되었습니다.");
});
elements.composeForm?.addEventListener("submit", handleCompose);

window.addEventListener("beforeunload", () => {
  if (unsubscribePosts) unsubscribePosts();
});

initializeForum();
