(function () {
  var SOURCE_LANGUAGE = "ko";
  var TARGET_LANGUAGE = "en";
  var STORAGE_KEY = "paulArchiveLanguage";
  var STYLE_ID = "paul-archive-language-style";
  var CACHE_PREFIX = "paulArchiveTranslation:";
  var MAX_ITEMS_PER_REQUEST = 42;
  var MAX_CHARS_PER_REQUEST = 7600;
  var pageItems = null;
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
    "select",
    "option",
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
      ".pan-language-switcher button{appearance:none;border:0;border-radius:999px;background:transparent;color:#5c554b;cursor:pointer;font:inherit;font-size:.68rem;font-weight:780;letter-spacing:.02em;padding:6px 8px;text-transform:uppercase}",
      ".pan-language-switcher button[aria-pressed=true]{background:#171717;color:#fffdf8}",
      ".pan-language-switcher button:disabled{cursor:wait;opacity:.72}",
      ".pan-language-switcher button:focus-visible{outline:2px solid #9b3f34;outline-offset:2px}",
      ".pan-language-switcher[data-state=loading]::after{content:'GPT';margin:0 5px 0 3px;color:#9b3f34;font-size:.62rem;font-weight:850;letter-spacing:.08em}",
      ".pan-language-switcher[data-state=error]{border-color:#9b3f34}",
      ".masthead .nav{position:relative}",
      ".masthead .nav>.pan-language-switcher{left:22px;position:absolute;top:50%;transform:translateY(-50%)}",
      "body.pan-language-ready .masthead .nav-links{padding-left:172px}",
      ".pan-language-switcher--fixed{left:14px;position:fixed;top:14px}",
      "@media (max-width:900px){.masthead .nav>.pan-language-switcher{grid-column:1;grid-row:1;position:static;transform:none}body.pan-language-ready .masthead .nav-links{padding-left:0}.pan-language-switcher{box-shadow:none}.pan-language-switcher button{font-size:.62rem;padding:6px 7px}}",
      "@media (max-width:380px){.pan-language-switcher button{font-size:.58rem;padding:5px 6px}}"
    ].join("\n");
    document.head.appendChild(style);
  }

  function getStoredLanguage() {
    try {
      return localStorage.getItem(STORAGE_KEY) === TARGET_LANGUAGE ? TARGET_LANGUAGE : SOURCE_LANGUAGE;
    } catch (error) {
      return SOURCE_LANGUAGE;
    }
  }

  function getCookieDomains() {
    var hostname = window.location.hostname;
    if (!hostname || hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return [""];
    }

    var parts = hostname.split(".");
    var root = parts.length > 2 ? "." + parts.slice(-2).join(".") : "." + hostname;
    return ["", hostname, root];
  }

  function clearLegacyGoogleTranslateCookie() {
    getCookieDomains().forEach(function (domain) {
      var domainPart = domain ? ";domain=" + domain : "";
      document.cookie = "googtrans=;path=/" + domainPart + ";expires=Thu, 01 Jan 1970 00:00:00 GMT";
    });
  }

  function setStoredLanguage(language) {
    try {
      localStorage.setItem(STORAGE_KEY, language === TARGET_LANGUAGE ? TARGET_LANGUAGE : SOURCE_LANGUAGE);
    } catch (error) {
      // Safari private browsing or strict storage settings should not block translation.
    }
  }

  function setActiveButton(host, language) {
    host.querySelectorAll("button[data-language]").forEach(function (button) {
      var active = button.getAttribute("data-language") === language;
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    document.documentElement.setAttribute("data-language", language);
  }

  function setBusy(host, isBusy) {
    host.dataset.state = isBusy ? "loading" : "idle";
    host.querySelectorAll("button").forEach(function (button) {
      button.disabled = isBusy;
    });
  }

  function setError(host, message) {
    host.dataset.state = "error";
    host.title = message || "Translation is unavailable right now.";
    host.querySelectorAll("button").forEach(function (button) {
      button.disabled = false;
    });
  }

  function hasHangul(text) {
    return /[가-힣]/.test(text);
  }

  function splitWhitespace(text) {
    var match = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
    return {
      prefix: match ? match[1] : "",
      body: match ? match[2] : text,
      suffix: match ? match[3] : ""
    };
  }

  function shouldTranslateTextNode(node) {
    if (!node || !node.parentElement) {
      return false;
    }

    if (node.parentElement.closest(EXCLUDED_SELECTOR)) {
      return false;
    }

    var body = splitWhitespace(node.nodeValue).body;
    if (!body || body.length < 2) {
      return false;
    }

    return hasHangul(body);
  }

  function collectTextNodes() {
    var nodes = [];
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        return shouldTranslateTextNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    var index = 0;
    while (walker.nextNode()) {
      var node = walker.currentNode;
      var parts = splitWhitespace(node.nodeValue);
      nodes.push({
        id: "t" + index,
        node: node,
        original: node.nodeValue,
        prefix: parts.prefix,
        body: parts.body,
        suffix: parts.suffix
      });
      index += 1;
    }

    return nodes;
  }

  function getPageItems() {
    if (!pageItems) {
      pageItems = collectTextNodes();
    }
    return pageItems;
  }

  function hashString(value) {
    var hash = 5381;
    for (var i = 0; i < value.length; i += 1) {
      hash = (hash * 33) ^ value.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
  }

  function getCacheKey(items) {
    var fingerprint = items.map(function (item) {
      return item.id + ":" + item.body;
    }).join("\n");
    return CACHE_PREFIX + location.pathname + ":" + hashString(fingerprint);
  }

  function readCache(key) {
    try {
      var cached = localStorage.getItem(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      return null;
    }
  }

  function writeCache(key, translations) {
    try {
      localStorage.setItem(key, JSON.stringify(translations));
    } catch (error) {
      // Storage can be full or disabled. Translation should still work for the current view.
    }
  }

  function chunkItems(items) {
    var chunks = [];
    var current = [];
    var currentChars = 0;

    items.forEach(function (item) {
      var size = item.body.length;
      if (current.length && (current.length >= MAX_ITEMS_PER_REQUEST || currentChars + size > MAX_CHARS_PER_REQUEST)) {
        chunks.push(current);
        current = [];
        currentChars = 0;
      }
      current.push(item);
      currentChars += size;
    });

    if (current.length) {
      chunks.push(current);
    }

    return chunks;
  }

  function applyTranslations(items, translations) {
    var byId = translations || {};
    items.forEach(function (item) {
      var translated = byId[item.id];
      if (typeof translated === "string" && translated.trim()) {
        item.node.nodeValue = item.prefix + translated + item.suffix;
      }
    });
  }

  function restoreOriginal(items) {
    items.forEach(function (item) {
      item.node.nodeValue = item.original;
    });
  }

  async function requestTranslations(chunk) {
    var response = await fetch("/api/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        source: SOURCE_LANGUAGE,
        target: TARGET_LANGUAGE,
        path: location.pathname,
        title: document.title,
        items: chunk.map(function (item) {
          return {
            id: item.id,
            text: item.body
          };
        })
      })
    });

    var data = await response.json().catch(function () {
      return {};
    });

    if (!response.ok) {
      throw new Error(data.error || "Translation request failed.");
    }

    return data.translations || [];
  }

  async function translateToEnglish(host) {
    var items = getPageItems();
    if (!items.length) {
      setStoredLanguage(TARGET_LANGUAGE);
      setActiveButton(host, TARGET_LANGUAGE);
      return;
    }

    var cacheKey = getCacheKey(items);
    var cached = readCache(cacheKey);
    if (cached) {
      applyTranslations(items, cached);
      setStoredLanguage(TARGET_LANGUAGE);
      setActiveButton(host, TARGET_LANGUAGE);
      setBusy(host, false);
      host.title = "";
      return;
    }

    setBusy(host, true);
    var allTranslations = {};

    try {
      var chunks = chunkItems(items);
      for (var i = 0; i < chunks.length; i += 1) {
        var translatedChunk = await requestTranslations(chunks[i]);
        translatedChunk.forEach(function (entry) {
          if (entry && typeof entry.id === "string" && typeof entry.text === "string") {
            allTranslations[entry.id] = entry.text;
          }
        });
        applyTranslations(items, allTranslations);
      }

      writeCache(cacheKey, allTranslations);
      setStoredLanguage(TARGET_LANGUAGE);
      setActiveButton(host, TARGET_LANGUAGE);
      setBusy(host, false);
      host.title = "";
    } catch (error) {
      restoreOriginal(items);
      setStoredLanguage(SOURCE_LANGUAGE);
      setActiveButton(host, SOURCE_LANGUAGE);
      setError(host, error.message);
      console.error(error);
    }
  }

  function restoreKorean(host) {
    restoreOriginal(getPageItems());
    setStoredLanguage(SOURCE_LANGUAGE);
    setActiveButton(host, SOURCE_LANGUAGE);
    setBusy(host, false);
    host.title = "";
  }

  function createSwitcher() {
    var host = document.createElement("div");
    host.className = "pan-language-switcher notranslate";
    host.setAttribute("translate", "no");
    host.setAttribute("aria-label", "Language selector");
    host.dataset.state = "idle";
    host.innerHTML = [
      '<button type="button" data-language="ko" aria-pressed="true">한글</button>',
      '<button type="button" data-language="en" aria-pressed="false">English</button>'
    ].join("");

    host.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-language]");
      if (!button || button.disabled) {
        return;
      }

      var language = button.getAttribute("data-language");
      if (language === TARGET_LANGUAGE) {
        translateToEnglish(host);
      } else {
        restoreKorean(host);
      }
    });

    return host;
  }

  function mountSwitcher() {
    if (document.querySelector(".pan-language-switcher")) {
      return document.querySelector(".pan-language-switcher");
    }

    var host = createSwitcher();
    var nav = document.querySelector(".masthead .nav");
    if (nav) {
      nav.insertBefore(host, nav.firstChild);
    } else {
      host.classList.add("pan-language-switcher--fixed");
      document.body.insertBefore(host, document.body.firstChild);
    }

    document.body.classList.add("pan-language-ready");
    return host;
  }

  function init() {
    injectStyle();
    clearLegacyGoogleTranslateCookie();
    var host = mountSwitcher();
    var language = getStoredLanguage();
    setActiveButton(host, language);

    if (language === TARGET_LANGUAGE) {
      window.setTimeout(function () {
        translateToEnglish(host);
      }, 0);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
