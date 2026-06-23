(function () {
  const currentPath = window.location.pathname;

  const knownPreviews = {
    "/posts/koroliov-haydn-piano-sonatas.html": {
      title: "Haydn: Piano Sonatas",
      subtitle: "Evgeni Koroliov · Profil",
      embedUrl: "https://embed.music.apple.com/us/album/356300141",
      openUrl: "https://music.apple.com/us/album/haydn-f-j-piano-sonatas/356300141",
      query: "Evgeni Koroliov Haydn Piano Sonatas Profil",
    },
    "/posts/gardiner-mendelssohn-4-5.html": {
      title: "Mendelssohn: Symphonies Nos. 4 & 5",
      subtitle: "John Eliot Gardiner · Wiener Philharmoniker",
      embedUrl: "https://embed.music.apple.com/us/album/mendelssohn-symphonies-no-4-italian-original-and/1452149841",
      openUrl: "https://music.apple.com/us/album/mendelssohn-symphonies-no-4-italian-original-and/1452149841",
      query: "John Eliot Gardiner Wiener Philharmoniker Mendelssohn Symphonies 4 5",
    },
    "/posts/giulini-bruckner-9.html": {
      title: "Bruckner: Symphony No. 9",
      subtitle: "Carlo Maria Giulini · Wiener Philharmoniker",
      embedUrl: "https://embed.music.apple.com/us/album/bruckner-symphony-no-9-in-d-minor-wab-109/1761925595",
      openUrl: "https://music.apple.com/us/album/bruckner-symphony-no-9-in-d-minor-wab-109/1761925595",
      query: "Carlo Maria Giulini Wiener Philharmoniker Bruckner Symphony No 9",
    },
    "/posts/janowski-berlioz-fantastique-king-lear.html": {
      title: "Berlioz: Symphonie fantastique",
      subtitle: "Marek Janowski · Pittsburgh Symphony Orchestra",
      embedUrl: "https://embed.music.apple.com/kr/album/berlioz-symphonie-fantastique/1729510665",
      openUrl: "https://music.apple.com/kr/album/berlioz-symphonie-fantastique/1729510665",
      query: "Marek Janowski Pittsburgh Symphony Orchestra Berlioz Symphonie fantastique",
    },
    "/posts/jacobs-figaro-marriage.html": {
      title: "Mozart: Le Nozze di Figaro",
      subtitle: "René Jacobs · Concerto Köln",
      embedUrl: "https://embed.music.apple.com/kr/album/mozart-le-nozze-di-figaro/632483938",
      openUrl: "https://music.apple.com/kr/album/mozart-le-nozze-di-figaro/632483938",
      query: "René Jacobs Le Nozze di Figaro Harmonia Mundi",
    },
  };

  const dailyFallbackPreviews = [
    knownPreviews["/posts/koroliov-haydn-piano-sonatas.html"],
    knownPreviews["/posts/gardiner-mendelssohn-4-5.html"],
    knownPreviews["/posts/giulini-bruckner-9.html"],
  ];

  function normalizePath(pathname) {
    return pathname.replace(/\/index\.html$/, "/").replace(/\/$/, "/");
  }

  function previewForPath(pathname) {
    const normalized = normalizePath(pathname);
    return knownPreviews[normalized] || knownPreviews[`${normalized}.html`] || null;
  }

  function appleEmbedFromLink(href) {
    try {
      const url = new URL(href);
      const isApple = url.hostname === "music.apple.com" || url.hostname === "classical.music.apple.com";
      if (!isApple || !url.pathname.includes("/album/") || url.pathname.includes("/search")) {
        return null;
      }
      url.hostname = "embed.music.apple.com";
      return url.toString();
    } catch (error) {
      return null;
    }
  }

  function recordCardPreviews() {
    return Array.from(document.querySelectorAll("#records .feature-card")).map((card) => {
      const href = card.getAttribute("href") || "";
      const cardPath = new URL(href, window.location.href).pathname;
      const known = previewForPath(cardPath);
      if (known) {
        return known;
      }

      const title = card.querySelector("h3")?.textContent?.trim() || "오늘의 음반";
      const subtitle = card.querySelector(".meta")?.textContent?.trim() || "Paul Archive Notes · 오늘의 음반";
      return {
        title,
        subtitle,
        embedUrl: "",
        openUrl: "",
        query: `${title} ${subtitle}`,
      };
    });
  }

  function pagePreviews() {
    const cards = recordCardPreviews();
    if (cards.length) {
      return cards;
    }

    const known = previewForPath(currentPath);
    if (known) {
      return [known];
    }

    const articleTitle = document.querySelector(".article h1")?.textContent?.trim();
    const recordTitle = document.querySelector(".article-note strong")?.textContent?.trim();
    const appleLink = Array.from(document.querySelectorAll('a[href*="music.apple.com"]'))
      .map((link) => link.href)
      .find((href) => appleEmbedFromLink(href));

    if (articleTitle && appleLink) {
      return [
        {
          title: recordTitle || articleTitle,
          subtitle: "Paul Archive Notes · Listening Preview",
          embedUrl: appleEmbedFromLink(appleLink),
          openUrl: appleLink,
          query: `${recordTitle || articleTitle} Paul Archive Notes`,
        },
      ];
    }

    if (document.querySelector(".article .eyebrow")?.textContent?.includes("Record Room")) {
      const title = recordTitle || articleTitle || "Bernstein Record Room";
      return [
        {
          title,
          subtitle: "Streaming search",
          embedUrl: "",
          openUrl: "",
          query: title,
        },
      ];
    }

    return dailyFallbackPreviews;
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

  const playlist = pagePreviews().filter(Boolean);
  let activeIndex = 0;
  const player = document.createElement("section");
  player.className = "audio-mini";
  player.setAttribute("aria-label", "오늘의 음악 미리 듣기");
  player.innerHTML = `
    <button class="audio-mini-toggle" type="button" aria-expanded="false" aria-label="오늘의 음악 미리 듣기">
      ${iconPlay()}
      <span>오늘의 음악</span>
    </button>
    <div class="audio-mini-panel" role="dialog" aria-label="오늘의 음악 미리 듣기">
      <div class="audio-mini-head">
        <div>
          <p class="audio-mini-kicker">Daily Pairing</p>
          <p class="audio-mini-title"></p>
          <p class="audio-mini-caption"></p>
        </div>
        <button class="audio-mini-close" type="button" aria-label="닫기">${iconClose()}</button>
      </div>
      <div class="audio-mini-track-list" aria-label="오늘의 음반 큐"></div>
      <div class="audio-mini-frame-wrap">
        <iframe class="audio-mini-frame" title="오늘의 음악 미리 듣기" allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write"></iframe>
        <p class="audio-mini-fallback">이 음반은 공식 임베드 링크를 확인한 뒤 플레이어로 바꿉니다.</p>
      </div>
      <div class="audio-mini-links"></div>
    </div>
  `;

  const navActions = document.querySelector(".masthead .nav-actions");
  if (navActions) {
    const searchButton = navActions.querySelector(".icon-button");
    navActions.insertBefore(player, searchButton || null);
  } else {
    player.classList.add("audio-mini-floating");
    document.body.appendChild(player);
  }

  const toggle = player.querySelector(".audio-mini-toggle");
  const close = player.querySelector(".audio-mini-close");
  const title = player.querySelector(".audio-mini-title");
  const caption = player.querySelector(".audio-mini-caption");
  const frame = player.querySelector(".audio-mini-frame");
  const links = player.querySelector(".audio-mini-links");
  const trackList = player.querySelector(".audio-mini-track-list");

  function renderLinks(preview) {
    const searchQuery = encodeURIComponent(preview.query || `${preview.title} ${preview.subtitle}`);
    links.innerHTML = `
      ${preview.openUrl ? `<a href="${escapeHtml(preview.openUrl)}" target="_blank" rel="noopener noreferrer">Apple Music</a>` : ""}
      <a href="https://open.spotify.com/search/${searchQuery}" target="_blank" rel="noopener noreferrer">Spotify</a>
      <a href="https://tidal.com/search?q=${searchQuery}" target="_blank" rel="noopener noreferrer">TIDAL</a>
    `;
  }

  function renderTrackList() {
    if (playlist.length <= 1) {
      trackList.hidden = true;
      return;
    }

    trackList.hidden = false;
    trackList.innerHTML = playlist
      .map(
        (preview, index) => `
          <button class="audio-mini-track" type="button" data-index="${index}" aria-pressed="${index === activeIndex ? "true" : "false"}">
            <span>${String(index + 1).padStart(2, "0")}</span>
            <strong>${escapeHtml(preview.title)}</strong>
          </button>
        `,
      )
      .join("");
  }

  function selectPreview(index) {
    activeIndex = index;
    const preview = playlist[activeIndex] || dailyFallbackPreviews[0];
    title.textContent = preview.title;
    caption.textContent = preview.subtitle;
    frame.title = `${preview.title} 미리 듣기`;
    frame.dataset.src = preview.embedUrl || "";
    if (frame.src && frame.src !== preview.embedUrl) {
      frame.removeAttribute("src");
    }
    player.classList.toggle("no-embed", !preview.embedUrl);
    renderLinks(preview);
    renderTrackList();

    if (player.classList.contains("is-open") && frame.dataset.src && !frame.src) {
      frame.src = frame.dataset.src;
    }
  }

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

  trackList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-index]");
    if (!button) {
      return;
    }
    event.stopPropagation();
    selectPreview(Number(button.dataset.index));
  });

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

  selectPreview(0);
})();
