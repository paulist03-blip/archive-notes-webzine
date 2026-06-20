import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
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
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const articleLayout = document.querySelector(".article-layout");
const articleShell = document.querySelector(".article-shell");

if (articleLayout && articleShell) {
  initializeArticleComments();
}

function initializeArticleComments() {
  const config = window.PAN_FORUM_CONFIG || {};
  const firebaseConfig = config.firebase || {};
  const adminEmail = (config.adminEmail || "").trim().toLowerCase();
  const requiredFirebaseKeys = ["apiKey", "authDomain", "projectId", "appId"];
  const hasFirebaseConfig = requiredFirebaseKeys.every((key) => Boolean(firebaseConfig[key]));
  const articlePath = getArticlePath();
  const articleTitle = document.querySelector(".article h1")?.textContent?.trim() || document.title;
  const threadId = getThreadId(articlePath);
  const section = createCommentsSection();
  const elements = getElements(section);

  let app = null;
  let auth = null;
  let db = null;
  let currentUser = null;
  let currentComments = [];
  let unsubscribeComments = null;

  articleShell.append(section);

  function setStatus(message, type = "info") {
    elements.status.textContent = message;
    elements.status.dataset.state = type;
  }

  function isAdmin(user = currentUser) {
    return Boolean(user && adminEmail && user.email && user.email.toLowerCase() === adminEmail);
  }

  function canDelete(comment) {
    return Boolean(currentUser && (isAdmin() || comment.authorUid === currentUser.uid));
  }

  function setFieldsDisabled(form, disabled) {
    form?.querySelectorAll("input, textarea, button").forEach((field) => {
      field.disabled = disabled;
    });
  }

  function renderAuthState() {
    elements.authState.innerHTML = "";

    if (!hasFirebaseConfig) {
      const badge = createBadge("설정 대기", "muted");
      const strong = document.createElement("strong");
      strong.textContent = "회원 댓글 시스템 미연결";
      elements.authState.append(badge, strong);
      elements.logoutButton.hidden = true;
      setFieldsDisabled(elements.authForm, true);
      return;
    }

    setFieldsDisabled(elements.authForm, Boolean(currentUser));
    elements.logoutButton.hidden = !currentUser;

    if (!currentUser) {
      const badge = createBadge("Guest", "muted");
      const strong = document.createElement("strong");
      strong.textContent = "읽기는 모두에게 열려 있습니다";
      elements.authState.append(badge, strong);
      return;
    }

    const badge = createBadge(isAdmin() ? "Admin" : "Member", isAdmin() ? "admin" : "member");
    const strong = document.createElement("strong");
    strong.textContent = currentUser.displayName || currentUser.email || "회원";
    elements.authState.append(badge, strong);
  }

  function updateCommentFormState() {
    const canWrite = Boolean(hasFirebaseConfig && currentUser);
    setFieldsDisabled(elements.commentForm, !canWrite);

    if (!hasFirebaseConfig) {
      elements.hint.textContent = "Firebase 설정을 연결하면 로그인한 회원이 이 글에 직접 댓글을 달 수 있습니다.";
    } else if (!currentUser) {
      elements.hint.textContent = "댓글은 로그인한 회원에게만 열립니다.";
    } else {
      elements.hint.textContent = "댓글은 이 글 아래에 공개로 표시됩니다.";
    }
  }

  function renderComments(comments) {
    currentComments = comments;
    elements.list.innerHTML = "";
    elements.count.textContent = String(comments.length);

    if (!hasFirebaseConfig) {
      elements.list.append(createEmptyState("댓글 공간은 준비되었습니다. Firebase 설정을 연결하면 실제 댓글이 저장됩니다."));
      return;
    }

    if (!comments.length) {
      elements.list.append(createEmptyState("아직 댓글이 없습니다. 첫 문장을 남겨주세요."));
      return;
    }

    comments.forEach((comment) => elements.list.append(createCommentElement(comment)));
  }

  function createCommentElement(comment) {
    const article = document.createElement("article");
    article.className = "comment-item";

    const top = document.createElement("div");
    top.className = "comment-item-top";

    const author = document.createElement("strong");
    author.textContent = comment.authorName || "회원";

    const meta = document.createElement("span");
    meta.textContent = formatDate(comment.createdAt);

    top.append(author, meta);

    const body = document.createElement("p");
    body.textContent = comment.body || "";

    article.append(top, body);

    if (canDelete(comment)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "comment-delete-button";
      button.textContent = "삭제";
      button.addEventListener("click", () => removeComment(comment));
      article.append(button);
    }

    return article;
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
        await updateProfile(credential.user, { displayName: displayName || email.split("@")[0] });
        setStatus("회원가입이 완료되었습니다. 이제 댓글을 쓸 수 있습니다.", "success");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        setStatus("로그인되었습니다.", "success");
      }
      elements.authForm.reset();
    } catch (error) {
      setStatus(error.message || "인증 처리 중 오류가 발생했습니다.", "error");
    }
  }

  async function handleCommentSubmit(event) {
    event.preventDefault();

    if (!currentUser) {
      setStatus("로그인한 회원만 댓글을 쓸 수 있습니다.", "error");
      return;
    }

    const body = elements.commentBody.value.trim();

    if (!body) {
      setStatus("댓글 내용을 입력해주세요.", "error");
      return;
    }

    if (body.length > 1200) {
      setStatus("댓글은 1200자 이내로 남겨주세요.", "error");
      return;
    }

    try {
      setStatus("댓글을 저장하는 중입니다.");
      await addDoc(collection(db, "articleComments", threadId, "items"), {
        articlePath,
        articleTitle,
        body,
        authorUid: currentUser.uid,
        authorName: currentUser.displayName || "회원",
        status: "published",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      elements.commentForm.reset();
      setStatus("댓글이 올라갔습니다.", "success");
    } catch (error) {
      setStatus(error.message || "댓글을 저장하지 못했습니다.", "error");
    }
  }

  async function removeComment(comment) {
    const confirmed = window.confirm("이 댓글을 삭제할까요?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "articleComments", threadId, "items", comment.id));
      setStatus("댓글을 삭제했습니다.", "success");
    } catch (error) {
      setStatus(error.message || "댓글을 삭제하지 못했습니다.", "error");
    }
  }

  function subscribeComments() {
    const commentsQuery = query(collection(db, "articleComments", threadId, "items"), orderBy("createdAt", "asc"));
    unsubscribeComments = onSnapshot(
      commentsQuery,
      (snapshot) => {
        renderComments(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      },
      (error) => {
        setStatus(error.message || "댓글을 불러오지 못했습니다.", "error");
        renderComments([]);
      }
    );
  }

  elements.loginButton.addEventListener("click", () => handleAuth("login"));
  elements.signupButton.addEventListener("click", () => handleAuth("signup"));
  elements.authForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleAuth("login");
  });
  elements.logoutButton.addEventListener("click", async () => {
    await signOut(auth);
    setStatus("로그아웃되었습니다.");
  });
  elements.commentForm.addEventListener("submit", handleCommentSubmit);
  window.addEventListener("beforeunload", () => {
    if (unsubscribeComments) unsubscribeComments();
  });

  if (!hasFirebaseConfig) {
    elements.setupNotice.hidden = false;
    renderAuthState();
    updateCommentFormState();
    renderComments([]);
    setStatus("댓글 화면은 준비되었습니다. Firebase 설정을 넣으면 회원 댓글이 켜집니다.");
    return;
  }

  app = getApps()[0] || initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  elements.setupNotice.hidden = true;

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    renderAuthState();
    updateCommentFormState();
    renderComments(currentComments);
  });

  subscribeComments();
  setStatus("이 글의 댓글을 불러오는 중입니다.");
}

