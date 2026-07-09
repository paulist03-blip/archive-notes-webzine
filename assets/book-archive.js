(function () {
  const data = window.PAUL_BOOK_ARCHIVE;

  if (!data) {
    return;
  }

  const dailyTarget = document.querySelector("[data-book-daily]");
  const listTarget = document.querySelector("[data-book-list]");
  const countTarget = document.querySelector("[data-book-count]");
  const sourceTarget = document.querySelector("[data-book-source]");
  const searchInput = document.querySelector("[data-book-search]");
  const themeSelect = document.querySelector("[data-book-theme]");

  const cleanMeta = (value) =>
    String(value || "")
      .split(/[·|]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .filter(
        (part) =>
          !/^(?:ISBN|ItemId)/i.test(part) &&
          !/(?:전\s*\d+\s*권|양장본?|반양장|개정판|\d+\s*쪽|UHQCD|SHM-CD|SACD|MQA|Hybrid|\d+CD|수입반|중고|최상|상태)/i.test(part)
      )
      .slice(0, 4)
      .join(" · ");

  const escapeHtml = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const isExternalUrl = (url) => /^https?:\/\//.test(url);

  const linkAttributes = (url, className) => {
    const attrs = [`href="${escapeHtml(url)}"`];
    if (className) {
      attrs.unshift(`class="${className}"`);
    }
    if (isExternalUrl(url)) {
      attrs.push('target="_blank"', 'rel="noopener noreferrer"');
    }
    return attrs.join(" ");
  };

  const bookAnchorId = (book) => `book-${String(book.id).replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const reviewStatusLabel = (book) => (book.reviewUrl ? "우리 리뷰" : "리뷰 준비 중");

  const bookImage = (book) => `
    ${
      book.reviewUrl
        ? `<a ${linkAttributes(book.reviewUrl, "book-cover-frame")} aria-label="${escapeHtml(`${book.title} 리뷰 읽기`)}">
            <img src="${escapeHtml(book.imageUrl)}" alt="${escapeHtml(book.title)} 표지" loading="lazy" />
            <span class="book-cover-badge">Review</span>
          </a>`
        : `<div class="book-cover-frame book-cover-frame--pending" aria-label="${escapeHtml(`${book.title} 리뷰 준비 중`)}">
            <img src="${escapeHtml(book.imageUrl)}" alt="${escapeHtml(book.title)} 표지" loading="lazy" />
            <span class="book-cover-badge">Queue</span>
          </div>`
    }
  `;

  const bookTitle = (book) =>
    book.reviewUrl
      ? `<a ${linkAttributes(book.reviewUrl)}>${escapeHtml(book.title)}</a>`
      : escapeHtml(book.title);

  const bookActions = (book) => `
    <div class="book-card-actions">
      ${
        book.reviewUrl
          ? `<a ${linkAttributes(book.reviewUrl, "preview-link")}>우리 리뷰 읽기</a>`
          : '<span class="preview-link preview-link--disabled">리뷰 준비 중</span>'
      }
      <a ${linkAttributes(book.itemUrl, "book-secondary-link")}>외부 링크</a>
    </div>
  `;

  function renderSource() {
    if (!sourceTarget) return;
    sourceTarget.innerHTML = `
      <strong>기준 서가</strong>
      <span>${escapeHtml(data.source.capturedAt)} 기준 선별 · ${data.source.eligibleCount}권 리뷰 큐</span>
      <a href="${escapeHtml(data.source.url)}" target="_blank" rel="noopener noreferrer">기준 서가 열기</a>
    `;
  }

  function renderDaily() {
    if (!dailyTarget) return;
    dailyTarget.innerHTML = data.dailyPicks
      .map(
        (book) => `
          <article class="book-daily-card" id="${escapeHtml(bookAnchorId(book))}">
            ${bookImage(book)}
            <div class="book-daily-body">
              <span class="category">${escapeHtml(book.label || book.theme)}</span>
              <h3>${bookTitle(book)}</h3>
              <p class="book-subtitle">${escapeHtml(book.subtitle || "")}</p>
              <p>${escapeHtml(book.review || "")}</p>
              <div class="book-card-meta">${escapeHtml(cleanMeta(book.metadata))}</div>
              ${bookActions(book)}
            </div>
          </article>
        `
      )
      .join("");
  }

  function renderThemeOptions() {
    if (!themeSelect) return;
    const themes = Array.from(new Set(data.books.map((book) => book.theme))).sort((a, b) =>
      a.localeCompare(b, "ko")
    );
    themeSelect.innerHTML = [
      '<option value="all">전체 주제</option>',
      ...themes.map((theme) => `<option value="${escapeHtml(theme)}">${escapeHtml(theme)}</option>`),
    ].join("");
  }

  function filteredBooks() {
    const query = (searchInput && searchInput.value.trim().toLowerCase()) || "";
    const theme = (themeSelect && themeSelect.value) || "all";
    return data.books.filter((book) => {
      const inTheme = theme === "all" || book.theme === theme;
      const haystack = `${book.title} ${book.metadata} ${book.theme}`.toLowerCase();
      return inTheme && (!query || haystack.includes(query));
    });
  }

  function renderList() {
    if (!listTarget) return;
    const books = filteredBooks();

    if (countTarget) {
      countTarget.textContent = `${books.length}권 표시 / ${data.source.eligibleCount}권 보관`;
    }

    if (!books.length) {
      listTarget.innerHTML = '<p class="book-empty">검색 조건에 맞는 책이 없습니다.</p>';
      return;
    }

    listTarget.innerHTML = books
      .map(
        (book) => `
          <article class="book-card" id="${escapeHtml(bookAnchorId(book))}">
            ${bookImage(book)}
            <div class="book-card-body">
              <div class="book-card-topline">
                <span>${escapeHtml(book.theme)}</span>
                <em>${escapeHtml(reviewStatusLabel(book))}</em>
              </div>
              <h3>${bookTitle(book)}</h3>
              <p>${escapeHtml(cleanMeta(book.metadata))}</p>
              ${bookActions(book)}
            </div>
          </article>
        `
      )
      .join("");
  }

  renderSource();
  renderDaily();
  renderThemeOptions();
  renderList();

  if (searchInput) {
    searchInput.addEventListener("input", renderList);
  }

  if (themeSelect) {
    themeSelect.addEventListener("change", renderList);
  }
})();
