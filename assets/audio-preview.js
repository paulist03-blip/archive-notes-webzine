(function () {
  const currentPath = window.location.pathname;
  const fallbackPreview = {
    title: "Berlioz: Symphonie fantastique",
    subtitle: "Marek Janowski · Pittsburgh Symphony Orchestra",
    embedUrl: "https://embed.music.apple.com/kr/album/berlioz-symphonie-fantastique/1729510665",
    openUrl: "https://music.apple.com/kr/album/berlioz-symphonie-fantastique/1729510665",
    query: "Marek Janowski Pittsburgh Symphony Orchestra Berlioz Symphonie fantastique",
  };

  const knownPreviews = {
    "/posts/janowski-berlioz-fantastique-king-lear.html": fallbackPreview,
    "/posts/jacobs-figaro-marriage.html": {
      title: "Mozart: Le Nozze di Figaro",
      subtitle: "René Jacobs · Concerto Köln",
      embedUrl: "https://embed.music.apple.com/kr/album/mozart-le-nozze-di-figaro/632483938",
      openUrl: "https://music.apple.com/kr/album/mozart-le-nozze-di-figaro/632483938",
      query: "René Jacobs Le Nozze di Figaro Harmonia Mundi",
    },
  };

  function normalizePath(pathname) {
    return pathname.replace(/\/index\.html$/, "/");
  }

  function appleEmbedFromLink(href) {
    try {
      const url = new URL(href);
      if (url.hostname !== "music.apple.com" || !url.pathname.includes("/album/")) {
        return null;
      }
      if (url.pathname.includes("/search")) {
        return null;
      }
      url.hostname = "embed.music.apple.com";
      return url.toString();
    } catch (error) {
      return null;
    }
  }

  function pagePreview() {
    const known = knownPreviews[normalizePath(currentPath)];
    if (known) {
      return known;
    }

    const articleTitle = document.querySelector(".article h1")?.textContent?.trim();
    const recordTitle = document.querySelector(".article-note strong")?.textContent?.trim();
    const appleLink = Array.from(document.querySelectorAll('a[href*="music.apple.com"]'))
      .map((link) => link.href)
      .find((href) => appleEmbedFromLink(href));

    if (articleTitle && appleLink) {
      return {
        title: recordTitle || articleTitle,
        subtitle: "Paul Archive Notes · Listening Preview",
        embedUrl: appleEmbedFromLink(appleLink),
        openUrl: appleLink,
        query: `${recordTitle || articleTitle} Paul Archive Notes`,
      };
    }

    if (document.querySelector(".article .eyebrow")?.textContent?.includes("Record Room")) {
      const title = recordTitle || articleTitle || "Bernstein Record Room";
      return {
        title,
        subtitle: "Streaming search",
        embedUrl: "",
        openUrl: "",
        query: title,
      };
    }

    return fallbackPreview;
  }

  function iconPlay() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M10 8.75v6.5L15.5 12 10 8.75z"></path></svg>';
  }

  function iconClose() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  const preview = pagePreview();
  const searchQuery = encodeURIComponent(preview.query || `${preview.title} ${preview.subtitle}`);
  const safeTitle = escapeHtml(preview.title);
  const safeSubtitle = escapeHtml(preview.subtitle);
  const safeEmbedUrl = escapeHtml(preview.embedUrl);
  const safeOpenUrl = escapeHtml(preview.openUrl);
  const player = document.createElement("section");
  player.className = `audio-mini${preview.embedUrl ? "" : " no-embed"}`;
  player.setAttribute("aria-label", "음악 미리 듣기");
  player.innerHTML = `
    <button class="audio-mini-toggle" type="button" aria-expanded="false" aria-label="음악 미리 듣기">
      ${iconPlay()}
      <span>미리 듣기</span>
    </button>
    <div class="audio-mini-panel" role="dialog" aria-label="음악 미리 듣기">
      <div class="audio-mini-head">
        <div>
          <p class="audio-mini-kicker">Listening Preview</p>
          <p class="audio-mini-title">${safeTitle}</p>
          <p class="audio-mini-caption">${safeSubtitle}</p>
        </div>
        <button class="audio-mini-close" type="button" aria-label="닫기">${iconClose()}</button>
      </div>
      <div class="audio-mini-frame-wrap">
        <iframe class="audio-mini-frame" title="${safeTitle} 미리 듣기" data-src="${safeEmbedUrl}" allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write"></iframe>
        <p class="audio-mini-fallback">이 음반은 공식 임베드 링크를 확인한 뒤 플레이어로 바꿉니다.</p>
      </div>
      <div class="audio-mini-links">
        ${preview.openUrl ? `<a href="${safeOpenUrl}" target="_blank" rel="noopener noreferrer">Apple Music</a>` : ""}
        <a href="https://open.spotify.com/search/${searchQuery}" target="_blank" rel="noopener noreferrer">Spotify</a>
        <a href="https://tidal.com/search?q=${searchQuery}" target="_blank" rel="noopener noreferrer">TIDAL</a>
      </div>
    </div>
  `;

  document.body.appendChild(player);

  const toggle = player.querySelector(".audio-mini-toggle");
  const close = player.querySelector(".audio-mini-close");
  const frame = player.querySelector(".audio-mini-frame");

  function openPlayer() {
    player.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
    if (frame.dataset.src && !frame.src) {
      frame.src = frame.dataset.src;
    }
  }

  function closePlayer() {
    player.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  }

  toggle.addEventListener("click", () => {
    if (player.classList.contains("is-open")) {
      closePlayer();
    } else {
      openPlayer();
    }
  });

  close.addEventListener("click", closePlayer);

  document.addEventListener("click", (event) => {
    if (!player.contains(event.target)) {
      closePlayer();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePlayer();
    }
  });
})();
