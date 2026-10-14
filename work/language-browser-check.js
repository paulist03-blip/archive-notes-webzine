async (page) => {
  const base = new URL(page.url()).origin;
  const publicSite = base.startsWith('https:');
  const url = path => base + (publicSite ? path.replace(/\.html$/, '') : path);
  let mode = 'error';
  let delay = 0;
  let calls = 0;
  const payloads = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const context = page.context();
  await context.unroute('**/api/translate');
  await context.route('**/api/translate', async route => {
    calls++;
    const body = route.request().postDataJSON();
    payloads.push(body);
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    if (mode === 'error') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'not_configured', error: 'English translation is not connected yet.' }) });
      return;
    }
    const translations = body.items.map(item => ({ id: item.id, text:
      item.text === '산을 다시 보는 이유' ? 'Why We Look at the Mountain Again' :
      item.text.includes('산을 다시 보는 이유') && item.text.includes('Paul Archive Notes') ? 'Why We Look at the Mountain Again | Paul Archive Notes' :
      item.text.includes('철학') && item.text.length < 40 ? 'Philosophy' :
      item.text.length > 120 ? 'The painting offers a way of attending to the world through colour and the patient work of looking. Its details remain open to experience, bringing memory and perception into a continuing conversation.' :
      'The World of Art, Books, and Listening'
    }));
    try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ translations }) }); }
    catch (error) { if (!delay) throw error; }
  });
  const clear = async () => {
    await page.evaluate(() => { localStorage.removeItem('paulArchiveLanguage'); localStorage.removeItem('paulArchiveTranslations:v2'); document.cookie = 'paulArchiveLanguage=ko;path=/'; });
  };
  const ready = async target => {
    await target.waitForFunction(() => document.querySelector('.pan-language-switcher')?.dataset.state === 'idle' &&
      document.documentElement.lang === 'en' && !/[가-힣]/.test(document.querySelector('h1')?.textContent || ''), { timeout: 20000 });
  };
  const english = target => target.locator('button[data-language=en]');
  const korean = target => target.locator('button[data-language=ko]');
  await clear();
  const lead = '/posts/cezanne-mont-sainte-victoire-met.html';
  await page.goto(url(lead), { waitUntil: 'domcontentloaded' });
  const original = await page.evaluate(() => ({ title: document.title, paragraphs: [...document.querySelectorAll('.article-body p')].map(p => p.innerHTML),
    links: [...document.querySelectorAll('.article a')].map(a => a.getAttribute('href')) }));
  await english(page).click();
  await page.waitForFunction(() => document.querySelector('.pan-language-switcher').dataset.state === 'error');
  if (await page.evaluate(() => localStorage.getItem('paulArchiveLanguage')) !== 'en') throw new Error('Preference lost on error');
  if (!(await page.locator('[data-language-retry]').isVisible())) throw new Error('No retry control');
  mode = 'success';
  await page.locator('[data-language-retry]').click();
  await ready(page);
  if (await page.title() !== 'Why We Look at the Mountain Again | Paul Archive Notes') throw new Error('Title not translated');
  if (await page.locator('.issue-pagination-direction').textContent() !== '←Previous · Issue 71') throw new Error('Issue navigation not translated');
  if (JSON.stringify(await page.locator('.article a').evaluateAll(links => links.map(a => a.getAttribute('href')))) !== JSON.stringify(original.links)) throw new Error('Links changed');
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => document.fonts.ready);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('English overflow: ' + width);
    if (width !== 320) await page.screenshot({ path: `output/playwright/language-${publicSite ? 'public' : 'local'}-${width}.png` });
  }
  const beforeReload = calls;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready(page);
  if (calls !== beforeReload) throw new Error('Cached article was requested again');
  const another = await context.newPage();
  await another.goto(url('/posts/seurat-forest-pontaubert.html'), { waitUntil: 'domcontentloaded' });
  await ready(another);
  if (await another.locator('button[data-language=en]').getAttribute('aria-pressed') !== 'true') throw new Error('Cross-page preference missing');
  await korean(page).click();
  await another.waitForFunction(() => document.documentElement.lang === 'ko');
  await another.close();
  const restored = await page.evaluate(() => ({ title: document.title, paragraphs: [...document.querySelectorAll('.article-body p')].map(p => p.innerHTML) }));
  if (restored.title !== original.title || JSON.stringify(restored.paragraphs) !== JSON.stringify(original.paragraphs)) throw new Error('Korean source not restored exactly');
  await page.evaluate(() => {
    const p = document.createElement('p'); p.id = 'language-dynamic-test';
    p.innerHTML = '새로 나타난 문장을 읽는다. <a href="../archive.html">읽기의 기록</a>';
    document.querySelector('.article-body').appendChild(p);
    const input = document.createElement('input'); input.id = 'language-input-test'; input.value = '사용자가 쓴 비공개 입력';
    document.querySelector('.article-body').appendChild(input);
  });
  await english(page).click();
  await ready(page);
  await page.waitForFunction(() => !/[가-힣]/.test(document.querySelector('#language-dynamic-test').textContent));
  if (await page.locator('#language-input-test').inputValue() !== '사용자가 쓴 비공개 입력') throw new Error('Private input changed');
  if (payloads.some(body => body.items.some(item => item.text.includes('비공개 입력')))) throw new Error('Private input sent');
  await page.evaluate(() => { document.querySelector('#language-dynamic-test').firstChild.nodeValue = '새로 고친 문장의 의미를 살린다. '; });
  await page.waitForFunction(() => !/[가-힣]/.test(document.querySelector('#language-dynamic-test').textContent));
  await korean(page).click();
  if (!(await page.locator('#language-dynamic-test').textContent()).includes('새로 고친 문장의 의미를 살린다.')) throw new Error('Dynamic source not restored');
  await clear();
  await page.goto(url(lead), { waitUntil: 'domcontentloaded' });
  delay = 900;
  await english(page).click();
  await page.waitForFunction(() => document.querySelector('.pan-language-switcher').dataset.state === 'loading');
  await korean(page).click();
  await page.waitForTimeout(1100);
  if (await page.locator('h1').textContent() !== '산을 다시 보는 이유') throw new Error('Late request overwrote Korean');
  delay = 0;
  await page.goto(url('/book-archive.html'), { waitUntil: 'domcontentloaded' });
  const values = await page.locator('[data-book-theme] option').evaluateAll(options => options.map(o => o.value));
  await english(page).click();
  await ready(page);
  if (await page.locator('[data-book-search]').getAttribute('placeholder') !== 'Search by title, author, or publisher') throw new Error('Search placeholder untranslated');
  if (JSON.stringify(await page.locator('[data-book-theme] option').evaluateAll(options => options.map(o => o.value))) !== JSON.stringify(values)) throw new Error('Filter values changed');
  await page.locator('[data-book-search]').fill('philosophy');
  await page.waitForFunction(() => document.querySelector('[data-book-list] .book-card'));
  if (await page.locator('[data-book-list] .book-card').count() < 1) throw new Error('English search failed');
  await page.locator('[data-book-search]').fill('바흐');
  await page.locator('[data-book-list] .book-card').first().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('[data-book-list] .book-card h3') && !/[가-힣]/.test(document.querySelector('[data-book-list] .book-card h3').textContent));
  if (await page.locator('[data-book-search]').inputValue() !== '바흐') throw new Error('Search input translated');
  await korean(page).click();
  if (!/[가-힣]/.test(await page.locator('[data-book-list] .book-card h3').first().textContent())) throw new Error('Filtered books not restored');
  await page.locator('[data-book-search]').fill('');
  await page.locator('[data-book-theme]').selectOption(values[1]);
  if (!(await page.locator('[data-book-list] .book-card').count())) throw new Error('Theme filter broke');
  await english(page).click();
  await ready(page);
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Book archive overflow');
  const requestsBeforeArchive = calls;
  await page.goto(url('/archive.html'), { waitUntil: 'domcontentloaded' });
  await ready(page);
  const archiveInitialRequests = calls - requestsBeforeArchive;
  if (archiveInitialRequests > 8) throw new Error('Archive eagerly translates the entire collection');
  await page.locator('.archive-row').last().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => !/[가-힣]/.test([...document.querySelectorAll('.archive-row h3')].at(-1).textContent));
  await korean(page).click();
  const largeStart = calls;
  await page.evaluate(() => {
    const area = document.createElement('section'); area.id = 'language-large-test';
    for (let i = 0; i < 1400; i++) {
      const p = document.createElement('p'); p.textContent = '번역 캐시 용량을 넘는 별도의 문장 ' + i;
      area.appendChild(p);
    }
    document.body.appendChild(area);
  });
  await english(page).click();
  await page.waitForFunction(() => document.querySelector('.pan-language-switcher').dataset.state === 'idle' &&
    [...document.querySelectorAll('#language-large-test p')].every(p => !/[가-힣]/.test(p.textContent)), { timeout: 30000 });
  if (calls - largeStart > 55) throw new Error('Cache eviction repeatedly retranslates the current page');
  await korean(page).click();
  await page.evaluate(() => document.querySelector('#language-large-test').remove());
  const surfaces = ['/', '/book-review-board.html', '/forum.html', '/daily-ai-work.html', '/ai-work-mobile.html', '/animal-liberation-medical-lab.html', '/apple-tv-review.html', '/posts/ai-work-2026-09-05.html'];
  for (const path of surfaces) {
    await page.goto(url(path), { waitUntil: 'domcontentloaded' });
    if (await page.locator('.pan-language-switcher').count() !== 1) throw new Error('Missing switcher: ' + path);
  }
  const restricted = await context.newPage();
  await restricted.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage blocked', 'SecurityError'); } }));
  await restricted.goto(url(lead), { waitUntil: 'domcontentloaded' });
  await english(restricted).click();
  await ready(restricted);
  await restricted.goto(url('/posts/seurat-forest-pontaubert.html'), { waitUntil: 'domcontentloaded' });
  await ready(restricted);
  await restricted.close();
  await clear();
  await context.unroute('**/api/translate');
  if (errors.length) throw new Error('Runtime errors: ' + errors.join('; '));
  return { passed: true, backend: 'stubbed for interaction tests, not real translation', requests: calls,
    viewportWidths: [1280, 390, 320], preferenceAcrossPagesAndTabs: true, exactKoreanRestore: true,
    requestCancellation: true, dynamicContent: true, filtersAndInputPreserved: true,
    archiveInitialRequests, additionalPageTypes: surfaces.length, errorAndRetry: true,
    storageUnavailableFallback: true, largePageCacheEviction: true };
}
