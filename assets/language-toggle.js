(function () {
  var PAGE_LANGUAGE = "ko";
  var STORAGE_KEY = "paulArchiveLanguage";
  var SCRIPT_ID = "paul-archive-google-translate";
  var WIDGET_ID = "google_translate_element";
  var STYLE_ID = "paul-archive-language-style";

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
      ".pan-language-switcher button:focus-visible{outline:2px solid #9b3f34;outline-offset:2px}",
      ".masthead .nav{position:relative}",
      ".masthead .nav>.pan-language-switcher{left:22px;position:absolute;top:50%;transform:translateY(-50%)}",
      "body.pan-language-ready .masthead .nav-links{padding-left:172px}",
      ".pan-language-switcher--fixed{left:14px;position:fixed;top:14px}",
      "#google_translate_element{height:1px;left:-9999px;overflow:hidden;position:absolute;top:auto;width:1px}",
      ".goog-te-banner-frame.skiptranslate,.goog-te-gadget-icon,.goog-te-balloon-frame{display:none!important}",
      "body{top:0!important}",
      "@media (max-width:900px){.masthead .nav>.pan-language-switcher{grid-column:1;grid-row:1;position:static;transform:none}body.pan-language-ready .masthead .nav-links{padding-left:0}.pan-language-switcher{box-shadow:none}.pan-language-switcher button{font-size:.62rem;padding:6px 7px}}",
      "@media (max-width:380px){.pan-language-switcher button{font-size:.58rem;padding:5px 6px}}"
    ].join("\n");
    document.head.appendChild(style);
  }

  function getStoredLanguage() {
    return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "ko";
  }

  function setStoredLanguage(language) {
    localStorage.setItem(STORAGE_KEY, language === "en" ? "en" : "ko");
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

  function writeTranslateCookie(language) {
    var value = language === "en" ? "/" + PAGE_LANGUAGE + "/en" : "/" + PAGE_LANGUAGE + "/" + PAGE_LANGUAGE;
    getCookieDomains().forEach(function (domain) {
      var domainPart = domain ? ";domain=" + domain : "";
      document.cookie = "googtrans=" + value + ";path=/" + domainPart + ";max-age=31536000";
    });
  }

  function clearTranslateCookie() {
    getCookieDomains().forEach(function (domain) {
      var domainPart = domain ? ";domain=" + domain : "";
      document.cookie = "googtrans=;path=/" + domainPart + ";expires=Thu, 01 Jan 1970 00:00:00 GMT";
    });
  }

  function setActiveButton(host, language) {
    host.querySelectorAll("button[data-language]").forEach(function (button) {
      var active = button.getAttribute("data-language") === language;
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    document.documentElement.setAttribute("data-language", language);
  }

  function getTranslateCombo() {
    return document.querySelector(".goog-te-combo");
  }

  function chooseLanguage(language, attempt) {
    var combo = getTranslateCombo();
    if (combo) {
      combo.value = language === "en" ? "en" : "";
      combo.dispatchEvent(new Event("change"));
      return;
    }

    if (attempt < 30) {
      window.setTimeout(function () {
        chooseLanguage(language, attempt + 1);
      }, 250);
    }
  }

  function ensureWidget() {
    var widget = document.getElementById(WIDGET_ID);
    if (!widget) {
      widget = document.createElement("div");
      widget.id = WIDGET_ID;
      widget.className = "notranslate";
      widget.setAttribute("translate", "no");
      document.body.appendChild(widget);
    }

    window.googleTranslateElementInit = function () {
      if (!window.google || !window.google.translate) {
        return;
      }
      new window.google.translate.TranslateElement(
        {
          pageLanguage: PAGE_LANGUAGE,
          includedLanguages: "en,ko",
          autoDisplay: false
        },
        WIDGET_ID
      );
      if (getStoredLanguage() === "en") {
        window.setTimeout(function () {
          chooseLanguage("en", 0);
        }, 450);
      }
    };

    if (document.getElementById(SCRIPT_ID)) {
      return;
    }

    var script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.async = true;
    document.head.appendChild(script);
  }

  function translateToEnglish(host) {
    setStoredLanguage("en");
    writeTranslateCookie("en");
    setActiveButton(host, "en");
    ensureWidget();
    chooseLanguage("en", 0);
  }

  function restoreKorean(host) {
    setStoredLanguage("ko");
    clearTranslateCookie();
    writeTranslateCookie("ko");
    setActiveButton(host, "ko");

    if (document.documentElement.className.indexOf("translated") !== -1 || getTranslateCombo()) {
      window.location.reload();
    }
  }

  function createSwitcher() {
    var host = document.createElement("div");
    host.className = "pan-language-switcher notranslate";
    host.setAttribute("translate", "no");
    host.setAttribute("aria-label", "Language selector");
    host.innerHTML = [
      '<button type="button" data-language="ko" aria-pressed="true">Korean</button>',
      '<button type="button" data-language="en" aria-pressed="false">English</button>'
    ].join("");

    host.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-language]");
      if (!button) {
        return;
      }

      var language = button.getAttribute("data-language");
      if (language === "en") {
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
    var host = mountSwitcher();
    var language = getStoredLanguage();
    setActiveButton(host, language);

    if (language === "en") {
      writeTranslateCookie("en");
      ensureWidget();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
