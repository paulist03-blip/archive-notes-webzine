(function () {
  var SOURCE_LANGUAGE = "ko";
  var TARGET_LANGUAGE = "en";
  var STORAGE_KEY = "paulArchiveLanguage";
  var STYLE_ID = "paul-archive-language-style";
  var CACHE_KEY = "paulArchiveTranslations:v2";
  var MAX_ITEMS_PER_REQUEST = 32;
  var MAX_CHARS_PER_REQUEST = 4800;
  var MAX_CACHE_CHARS = 900000;
  var REVIEW_SENTENCE_PATTERNS = [
    /(알라딘|YES24|교보문고?|국회도서관|Presto(?: Music)?|Qobuz|Apple Music|Warner Classics|Decca Classics|DG 공식 카탈로그|공개 서지|로컬(?:\s+[A-Za-z가-힣]+)?|보유 데이터|재고|품목|카탈로그|바코드|ItemId)[^.!?]*[.!?]/gi,
    /ISBN\s*[0-9Xx-]+[^.!?]*[.!?]/gi,
    /(?:수입반|중고-?최상|중고|최상 상태|양장본?|반양장|전\s*\d+\s*권|\d+\s*쪽|판형)[^.!?]*[.!?]/gi,
    /(?:서지상으로는|소장자의 노트는 분명하다|소장자의 관점에서는|로컬 Bernstein Record Room 자료는|로컬 Bernstein Record Room 자료와)[^.!?]*[.!?]/gi
  ];
  var EXCLUDED_SELECTOR = [
    ".notranslate",
    ".pan-language-switcher",
    "script",
    "style",
    "noscript",
    "svg",
    "canvas",
    "textarea",
    "input",
    "[contenteditable]",
    "pre",
    "code"
  ].join(",");

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".pan-language-switcher{display:inline-flex;align-items:center;gap:3px;padding:3px;border:1px solid rgba(23,23,23,.2);border-radius:999px;background:rgba(255,253,248,.94);box-shadow:0 8px 24px rgba(23,23,23,.08);font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;line-height:1;z-index:1000;white-space:nowrap}",
      ".pan-language-switcher button{appearance:none;border:0;border-radius:999px;background:transparent;color:#5c554b;cursor:pointer;font:inherit;font-size:.68rem;font-weight:780;letter-spacing:0;padding:6px 8px;text-transform:uppercase;min-height:30px}",
      ".pan-language-switcher button[aria-pressed=true]{background:#171717;color:#fffdf8}",
      ".pan-language-switcher button:focus-visible{outline:2px solid #9b3f34;outline-offset:2px}",
      ".pan-language-switcher[data-state=loading] [data-language=en]{opacity:.65}",
      ".pan-language-switcher[data-state=error]{border-color:#9b3f34}",
      ".pan-language-switcher [hidden]{display:none!important}",
      ".pan-language-status{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}",
      ".pan-language-switcher button[data-language-retry]{font-size:18px;padding:4px 7px;color:#9b3f34}",
      "html[lang=en] .article-body,html[lang=en] .article h1,html[lang=en] .issue-pagination-title{word-break:normal;overflow-wrap:anywhere}",
      ".masthead .nav{position:relative}",
      ".masthead .nav>.pan-language-switcher{left:22px;position:absolute;top:50%;transform:translateY(-50%)}",
      "body.pan-language-ready .masthead .nav-links{padding-left:172px}",
      ".pan-language-bar{display:flex;justify-content:flex-end;padding:8px 14px;border-bottom:1px solid rgba(23,23,23,.14)}",
      "@media (max-width:900px){.masthead .nav>.pan-language-switcher{grid-column:1;grid-row:2;justify-self:start;position:static;transform:none}body.pan-language-ready .masthead .nav-links{padding-left:0}.pan-language-switcher{box-shadow:none}.pan-language-switcher button{font-size:.62rem;padding:6px 7px}}",
      "@media (max-width:380px){.pan-language-switcher button{font-size:.58rem;padding:5px 6px}}"
    ].join("\n");
    document.head.appendChild(style);
  }

  function normalizeText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")")
      .trim();
  }

  function textContentOf(selector) {
    var node = document.querySelector(selector);
    return node ? normalizeText(node.textContent) : "";
  }

  function detectReviewMode() {
    var context = [
      textContentOf(".article .eyebrow"),
      textContentOf(".article-signoff"),
      textContentOf(".article-meta")
    ].join(" ");

    if (/오늘의 책|Book note|Archive · Books|Issue \d+ · Books|Book review board|게시판 리뷰|Contribution/i.test(context) && !/오늘의 그림|Image note/i.test(context)) {
      return "book";
    }

    if (/오늘의 음반|Record note|Archive · Records|Issue \d+ · Records|Bernstein Record Room/i.test(context)) {
      return "record";
    }

    if (
      document.querySelector('link[href*="report.css"]') &&
      document.querySelector(".cover-frame img[alt*='표지']")
    ) {
      return "book";
    }

    return null;
  }

  function isBibliographicPart(part) {
    return /^(?:ISBN|ItemId)/i.test(part) ||
      /(?:전\s*\d+\s*권|양장본?|반양장|개정판|\d+\s*쪽|UHQCD|SHM-CD|SACD|MQA|Hybrid|\d+CD|수입반|중고|최상|상태)/i.test(part) ||
      /^[A-Z]{2,}[- ]?\d[\w-]*$/i.test(part);
  }

  function sanitizeMetaText(text, mode) {
    var parts = String(text || "")
      .split(/[·|]/)
      .map(function (part) {
        return normalizeText(part);
      })
      .filter(Boolean)
      .filter(function (part) {
        return !isBibliographicPart(part);
      });

    if (mode === "book" && parts.length > 4) {
      parts = parts.slice(0, 4);
    }

    if (mode === "record" && parts.length > 5) {
      parts = parts.slice(0, 5);
    }

    return normalizeText(parts.join(" · "));
  }

  function sanitizeParagraphHtml(html) {
    var cleaned = String(html || "");
    REVIEW_SENTENCE_PATTERNS.forEach(function (pattern) {
      cleaned = cleaned.replace(pattern, " ");
    });
    return normalizeText(cleaned);
  }

  function isEmptyHtml(html) {
    var probe = document.createElement("div");
    probe.innerHTML = html;
    return !normalizeText(probe.textContent);
  }

  function cleanDisplayText(text) {
    return normalizeText(
      String(text || "")
        .replace(/\b(?:\d+)?(?:UHQCD|SHM-CD|SACD(?:\s*Hybrid)?|MQA)\b/gi, "")
        .replace(/\b\d+CD\b/gi, "")
        .replace(/\b(?:중고-?최상|중고|최상 상태|양장본?)\b/gi, "")
        .replace(/\b전\s*\d+\s*권\b/gi, "")
        .replace(/\bISBN\s*[0-9Xx-]+\b/gi, "")
        .replace(/\b(?:DG|Decca|Warner|Universal Music Japan)?\s*(?:UHQCD|SHM-CD|SACD(?:\s*Hybrid)?)\s*판본\b/gi, "녹음")
        .replace(/\b(?:UHQCD|SHM-CD|SACD(?:\s*Hybrid)?|판본)\b/gi, "")
    );
  }

  function sanitizeReviewPage(mode) {
    if (!mode) {
      return;
    }

    document.querySelectorAll(".article-meta").forEach(function (node) {
      node.textContent = sanitizeMetaText(node.textContent, mode);
    });

    document.querySelectorAll(".bibliography:not([data-language-preserve])").forEach(function (node) {
      node.remove();
    });

    document.querySelectorAll(".article-side .article-note").forEach(function (node) {
      node.remove();
    });

    document.querySelectorAll(".article-body p").forEach(function (paragraph) {
      if (paragraph.classList.contains("article-signoff")) {
        return;
      }

      var rawText = normalizeText(paragraph.textContent);
      if (!rawText) {
        return;
      }

      if (/소장자의|소장 노트|소장 메모/.test(rawText)) {
        paragraph.remove();
        return;
      }

      var cleanedHtml = sanitizeParagraphHtml(paragraph.innerHTML);
      if (isEmptyHtml(cleanedHtml)) {
        paragraph.remove();
        return;
      }

      paragraph.innerHTML = cleanedHtml;
    });

    document.querySelectorAll(".article-cover img, .archive-row img, .thumb img").forEach(function (image) {
      image.alt = cleanDisplayText(image.alt);
    });

    document.querySelectorAll(".source-list a").forEach(function (link) {
      var href = link.getAttribute("href") || "";
      var text = normalizeText(link.textContent);
      if (/(yes24|aladin|kyobobook|google\.com\/books|nanam\.net)/i.test(href) || /서지|품목|기록/.test(text)) {
        link.remove();
      }
    });

    document.querySelectorAll(".side-block").forEach(function (block) {
      var linkCount = block.querySelectorAll("a").length;
      var hasSourceList = !!block.querySelector(".source-list");
      if (hasSourceList && linkCount === 0) {
        block.remove();
      }
    });
  }

  function sanitizeArchiveSurface() {
    document.querySelectorAll(".archive-row p, .archive-row h3, .book-card-meta, .book-card-body p, .book-daily-body .book-card-meta").forEach(function (node) {
      node.textContent = cleanDisplayText(node.textContent);
    });

    document.querySelectorAll("a.book-secondary-link").forEach(function (link) {
      if (normalizeText(link.textContent) === "서지 확인") {
        link.textContent = "외부 링크";
      }
    });
  }

  function sanitizeSiteChrome() {
    document.querySelectorAll("a").forEach(function (link) {
      var label = normalizeText(link.textContent);
      if (label === "알라딘 책 서가" || label === "알라딘 책 작업 서가") {
        link.textContent = "기준 서가";
      }
      if (label === "알라딘 음반 서가") {
        link.textContent = "기준 음반 목록";
      }
    });

    document.querySelectorAll(".pill").forEach(function (pill) {
      var label = normalizeText(pill.textContent);
      if ([
        "고해상도 표지 우선",
        "거래 세부 문구 비노출",
        "판본 확인 비노출",
        "오늘의 책장 선별",
        "상세 리뷰 확장"
      ].indexOf(label) >= 0) {
        pill.remove();
      }
    });
  }

  function sanitizeContentPolicy() {
    sanitizeReviewPage(detectReviewMode());
    sanitizeArchiveSurface();
    sanitizeSiteChrome();
  }

  var UI_TRANSLATIONS = {
    "폴의 독서실": "Paul's Reading Room",
    "글": "Essays", "미술": "Art", "음반": "Music", "책": "Books", "포럼": "Forum",
    "아카이브": "Archive", "전체 아카이브": "Full archive", "북아카이브": "Book archive",
    "오늘의 책": "Today's books", "오늘의 책장": "Today's bookshelf", "오늘의 음반": "Today's recording",
    "오늘의 그림": "Today's artwork", "오늘의 기고": "Contributions", "오늘의 이미지": "Today's image",
    "장문 리뷰": "Long-form essay", "장문 리뷰 읽기": "Read the essay", "원고 준비 중": "Essay forthcoming",
    "전체 주제": "All subjects", "제목, 저자, 출판사로 찾기": "Search by title, author, or publisher",
    "검색 조건에 맞는 책이 없습니다.": "No books match your search.", "주제": "Subject",
    "참고 자료": "Sources", "참고 링크": "References", "함께 듣고 읽기": "Further listening and reading",
    "이전 호와 다음 호": "Previous and next issues", "리뷰 완료": "Reviewed", "리뷰 읽기": "Read the review",
    "외부 링크": "External link", "기준 서가": "Source bookshelf", "기준 음반 목록": "Source recordings",
    "철학": "Philosophy", "역사": "History", "문학": "Literature", "예술": "Art",
    "음악": "Music", "과학": "Science", "사회": "Society", "종교": "Religion",
    "정치": "Politics", "심리": "Psychology", "심리학": "Psychology", "인문": "Humanities",
    "로그인": "Sign in", "로그아웃": "Sign out", "회원가입": "Sign up", "이메일": "Email",
    "비밀번호": "Password", "닉네임": "Display name", "제목": "Title", "내용": "Body",
    "자유": "General", "공지": "Announcements", "글쓰기": "Write a post", "글 올리기": "Publish",
    "삭제": "Delete", "고정": "Pinned", "고정 해제": "Unpin"
  };
  var records = new Set();
  var textRecords = new WeakMap();
  var attributeRecords = new WeakMap();
  var memory = new Map();
  var language = SOURCE_LANGUAGE;
  var switcher;
  var generation = 0;
  var worker = null;
  var failed = false;
  var refreshTimer;
  var nextId = 0;
  var seenBlocks = new WeakSet();
  var nearBlocks = new WeakSet();
  var lazySelector = ".archive-row,.book-card,.book-daily-card,.forum-post";
  var contextSelector = "p,li,h1,h2,h3,h4,h5,h6,figcaption,button,label,option,.article-meta,.book-card-meta,.issue-pagination-title";
  var attributeNames = ["placeholder", "title", "alt", "aria-label"];

  function safeStorage(method, key, value) {
    try { return localStorage[method](key, value); } catch (error) { return null; }
  }

  function getStoredLanguage() {
    var saved = safeStorage("getItem", STORAGE_KEY);
    if (saved !== SOURCE_LANGUAGE && saved !== TARGET_LANGUAGE) {
      var cookie;
      try { cookie = document.cookie.match(/(?:^|;\s*)paulArchiveLanguage=(ko|en)(?:;|$)/); } catch (error) { cookie = null; }
      saved = cookie ? cookie[1] : SOURCE_LANGUAGE;
    }
    return saved === TARGET_LANGUAGE ? TARGET_LANGUAGE : SOURCE_LANGUAGE;
  }

  function setStoredLanguage(value) {
    safeStorage("setItem", STORAGE_KEY, value);
    try {
      document.cookie = STORAGE_KEY + "=" + value + ";path=/;max-age=31536000;SameSite=Lax" +
        (location.protocol === "https:" ? ";Secure" : "");
    } catch (error) { /* The current page still switches when persistence is blocked. */ }
  }

  function hashString(value) {
    var hash = 5381;
    for (var i = 0; i < value.length; i += 1) hash = (hash * 33) ^ value.charCodeAt(i);
    return (hash >>> 0).toString(36);
  }

  function memoryKey(record) {
    return hashString(record.body + "\n" + record.context);
  }

  function cachedText(record) {
    var entry = memory.get(memoryKey(record));
    return entry && entry[0] === record.body && entry[1] === record.context ? entry[2] : null;
  }

  function loadMemory() {
    try {
      var saved = JSON.parse(safeStorage("getItem", CACHE_KEY) || "[]");
      if (!Array.isArray(saved)) return;
      saved.slice(-1200).forEach(function (entry) {
        if (Array.isArray(entry) && entry.length === 4 && entry.every(function (value) { return typeof value === "string"; }) &&
          entry[3].trim() && entry.join("").length < 65536) {
          memory.set(entry[0], entry.slice(1));
        }
      });
    } catch (error) { /* Ignore invalid or obsolete translation caches. */ }
  }

  function saveMemory() {
    var entries = [];
    var size = 0;
    Array.from(memory).reverse().some(function (entry) {
      var row = [entry[0]].concat(entry[1]);
      size += JSON.stringify(row).length;
      if (size > MAX_CACHE_CHARS || entries.length >= 1200) return true;
      entries.push(row);
      return false;
    });
    entries.reverse();
    memory = new Map(entries.map(function (entry) { return [entry[0], entry.slice(1)]; }));
    safeStorage("setItem", CACHE_KEY, JSON.stringify(entries));
  }

  function localTranslation(text) {
    var normalized = normalizeText(text);
    var exact = Object.prototype.hasOwnProperty.call(UI_TRANSLATIONS, normalized) ? UI_TRANSLATIONS[normalized] : null;
    if (exact) return exact;
    var match = normalizeText(text).match(/^(이전 호|다음 호)\s*·\s*(\d+)호$/);
    if (match) return (match[1] === "이전 호" ? "Previous" : "Next") + " · Issue " + match[2];
    match = normalizeText(text).match(/^(\d+)권의 기록$/);
    if (match) return Number(match[1]).toLocaleString("en") + " books";
    return null;
  }

  function setState(state, message) {
    switcher.dataset.state = state;
    switcher.setAttribute("aria-busy", state === "loading" ? "true" : "false");
    switcher.querySelector("[data-language-retry]").hidden = state !== "error";
    switcher.querySelector("[data-language-retry]").title = message ? message + " Retry translation." : "Retry translation";
    switcher.title = message || "";
    switcher.querySelector("[role=status]").textContent = message ||
      (state === "loading" ? "Translating into English." : language === TARGET_LANGUAGE ? "English selected." : "한국어로 표시합니다.");
  }

  function splitWhitespace(text) {
    var match = String(text).match(/^(\s*)([\s\S]*?)(\s*)$/);
    return { prefix: match[1], body: match[2], suffix: match[3] };
  }

  function readRecord(record) {
    return record.attribute ? record.node.getAttribute(record.attribute) : record.node.nodeValue;
  }

  function writeRecord(record, value) {
    if (readRecord(record) === value) return;
    record.last = value;
    if (record.attribute) record.node.setAttribute(record.attribute, value);
    else record.node.nodeValue = value;
  }

  function sourceContext(record) {
    if (record.attribute) return "";
    var parent = record.node.parentElement;
    var block = parent && (parent.closest(contextSelector) || parent);
    if (!block) return "";
    var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    var parts = [];
    while (walker.nextNode()) {
      var known = textRecords.get(walker.currentNode);
      parts.push(known ? known.original : walker.currentNode.nodeValue);
    }
    var context = normalizeText(parts.join(""));
    return context === normalizeText(record.body) ? "" : context.slice(0, 600);
  }

  function register(node, attribute) {
    if (!node) return;
    var existing;
    if (attribute) {
      var attrs = attributeRecords.get(node);
      if (!attrs) { attrs = {}; attributeRecords.set(node, attrs); }
      existing = attrs[attribute];
    } else existing = textRecords.get(node);
    var current = attribute ? node.getAttribute(attribute) : node.nodeValue;
    if (current == null || existing && (current === existing.last || current === existing.original)) return;
    if (!existing && !/[가-힣]/.test(current)) return;
    var parts = splitWhitespace(current);
    var record = existing || { node: node, attribute: attribute, id: "t" + nextId++ };
    record.original = current;
    record.last = current;
    record.body = parts.body;
    record.english = null;
    record.prefix = parts.prefix;
    record.suffix = parts.suffix;
    record.context = "";
    if (!existing) {
      records.add(record);
      if (attribute) attributeRecords.get(node)[attribute] = record;
      else textRecords.set(node, record);
    }
    var element = attribute ? node : node.parentElement;
    record.block = element && element.closest(lazySelector);
    if (record.block && intersection && !seenBlocks.has(record.block)) {
      seenBlocks.add(record.block);
      intersection.observe(record.block);
    }
  }

  function scan() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        return node.parentElement && !node.parentElement.closest(EXCLUDED_SELECTOR) ?
          NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    while (walker.nextNode()) register(walker.currentNode);
    if (document.querySelector("title")) register(document.querySelector("title").firstChild);
    document.body.querySelectorAll("[placeholder],[title],[alt],[aria-label]").forEach(function (node) {
      if (node.closest(".notranslate,[contenteditable],script,style,svg")) return;
      attributeNames.forEach(function (attribute) { if (node.hasAttribute(attribute)) register(node, attribute); });
    });
    document.querySelectorAll("option:not([value])").forEach(function (option) {
      option.setAttribute("value", option.value);
    });
    records.forEach(function (record) {
      if (!record.node.isConnected) { records.delete(record); return; }
      if (!record.context) record.context = sourceContext(record);
      if (language === TARGET_LANGUAGE) applyKnown(record);
    });
  }

  function applyKnown(record) {
    var translated = localTranslation(record.body) || record.english || cachedText(record);
    if (translated) {
      record.english = translated;
      writeRecord(record, record.prefix + translated + record.suffix);
    }
  }

  function eligible(record) {
    if (!record.node.isConnected || !/[가-힣]/.test(record.body) ||
      record.english || localTranslation(record.body) || cachedText(record)) return false;
    var element = record.attribute ? record.node : record.node.parentElement;
    if (element.closest("head")) return true;
    var visibleElement = element.closest("option") ? element.closest("select") : element;
    if (!visibleElement || !visibleElement.getClientRects().length) return false;
    if (!record.block) return true;
    if (intersection) return nearBlocks.has(record.block);
    var rect = record.block.getBoundingClientRect();
    return rect.bottom >= -800 && rect.top <= innerHeight + 800;
  }

  function nextBatch() {
    var groups = new Map();
    var chars = 0;
    records.forEach(function (record) {
      if (!eligible(record)) return;
      // Include exact source and context so hash collisions never merge distinct passages.
      var key = JSON.stringify([record.body, record.context]);
      if (groups.has(key)) { groups.get(key).records.push(record); return; }
      var size = record.body.length;
      if (groups.size >= MAX_ITEMS_PER_REQUEST || groups.size && chars + size > MAX_CHARS_PER_REQUEST) return;
      groups.set(key, { id: record.id, text: record.body, context: record.context, records: [record] });
      chars += size;
    });
    return Array.from(groups.values());
  }

  async function requestTranslations(batch, job) {
    var timeout = setTimeout(function () { job.controller.abort(); }, 55000);
    try {
      var response = await fetch("/api/translate", {
        method: "POST",
        signal: job.controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: SOURCE_LANGUAGE, target: TARGET_LANGUAGE, path: location.pathname,
          title: document.querySelector("h1") ? document.querySelector("h1").textContent : document.title,
          items: batch.map(function (group) { return { id: group.id, text: group.text, context: group.context }; })
        })
      });
      var data = await response.json();
      if (!response.ok) {
        var error = new Error(data.code === "not_configured" ?
          "English translation is not connected yet." : "Translation is temporarily unavailable. Please retry.");
        throw error;
      }
      if (!Array.isArray(data.translations) || data.translations.length !== batch.length) throw new Error("Incomplete translation. Please retry.");
      var translated = new Map();
      data.translations.forEach(function (entry) {
        if (!entry || typeof entry.id !== "string" || typeof entry.text !== "string" ||
          !entry.text.trim() || translated.has(entry.id)) throw new Error("Invalid translation. Please retry.");
        translated.set(entry.id, entry.text);
      });
      if (batch.some(function (group) { return !translated.has(group.id); })) throw new Error("Incomplete translation. Please retry.");
      return translated;
    } finally { clearTimeout(timeout); }
  }

  async function pump() {
    if (language !== TARGET_LANGUAGE || failed || worker) return;
    var job = { generation: generation, controller: new AbortController() };
    worker = job;
    try {
      var batch;
      while (language === TARGET_LANGUAGE && job.generation === generation && (batch = nextBatch()).length) {
        setState("loading");
        var translations = await requestTranslations(batch, job);
        if (job.generation !== generation || language !== TARGET_LANGUAGE) return;
        batch.forEach(function (group) {
          group.records.forEach(function (record) {
            // The search/filter may have replaced or edited a node while the request was in flight.
            if (!record.node.isConnected || record.body !== group.text || record.context !== group.context ||
              readRecord(record) !== record.last && readRecord(record) !== record.original) return;
            memory.delete(memoryKey(record));
            memory.set(memoryKey(record), [record.body, record.context, translations.get(group.id)]);
            applyKnown(record);
          });
        });
        saveMemory();
      }
      if (job.generation === generation) setState("idle");
    } catch (error) {
      if (job.generation !== generation || language !== TARGET_LANGUAGE) return;
      failed = true;
      setState("error", error.name === "AbortError" ? "Translation timed out. Please retry." : error.message);
    } finally {
      if (worker === job) worker = null;
    }
  }

  function refresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () { scan(); pump(); }, 90);
  }

  var intersection = typeof IntersectionObserver === "function" ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) nearBlocks.add(entry.target);
      else nearBlocks.delete(entry.target);
    });
    pump();
  }, { rootMargin: "800px 0px" }) : null;

  function selectLanguage(value, persist) {
    generation += 1;
    if (worker) worker.controller.abort();
    worker = null;
    failed = false;
    language = value === TARGET_LANGUAGE ? TARGET_LANGUAGE : SOURCE_LANGUAGE;
    if (persist !== false) setStoredLanguage(language);
    document.documentElement.lang = language;
    document.documentElement.dataset.language = language;
    switcher.querySelectorAll("button[data-language]").forEach(function (button) {
      button.setAttribute("aria-pressed", button.dataset.language === language ? "true" : "false");
    });
    scan();
    if (language === SOURCE_LANGUAGE) {
      records.forEach(function (record) { writeRecord(record, record.original); });
    }
    setState("idle");
    window.dispatchEvent(new CustomEvent("paularchive:languagechange", { detail: { language: language } }));
    pump();
  }

  function mountSwitcher() {
    var host = document.createElement("div");
    host.className = "pan-language-switcher notranslate";
    host.setAttribute("translate", "no");
    host.setAttribute("role", "group");
    host.setAttribute("aria-label", "Language / 언어");
    host.innerHTML = '<button type="button" data-language="ko" aria-pressed="true" lang="ko">한국어</button>' +
      '<button type="button" data-language="en" aria-pressed="false" lang="en">English</button>' +
      '<button type="button" data-language-retry title="Retry translation" aria-label="Retry translation" hidden>↻</button>' +
      '<span class="pan-language-status" role="status" aria-live="polite" aria-atomic="true"></span>';
    host.addEventListener("click", function (event) {
      var button = event.target.closest("button");
      if (!button || !host.contains(button)) return;
      if (button.dataset.language === language && !failed) return;
      selectLanguage(button.hasAttribute("data-language-retry") ? TARGET_LANGUAGE : button.dataset.language);
    });
    var nav = document.querySelector(".masthead .nav");
    if (nav) nav.insertBefore(host, nav.firstChild);
    else {
      var bar = document.createElement("div");
      bar.className = "pan-language-bar notranslate";
      bar.appendChild(host);
      document.body.insertBefore(bar, document.body.firstChild);
    }
    document.body.classList.add("pan-language-ready");
    return host;
  }

  function init() {
    if (document.querySelector(".pan-language-switcher")) return;
    injectStyle();
    // Content policy is applied once, before capturing the Korean source.
    sanitizeContentPolicy();
    loadMemory();
    switcher = mountSwitcher();
    selectLanguage(getStoredLanguage(), false);
    new MutationObserver(function (mutations) {
      if (mutations.some(function (mutation) {
        var element = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
        if (element && element.closest(".pan-language-switcher,script,style")) return false;
        if (mutation.type === "childList") return mutation.addedNodes.length || mutation.removedNodes.length;
        var known = mutation.type === "attributes" ?
          (attributeRecords.get(mutation.target) || {})[mutation.attributeName] : textRecords.get(mutation.target);
        return !known || readRecord(known) !== known.last;
      })) refresh();
    }).observe(document.body, { childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: attributeNames.concat(["hidden"]) });
    window.addEventListener("storage", function (event) {
      if (event.key === STORAGE_KEY && getStoredLanguage() !== language) selectLanguage(getStoredLanguage(), false);
    });
    window.addEventListener("pageshow", function () {
      if (getStoredLanguage() !== language) selectLanguage(getStoredLanguage(), false);
      else refresh();
    });
    window.addEventListener("scroll", function () { pump(); }, { passive: true });
    window.addEventListener("resize", function () { pump(); }, { passive: true });
    window.PaulArchiveLanguage = {
      getLanguage: function () { return language; }, setLanguage: selectLanguage, refresh: refresh,
      translatedText: function (text) {
        var body = splitWhitespace(String(text || "")).body;
        return localTranslation(body) || cachedText({ body: body, context: "" }) || body;
      }
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
