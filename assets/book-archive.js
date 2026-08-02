(function () {
  const data = window.PAUL_BOOK_ARCHIVE;

  if (!data) {
    return;
  }

  const dailyTarget = document.querySelector("[data-book-daily]");
  const listTarget = document.querySelector("[data-book-list]");
  const countTarget = document.querySelector("[data-book-count]");
  const searchInput = document.querySelector("[data-book-search]");
  const themeSelect = document.querySelector("[data-book-theme]");

  const explicitlyExcludedTitles = new Set([
    "모두의 미술사",
    "안데르센 메르헨",
    "피카소와 나",
    "헤르메스 이야기",
    "뮤지엄",
  ]);

  const foreignLanguagePattern =
    /(영어|영문|프랑스어|독일어|일본어|중국어|스페인어|라틴어|외국어|토익|토플|어학)/i;
  const cookingAndHomePattern =
    /(요리|레시피|쿡북|베이킹|디저트|가정식|반찬|살림법|정리수납|집안일|청소법|수납법)/i;
  const youthPattern =
    /(청소년|어린이|아동문학|사춘기|그림책|초등학생|중학생|고등학생|수험서|문제집|참고서)/i;

  const isArchiveEligible = (book) => {
    const title = String(book.title || "");
    const searchable = `${title} ${book.theme || ""}`;
    return (
      !explicitlyExcludedTitles.has(title) &&
      !foreignLanguagePattern.test(title) &&
      !cookingAndHomePattern.test(searchable) &&
      !youthPattern.test(title)
    );
  };

  const archiveBooks = data.books.filter(isArchiveEligible);

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

  const reviewStatusLabel = (book) => (book.reviewUrl ? "장문 리뷰" : "원고 준비 중");

  const bookImage = (book) => `
    ${
      book.reviewUrl
        ? `<a ${linkAttributes(book.reviewUrl, "book-cover-frame")} aria-label="${escapeHtml(`${book.title} 리뷰 읽기`)}">
            <img src="${escapeHtml(book.imageUrl)}" alt="${escapeHtml(book.title)} 표지" loading="lazy" />
            <span class="book-cover-badge">Essay</span>
          </a>`
        : `<div class="book-cover-frame book-cover-frame--pending" aria-label="${escapeHtml(`${book.title} 리뷰 준비 중`)}">
            <img src="${escapeHtml(book.imageUrl)}" alt="${escapeHtml(book.title)} 표지" loading="lazy" />
            <span class="book-cover-badge">Next</span>
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
          ? `<a ${linkAttributes(book.reviewUrl, "preview-link")}>장문 리뷰 읽기</a>`
          : '<span class="preview-link preview-link--disabled">원고 준비 중</span>'
      }
    </div>
  `;

  function renderDaily() {
    if (!dailyTarget) return;
    dailyTarget.innerHTML = data.dailyPicks
      .filter(isArchiveEligible)
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
    const themes = Array.from(new Set(archiveBooks.map((book) => book.theme))).sort((a, b) =>
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
    return archiveBooks.filter((book) => {
      const inTheme = theme === "all" || book.theme === theme;
      const haystack = `${book.title} ${book.metadata} ${book.theme}`.toLowerCase();
      return inTheme && (!query || haystack.includes(query));
    });
  }

  function renderList() {
    if (!listTarget) return;
    const books = filteredBooks();

    if (countTarget) {
      countTarget.textContent = `${books.length}권의 기록`;
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