function createCommentsSection() {
  const section = document.createElement("section");
  section.className = "article-comments";
  section.setAttribute("aria-labelledby", "article-comments-title");
  section.innerHTML = `
    <div class="article-comments-head">
      <div>
        <p class="section-kicker">Comments</p>
        <h2 id="article-comments-title">댓글</h2>
      </div>
      <span class="comment-count"><strong data-comment-count>0</strong>개</span>
    </div>

    <div class="comment-auth-card">
      <div class="comment-auth-state" data-comment-auth-state></div>
      <form class="comment-auth-form" data-comment-auth-form>
        <label>
          이메일
          <input data-comment-auth-email type="email" autocomplete="email" />
        </label>
        <label>
          비밀번호
          <input data-comment-auth-password type="password" autocomplete="current-password" minlength="6" />
        </label>
        <label>
          필명
          <input data-comment-auth-name type="text" autocomplete="nickname" />
        </label>
        <div class="comment-button-row">
          <button class="comment-button" type="button" data-comment-login-button>로그인</button>
          <button class="comment-button secondary" type="button" data-comment-signup-button>회원가입</button>
        </div>
      </form>
      <button class="comment-button secondary full" type="button" data-comment-logout-button hidden>로그아웃</button>
      <div class="comment-setup" data-comment-setup hidden>
        <strong>설정 대기</strong>
        <p>Firebase 프로젝트 정보를 연결하면 모든 글에 회원 댓글이 바로 작동합니다.</p>
      </div>
    </div>

    <form class="comment-form" data-comment-form>
      <label>
        댓글
        <textarea data-comment-body rows="4" maxlength="1200" placeholder="이 글에 관해 남기고 싶은 문장을 적어주세요."></textarea>
      </label>
      <div class="comment-form-footer">
        <p data-comment-hint></p>
        <button class="comment-button" type="submit">댓글 등록</button>
      </div>
    </form>

    <div class="comment-status" data-comment-status role="status" aria-live="polite"></div>
    <div class="comment-list" data-comment-list aria-live="polite"></div>
  `;
  return section;
}

