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

  const escapeHtml = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const bookImage = (book) => `
    <a class="book-cover-frame" href="${escapeHtml(book.itemUrl)}" target="_blank" rel="noopener noreferrer">
      <img src="${escapeHtml(book.imageUrl)}" alt="${escapeHtml(book.title)} 표지" loading="lazy" />
    </a>
  `;

  function renderSource() {
    if (!sourceTarget) return;
    sourceTarget.innerHTML = `
      <strong>${escapeHtml(data.source.label)}</strong>
      <span>${escapeHtml(data.source.seller)} 서가 · ${escapeHtml(data.source.capturedAt)} 수집 · ${data.source.pagesScanned}페이지 스캔 · ${data.source.eligibleCount}권 리뷰 큐</span>
      <a href="${escapeHtml(data.source.url)}" target="_blank" rel="noopener noreferrer">기준 서가 열기</a>
    `;
  }

  function renderDaily() {
    if (!dailyTarget) return;
    dailyTarget.innerHTML = data.dailyPicks
      .map(
        (book) => `
          <article class="book-daily-card">
            ${bookImage(book)}
            <div class="book-daily-body">
              <span class="category">${escapeHtml(book.label || book.theme)}</span>
              <h3>${escapeHtml(book.title)}</h3>
              <p class="book-subtitle">${escapeHtml(book.subtitle || "")}</p>
              <p>${escapeHtml(book.review || "")}</p>
              <div class="book-card-meta">${escapeHtml(book.metadata)}</div>
              <a class="preview-link" href="${escapeHtml(book.itemUrl)}" target="_blank" rel="noopener noreferrer">알라딘 원문 보기</a>
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
          <article class="book-card">
            ${bookImage(book)}
            <div class="book-card-body">
              <div class="book-card-topline">
                <span>${escapeHtml(book.theme)}</span>
                <em>${escapeHtml(book.reviewStatus)}</em>
              </div>
              <h3>${escapeHtml(book.title)}</h3>
              <p>${escapeHtml(book.metadata)}</p>
              <a href="${escapeHtml(book.itemUrl)}" target="_blank" rel="noopener noreferrer">원문 링크</a>
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
