(function () {
  var SEARCH_PATTERN = /\/search(?:\?|$)/i;
  var PLAYER_STORAGE_KEY = "paulArchiveSelectedIssuePlayer";
  var issueMap = null;
  var linkCache = {};

  function normalizeHref(href) {
    if (!href) {
      return "";
    }

    try {
      var url = new URL(href, window.location.href);
      return url.pathname.replace(/^\//, "");
    } catch (error) {
      return href.replace(/^\.\//, "").replace(/^\//, "");
    }
  }

  function getRowType(row) {
    var type = row.querySelector(".row-type");
    return type ? type.textContent.trim() : "";
  }

  function getRowTitle(row) {
    var title = row.querySelector("h3, strong");
    return title ? title.textContent.trim() : row.textContent.trim();
  }

  function getRowDescription(row) {
    var text = row.querySelector("p, em");
    return text ? text.textContent.trim() : "";
  }

  function getIssueLabel(row) {
    var description = getRowDescription(row);
    var match = description.match(/Issue\s+\d+/i);
    if (match) {
      return match[0].replace("issue", "Issue");
    }

    var date = row.querySelector(".essay-date");
    if (date) {
      match = date.textContent.match(/Issue\s+\d+/i);
      if (match) {
        return match[0].replace("issue", "Issue");
      }
    }

    return "";
  }

  function isIssueRow(row) {
    var type = getRowType(row);
    var text = row.textContent || "";
    return /Issue\s+\d+/i.test(text) && (type === "Lead" || type === "Art" || type === "Essay");
  }

  function isRecordRow(row) {
    return getRowType(row) === "Record";
  }

  function buildIssueMap() {
    var map = {};
    var current = null;
    var issueByLabel = {};

    document.querySelectorAll("a.archive-row").forEach(function (row) {
      if (isIssueRow(row)) {
        current = {
          href: normalizeHref(row.getAttribute("href")),
          label: getIssueLabel(row),
          title: getRowTitle(row),
          records: []
        };
        if (row.hasAttribute("data-issue-record-lead")) {
          current.records.push({
            href: current.href,
            title: current.title,
            description: getRowDescription(row)
          });
        }
        map[current.href] = current;
        if (current.label) {
          issueByLabel[current.label] = current;
        }
        return;
      }

      if (isRecordRow(row)) {
        var recordIssue = issueByLabel[getIssueLabel(row)] || current;
        if (!recordIssue) {
          return;
        }
        var recordHref = normalizeHref(row.getAttribute("href"));
        recordIssue.records.push({
          href: recordHref,
          title: getRowTitle(row),
          description: getRowDescription(row)
        });
        map[recordHref] = recordIssue;
      }
    });

    document.querySelectorAll(".essay-drawer-list").forEach(function (list) {
      var drawerIssue = null;

      Array.prototype.slice.call(list.children).forEach(function (child) {
        if (child.matches && child.matches("a[href]") && /Issue\s+\d+/i.test(child.textContent || "")) {
          drawerIssue = {
            href: normalizeHref(child.getAttribute("href")),
            label: getIssueLabel(child),
            title: getRowTitle(child),
            records: []
          };
          map[drawerIssue.href] = drawerIssue;
          return;
        }

        if (!drawerIssue || !child.matches || !child.matches(".issue-companion-links--drawer")) {
          return;
        }

        child.querySelectorAll("a[href]").forEach(function (link) {
          var type = link.querySelector("span");
          if (!type || type.textContent.trim() !== "Record") {
            return;
          }

          drawerIssue.records.push({
            href: normalizeHref(link.getAttribute("href")),
            title: getRowTitle(link),
            description: getRowDescription(link)
          });
        });
      });
    });

    return map;
  }

  function issueForLink(link) {
    if (!issueMap) {
      issueMap = buildIssueMap();
    }

    return issueMap[normalizeHref(link.getAttribute("href"))] || null;
  }

  function encodeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function encodeAttr(value) {
    return encodeHtml(value).replace(/'/g, "&#39;");
  }

  function appleUrlToEmbed(url) {
    if (!url || SEARCH_PATTERN.test(url)) {
      return "";
    }

    try {
      var parsed = new URL(url);
      if (parsed.hostname === "music.apple.com") {
        parsed.hostname = "embed.music.apple.com";
        return parsed.toString();
      }

      if (parsed.hostname === "classical.music.apple.com") {
        var albumId = parsed.pathname.match(/\/album\/([^/?#]+)/);
        if (albumId) {
          return "https://embed.music.apple.com/us/album/" + albumId[1];
        }
        if (/\/recording\//.test(parsed.pathname)) {
          parsed.hostname = "embed.music.apple.com";
          return parsed.toString();
        }
      }
    } catch (error) {
      return "";
    }

    return "";
  }

  function findMusicLinks(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var links = Array.prototype.slice.call(doc.querySelectorAll("a[href*='music.apple.com']"));
    var found = links.find(function (link) {
      return !SEARCH_PATTERN.test(link.getAttribute("href") || "");
    });

    var spotify = doc.querySelector("[data-music-service='spotify'], a[href*='open.spotify.com']");
    var youtubeMusic = doc.querySelector("[data-music-service='youtube-music'], a[href*='music.youtube.com']");

    return {
      appleUrl: found ? found.href : "",
      spotifyUrl: spotify ? spotify.href : "",
      youtubeMusicUrl: youtubeMusic ? youtubeMusic.href : ""
    };
  }

  function fetchRecordLink(record) {
    if (linkCache[record.href]) {
      return Promise.resolve(linkCache[record.href]);
    }

    return fetch(record.href, { credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("record fetch failed");
        }
        return response.text();
      })
      .then(function (html) {
        var links = findMusicLinks(html);
        var result = {
          appleUrl: links.appleUrl,
          spotifyUrl: links.spotifyUrl,
          youtubeMusicUrl: links.youtubeMusicUrl,
          embedUrl: appleUrlToEmbed(links.appleUrl)
        };
        linkCache[record.href] = result;
        return result;
      })
      .catch(function () {
        var empty = { appleUrl: "", spotifyUrl: "", youtubeMusicUrl: "", embedUrl: "" };
        linkCache[record.href] = empty;
        return empty;
      });
  }

  function getPlayer() {
    return document.querySelector(".mini-player");
  }

  function getPanel() {
    return document.querySelector(".mini-player-panel");
  }

  function setSummary(label) {
    var summaryLabel = document.querySelector(".mini-player summary span:last-child");
    if (summaryLabel) {
      summaryLabel.textContent = label || "오늘의 플레이어";
    }
  }

  function renderLoading(issue) {
    var panel = getPanel();
    if (!panel) {
      return;
    }

    panel.innerHTML = [
      '<div class="mini-player-heading">',
      '<span>' + encodeHtml(issue.label || "Issue") + '</span>',
      '<strong>' + encodeHtml(issue.title) + '</strong>',
      '<a href="' + encodeAttr(issue.href) + '">이슈 읽기</a>',
      '</div>',
      '<p class="mini-player-loading">이 이슈의 음반을 불러오는 중입니다.</p>'
    ].join("");
  }

  function renderIssue(issue, records) {
    var panel = getPanel();
    if (!panel) {
      return;
    }

    var heading = [
      '<div class="mini-player-heading">',
      '<span>' + encodeHtml(issue.label || "Issue") + '</span>',
      '<strong>' + encodeHtml(issue.title) + '</strong>',
      '<a href="' + encodeAttr(issue.href) + '">이슈 읽기</a>',
      '</div>'
    ].join("");

    var body = records.map(function (record) {
      var media = record.embedUrl
        ? '<iframe title="Apple Music player: ' + encodeAttr(record.title) + '" allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write" sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation" src="' + encodeAttr(record.embedUrl) + '"></iframe>'
        : '<p class="mini-player-empty">공식 Apple Music 임베드를 찾지 못해 리뷰로 연결합니다.</p>';
      var serviceLinks = [
        record.appleUrl ? '<a href="' + encodeAttr(record.appleUrl) + '" target="_blank" rel="noopener noreferrer">Apple Music</a>' : "",
        record.spotifyUrl ? '<a href="' + encodeAttr(record.spotifyUrl) + '" target="_blank" rel="noopener noreferrer">Spotify</a>' : "",
        record.youtubeMusicUrl ? '<a href="' + encodeAttr(record.youtubeMusicUrl) + '" target="_blank" rel="noopener noreferrer">YouTube Music</a>' : "",
        '<a href="' + encodeAttr(record.href) + '">리뷰 읽기</a>'
      ].filter(Boolean).join("");

      return [
        '<article class="mini-player-track">',
        '<div>',
        '<span>' + encodeHtml(record.description || "Record") + '</span>',
        '<strong>' + encodeHtml(record.title) + '</strong>',
        '</div>',
        media,
        '<div class="mini-player-services" aria-label="음악 서비스">' + serviceLinks + '</div>',
        '</article>'
      ].join("");
    }).join("");

    panel.innerHTML = heading + body;
  }

  function openPlayer() {
    var player = getPlayer();
    if (player) {
      player.open = true;
    }
  }

  function selectIssue(issue, options) {
    if (!issue || !issue.records.length) {
      return;
    }

    var shouldOpen = !options || options.open !== false;

    setSummary(issue.label ? issue.label + " 플레이어" : "이슈 플레이어");
    renderLoading(issue);
    if (shouldOpen) {
      openPlayer();
    }
    localStorage.setItem(PLAYER_STORAGE_KEY, issue.href);

    Promise.all(issue.records.map(function (record) {
      return fetchRecordLink(record).then(function (links) {
        return Object.assign({}, record, links);
      });
    })).then(function (records) {
      renderIssue(issue, records);
      if (shouldOpen) {
        openPlayer();
      }
    });
  }

  function installIssueLinkHandlers() {
    document.addEventListener("click", function (event) {
      var link = event.target.closest("a[href]");
      if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === "_blank") {
        return;
      }

      if (link.closest(".mini-player-panel")) {
        return;
      }

      var issue = issueForLink(link);
      if (!issue || !issue.records.length) {
        return;
      }

      localStorage.setItem(PLAYER_STORAGE_KEY, issue.href);

      if (link.matches("[data-issue-player-trigger]") || link.closest("[data-issue-player-trigger]")) {
        event.preventDefault();
        selectIssue(issue);
      }
    });
  }

  function restoreSelectedIssue() {
    var selected = localStorage.getItem(PLAYER_STORAGE_KEY);
    if (!selected) {
      return;
    }

    if (!issueMap) {
      issueMap = buildIssueMap();
    }

    if (issueMap[selected]) {
      selectIssue(issueMap[selected], { open: false });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      installIssueLinkHandlers();
      restoreSelectedIssue();
    });
  } else {
    installIssueLinkHandlers();
    restoreSelectedIssue();
  }
})();