function getElements(section) {
  return {
    authForm: section.querySelector("[data-comment-auth-form]"),
    authEmail: section.querySelector("[data-comment-auth-email]"),
    authPassword: section.querySelector("[data-comment-auth-password]"),
    authName: section.querySelector("[data-comment-auth-name]"),
    authState: section.querySelector("[data-comment-auth-state]"),
    loginButton: section.querySelector("[data-comment-login-button]"),
    signupButton: section.querySelector("[data-comment-signup-button]"),
    logoutButton: section.querySelector("[data-comment-logout-button]"),
    setupNotice: section.querySelector("[data-comment-setup]"),
    commentForm: section.querySelector("[data-comment-form]"),
    commentBody: section.querySelector("[data-comment-body]"),
    hint: section.querySelector("[data-comment-hint]"),
    status: section.querySelector("[data-comment-status]"),
    list: section.querySelector("[data-comment-list]"),
    count: section.querySelector("[data-comment-count]")
  };
}

function getArticlePath() {
  const pathname = decodeURIComponent(window.location.pathname);
  const postMatch = pathname.match(/\/posts\/([^/]+)$/);
  if (postMatch) return `posts/${postMatch[1]}`;
  return pathname.replace(/\/index\.html$/, "/");
}

function getThreadId(articlePath) {
  let hash = 2166136261;
  for (let index = 0; index < articlePath.length; index += 1) {
    hash ^= articlePath.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const slug = articlePath
    .split("/")
    .pop()
    .replace(/\.html$/i, "")
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 46);

  return `post_${(hash >>> 0).toString(36)}_${slug || "article"}`;
}

function createBadge(text, state) {
  const badge = document.createElement("span");
  badge.className = `forum-badge ${state}`;
  badge.textContent = text;
  return badge;
}

function createEmptyState(message) {
  const empty = document.createElement("div");
  empty.className = "comment-empty";
  empty.textContent = message;
  return empty;
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
